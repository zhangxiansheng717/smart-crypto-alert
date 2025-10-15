const { BinanceService } = require('./binance');
const { TelegramService } = require('./telegram');
const { PositionTracker } = require('./position-tracker');
const { TelegramCommands } = require('./telegram-commands');
const { AmbushScanner } = require('../scanners/ambush-scanner');
const { analyzePatterns, getPatternRecommendation } = require('../patterns/pattern-fusion');
const { logger } = require('../utils/logger');

class MultiTimeframeMonitor {
  constructor(config) {
    this.config = config;
    this.binance = new BinanceService(config);
    this.telegram = new TelegramService(config, true); // Enable polling for commands
    this.ambushScanner = new AmbushScanner(this.binance, config);
    this.positionTracker = new PositionTracker(this.binance, this.telegram, config);
    this.commands = null; // Will be initialized after symbols are fetched
    this.symbols = [];
    this.intervals = [];
    this.btcMarketCondition = { trend: 'neutral', adx: 0 }; // BTC market filter

    // Determine enabled intervals
    for (const [interval, enabled] of Object.entries(config.monitor.enable)) {
      if (enabled) {
        this.intervals.push(interval);
      }
    }

    logger.info(`Enabled intervals: ${this.intervals.join(', ')}`);
  }

  /**
   * Start monitoring
   */
  async start() {
    // Fetch symbols
    this.symbols = await this.binance.getUSDTSymbols();
    if (this.symbols.length === 0) {
      logger.error('No symbols fetched. Exiting.');
      return;
    }

    // Initialize Telegram command handler
    this.commands = new TelegramCommands(
      this.telegram.bot,
      this.telegram.chatId,
      this.binance,
      this.positionTracker,
      this.ambushScanner,
      this.config
    );
    await this.commands.init();

    // Start position tracker监控
    this.positionTracker.startMonitoring();

    // Start monitoring loops for each interval (REMOVED - no auto alerts)
    // for (const interval of this.intervals) {
    //   this.startIntervalMonitor(interval);
    // }

    // Start ambush scanner (runs daily at 8 AM)
    this.startAmbushScanner();

    // Check watchlist for entries every 5 minutes (优化：从1小时改为5分钟)
    this.startWatchlistMonitor();
    
    logger.info('✅ All services started:');
    logger.info('  - Telegram command handler (query on demand)');
    logger.info('  - Position tracker (every 5 min)');
    logger.info('  - Ambush scanner (daily 8 AM)');
    logger.info('  - Watchlist monitor (every 5 min)');
  }

  /**
   * Update BTC market condition (trend filter)
   */
  async updateBTCCondition() {
    const btcData = await this.binance.processSymbol('BTCUSDT', '1h', this.config.monitor.volumeMedianPeriods);
    if (btcData) {
      this.btcMarketCondition = {
        trend: btcData.trend,
        adx: btcData.adx,
        ema7: btcData.ema7,
        ema25: btcData.ema25,
      };
      logger.info(`BTC Market: ${btcData.trend} | ADX: ${btcData.adx} | EMA7: ${btcData.ema7.toFixed(2)} | EMA25: ${btcData.ema25.toFixed(2)}`);
    }
  }

  /**
   * Start monitor loop for a specific interval
   */
  startIntervalMonitor(interval) {
    const checkIntervalMs = this.getCheckInterval(interval);

    const check = async () => {
      // Update BTC condition every check (for altcoin filtering)
      await this.updateBTCCondition();

      logger.info(`[${interval}] Scanning ${this.symbols.length} symbols...`);
      const startTime = Date.now();

      const results = await this.binance.processAllSymbols(
        this.symbols,
        interval,
        this.config.monitor.concurrencyLimit,
        this.config.monitor.volumeMedianPeriods
      );

      const threshold = this.config.monitor.thresholds[interval] || 0;
      const minVolMultiplier = this.config.monitor.minVolumeMultiplier;

      const candidates = results.filter(r => {
        const exceedsThreshold = Math.abs(r.priceChange) >= threshold;
        const exceedsVolume = r.volumeMultiplier >= minVolMultiplier;
        return exceedsThreshold && exceedsVolume;
      });

      // Sort by intensity (volume * price change)
      candidates.sort((a, b) => {
        const aScore = Math.abs(a.priceChange) * a.volumeMultiplier;
        const bScore = Math.abs(b.priceChange) * b.volumeMultiplier;
        return bScore - aScore;
      });

      logger.info(`[${interval}] Found ${candidates.length} candidates in ${Date.now() - startTime}ms.`);

      // Send alerts with BTC market condition and pattern analysis
      for (const candidate of candidates) {
        candidate.btcMarketCondition = this.btcMarketCondition; // Attach BTC context
        
        // Analyze patterns if klines available
        if (candidate.klines && candidate.klines.length >= 20) {
          const patternAnalysis = await analyzePatterns(candidate.klines, {
            rsi: candidate.rsi,
            ema7: candidate.ema7,
            ema25: candidate.ema25,
            adx: candidate.adx,
            trend: candidate.trend,
            volumeMultiplier: candidate.volumeMultiplier,
          });
          
          candidate.patternAnalysis = patternAnalysis;
          candidate.patternRecommendation = getPatternRecommendation(
            patternAnalysis,
            candidate.currentPrice,
            candidate.priceChange > 0 ? 'up' : 'down'
          );
        }
        
        await this.telegram.sendAlert(candidate);
      }

      // Display top 3
      if (candidates.length > 0) {
        const top3 = candidates.slice(0, 3);
        logger.info(`[${interval}] Top 3:`);
        top3.forEach((c, i) => {
          logger.info(`  ${i + 1}. ${c.symbol} ${c.priceChange > 0 ? '+' : ''}${c.priceChange.toFixed(2)}% | Vol: ${c.volumeMultiplier.toFixed(1)}x | RSI: ${c.rsi.toFixed(0)} | ADX: ${c.adx}`);
        });
      }
    };

    // Initial check
    check();

    // Periodic check
    setInterval(check, checkIntervalMs);
  }

  /**
   * Get check interval in ms
   */
  getCheckInterval(interval) {
    const map = {
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
    };
    return map[interval] || 60 * 1000;
  }

  /**
   * Start ambush scanner (每6小时：2点, 8点, 14点, 20点)
   * 优化：融合日线+小时线，更频繁捕获机会
   */
  startAmbushScanner() {
    const runScan = async () => {
      logger.info('[Ambush Scanner] Starting scan (日线+小时线融合)...');
      try {
        const candidates = await this.ambushScanner.scanMarket(this.symbols);
        
        if (candidates.length > 0) {
          await this.telegram.sendAmbushReport(candidates.slice(0, 15)); // Top 15（增加显示数量）
          logger.info(`[Ambush Scanner] Sent report with ${candidates.length} candidates`);
        } else {
          logger.info('[Ambush Scanner] No candidates found');
        }
      } catch (error) {
        logger.error(`[Ambush Scanner] Error: ${error.message}`);
      }
    };

    // 定义扫描时间点（每6小时：2点, 8点, 14点, 20点）
    const scanHours = [2, 8, 14, 20];
    
    const scheduleNextScan = () => {
      const now = new Date();
      const currentHour = now.getHours();
      
      // 找到下一个扫描时间
      let nextHour = scanHours.find(h => h > currentHour);
      if (!nextHour) {
        nextHour = scanHours[0]; // 明天第一个时间
      }
      
      const nextScan = new Date(now);
      if (nextHour <= currentHour) {
        nextScan.setDate(nextScan.getDate() + 1);
      }
      nextScan.setHours(nextHour, 0, 0, 0);
      
      const msUntilNext = nextScan - now;
      const minutesUntilNext = Math.floor(msUntilNext / 1000 / 60);
      
      logger.info(`[Ambush Scanner] Next scan at ${nextScan.toLocaleString()} (in ${minutesUntilNext} minutes)`);
      
      setTimeout(() => {
        runScan();
        scheduleNextScan(); // 递归调度下一次
      }, msUntilNext);
    };
    
    // 启动时检查是否需要立即扫描
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    // 如果在扫描时间点的前后15分钟内，立即执行
    if (scanHours.includes(currentHour) && currentMinute < 30) {
      logger.info('[Ambush Scanner] Running immediate scan...');
      runScan();
    } else if (scanHours.includes(currentHour - 1) && currentMinute > 45) {
      logger.info('[Ambush Scanner] Running immediate scan (near scan time)...');
      runScan();
    }
    
    // 调度下一次扫描
    scheduleNextScan();
    
    logger.info('[Ambush Scanner] Configured to run every 6 hours (2:00, 8:00, 14:00, 20:00)');
  }

  /**
   * Start watchlist monitor (checks for entry signals every 5 minutes)
   * 优化：从1小时改为5分钟，捕捉山寨币快速启动
   */
  startWatchlistMonitor() {
    const checkWatchlist = async () => {
      try {
        const entrySignals = await this.ambushScanner.checkWatchlistForEntries();
        
        if (entrySignals.length > 0) {
          for (const signal of entrySignals) {
            await this.telegram.sendEntrySignal(signal);
          }
          logger.info(`[Watchlist] Sent ${entrySignals.length} entry signals`);
        }
      } catch (error) {
        logger.error(`[Watchlist] Error: ${error.message}`);
      }
    };

    // Run every 5 minutes (优化：更快捕捉山寨币启动)
    setInterval(checkWatchlist, 5 * 60 * 1000);
    
    // Initial check after 2 minutes
    setTimeout(checkWatchlist, 2 * 60 * 1000);

    logger.info('[Watchlist] Monitor started (checking every 5 minutes for entry signals)');
  }
}

module.exports = { MultiTimeframeMonitor };

