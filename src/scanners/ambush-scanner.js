/**
 * 埋伏币扫描器 - 寻找底部筑底即将反转的币种
 */

const { logger } = require('../utils/logger');

class AmbushScanner {
  constructor(binanceService, config) {
    this.binance = binanceService;
    this.config = config;
    this.watchlist = new Map(); // 观察池：交易对 -> { 评分, 加入时间, 数据 }
  }

  /**
   * 扫描市场寻找埋伏机会（融合日线+小时线）
   * @param {Array} symbols - 要扫描的交易对列表
   * @returns {Array} 按评分排序的高潜力币种
   */
  async scanMarket(symbols) {
    logger.info(`[埋伏币扫描] 正在扫描 ${symbols.length} 个币种（日线+小时线融合）...`);
    const startTime = Date.now();

    const candidates = [];

    // 分批处理
    const batchSize = this.config.monitor.concurrencyLimit || 10;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const promises = batch.map(symbol => this.evaluateSymbolFusion(symbol));
      const results = await Promise.all(promises);
      
      // 降低阈值到7分（因为加入了小时线动态加分）
      const validResults = results.filter(r => r !== null && r.totalScore >= 7);
      candidates.push(...validResults);
    }

    // 按总分降序排序
    candidates.sort((a, b) => b.totalScore - a.totalScore);

    logger.info(`[埋伏币扫描] 发现 ${candidates.length} 个候选币种，耗时 ${Date.now() - startTime}ms`);

    // 更新观察池
    this.updateWatchlist(candidates);

    return candidates.slice(0, 20); // 返回前20名
  }

  /**
   * 融合评估：日线（底部形态） + 小时线（动态信号）
   */
  async evaluateSymbolFusion(symbol) {
    try {
      // 1. 日线分析（底部形态，0-15分）
      const dailyKlines = await this.binance.getKlines(symbol, '1d', 60);
      if (!dailyKlines || dailyKlines.length < 60) return null;

      const dailyData = this.processKlineData(dailyKlines);
      if (!dailyData) return null;

      const dailyScore = this.calculateAmbushScore(dailyData, symbol);
      
      // 2. 小时线分析（动态信号，0-10分）
      const hourlyKlines = await this.binance.getKlines(symbol, '1h', 100);
      if (!hourlyKlines || hourlyKlines.length < 100) {
        // 小时线数据缺失，仅使用日线评分
        if (dailyScore >= 8) {
          return {
            symbol,
            dailyScore,
            hourlyScore: 0,
            totalScore: dailyScore,
            scoreBreakdown: '仅日线',
            ...dailyData,
            timestamp: Date.now(),
          };
        }
        return null;
      }

      const hourlyData = this.processHourlyData(hourlyKlines, dailyData);
      const hourlyScore = this.calculateHourlyScore(hourlyData);
      
      // 3. 融合评分（日线权重70%，小时线权重30%）
      const totalScore = Math.round(dailyScore * 0.7 + hourlyScore * 0.3 + hourlyScore * 0.5);
      // 小时线额外加成：如果小时线信号强，额外加0.5倍小时线分数
      
      if (totalScore >= 7) { // 降低阈值，因为有小时线加成
        return {
          symbol,
          dailyScore,
          hourlyScore,
          totalScore,
          scoreBreakdown: `日线${dailyScore}分 + 小时线${hourlyScore}分`,
          hourlySignals: hourlyData.signals,
          ...dailyData,
          timestamp: Date.now(),
        };
      }

      return null;
    } catch (error) {
      logger.debug(`Failed to evaluate ${symbol}: ${error.message}`);
      return null;
    }
  }

  /**
   * Evaluate a single symbol for ambush potential (原方法保留)
   */
  async evaluateSymbol(symbol) {
    try {
      // Get 60-day data for comprehensive analysis
      const klines = await this.binance.getKlines(symbol, '1d', 60);
      if (!klines || klines.length < 60) return null;

      const processedData = this.processKlineData(klines);
      if (!processedData) return null;

      const score = this.calculateAmbushScore(processedData, symbol);
      
      if (score >= 8) {
        return {
          symbol,
          score,
          ...processedData,
          timestamp: Date.now(),
        };
      }

      return null;
    } catch (error) {
      logger.debug(`Failed to evaluate ${symbol}: ${error.message}`);
      return null;
    }
  }

  /**
   * Process kline data and calculate indicators
   */
  processKlineData(klines) {
    if (!klines || klines.length < 60) return null;

    const closes = klines.map(k => k.close);
    const highs = klines.map(k => k.high);
    const lows = klines.map(k => k.low);
    const volumes = klines.map(k => k.volume);

    const currentPrice = closes[closes.length - 1];
    const previousPrice = closes[closes.length - 2];

    // Calculate price positions
    const high30d = Math.max(...highs.slice(-30));
    const low60d = Math.min(...lows);
    const high60d = Math.max(...highs);

    const drawdownFrom30dHigh = (high30d - currentPrice) / high30d;
    const distanceFromLow = (currentPrice - low60d) / low60d;

    // Simple EMA calculation
    const ema7 = this.calculateSimpleEMA(closes, 7);
    const ema25 = this.calculateSimpleEMA(closes, 25);
    const prevEma7 = this.calculateSimpleEMA(closes.slice(0, -1), 7);
    const prevEma25 = this.calculateSimpleEMA(closes.slice(0, -1), 25);

    // Check EMA golden cross proximity
    const emaGap = (ema7 - ema25) / ema25;
    const emaDirection = ema7 > prevEma7 && ema25 > prevEma25 ? 'rising' : (ema7 < prevEma7 ? 'falling' : 'flat');

    // Simple RSI calculation
    const rsi = this.calculateSimpleRSI(closes, 14);
    const prevRsi = this.calculateSimpleRSI(closes.slice(0, -1), 14);
    const rsiRising = rsi > prevRsi;

    // Volume analysis
    const recentVolumes = volumes.slice(-5);
    const avgVolume = volumes.slice(-20, -5).reduce((a, b) => a + b, 0) / 15;
    const currentVolume = volumes[volumes.length - 1];
    const volumeTrend = recentVolumes.reduce((a, b) => a + b, 0) / 5 / avgVolume;

    // Check for consolidation days (price staying below EMA25)
    let consolidationDays = 0;
    for (let i = closes.length - 1; i >= 0 && i >= closes.length - 20; i--) {
      if (closes[i] < this.calculateSimpleEMA(closes.slice(0, i + 1), 25)) {
        consolidationDays++;
      } else {
        break;
      }
    }

    // Latest quote volume
    const quoteVolume = klines[klines.length - 1].quoteVolume;

    return {
      currentPrice,
      high30d,
      low60d,
      high60d,
      drawdownFrom30dHigh,
      distanceFromLow,
      ema7,
      ema25,
      emaGap,
      emaDirection,
      rsi,
      prevRsi,
      rsiRising,
      consolidationDays,
      volumeTrend,
      quoteVolume,
      priceChange: ((currentPrice - previousPrice) / previousPrice) * 100,
    };
  }

  /**
   * 处理小时线数据（捕捉动态信号）
   */
  processHourlyData(klines, dailyContext) {
    if (!klines || klines.length < 100) return null;

    const closes = klines.map(k => k.close);
    const highs = klines.map(k => k.high);
    const lows = klines.map(k => k.low);
    const volumes = klines.map(k => k.volume);

    const currentPrice = closes[closes.length - 1];
    const price24hAgo = closes[closes.length - 24] || closes[0];
    
    // 计算小时线EMA
    const ema7 = this.calculateSimpleEMA(closes, 7);
    const ema25 = this.calculateSimpleEMA(closes, 25);
    const prevEma7 = this.calculateSimpleEMA(closes.slice(0, -1), 7);
    const prevEma25 = this.calculateSimpleEMA(closes.slice(0, -1), 25);
    
    const emaGap = (ema7 - ema25) / ema25;
    const emaGapNarrowing = Math.abs(emaGap) < Math.abs((prevEma7 - prevEma25) / prevEma25);
    
    // 小时线RSI
    const rsi = this.calculateSimpleRSI(closes, 14);
    const prevRsi = this.calculateSimpleRSI(closes.slice(0, -1), 14);
    const rsiRising = rsi > prevRsi;
    
    // 量能分析（最近6小时 vs 之前18小时）
    const recentVolumes = volumes.slice(-6);
    const prevVolumes = volumes.slice(-24, -6);
    const avgRecentVolume = recentVolumes.reduce((a, b) => a + b, 0) / 6;
    const avgPrevVolume = prevVolumes.reduce((a, b) => a + b, 0) / 18;
    const volumeAcceleration = avgRecentVolume / avgPrevVolume;
    
    // 计算价格动量（24小时涨跌幅）
    const priceChange24h = ((currentPrice - price24hAgo) / price24hAgo) * 100;
    
    // 突破检测（是否突破近期高低点）
    const high20h = Math.max(...highs.slice(-20, -1));
    const low20h = Math.min(...lows.slice(-20, -1));
    const breakingHigh = currentPrice > high20h * 1.01;
    const holdingLow = currentPrice > low20h * 1.02;
    
    // 检测连续上涨K线
    let consecutiveGreen = 0;
    for (let i = closes.length - 1; i > closes.length - 7 && i > 0; i--) {
      if (closes[i] > closes[i - 1]) {
        consecutiveGreen++;
      } else {
        break;
      }
    }
    
    // 检测并收集小时线信号
    const signals = [];
    
    if (emaGapNarrowing && emaGap < 0 && Math.abs(emaGap) < 0.02) {
      signals.push('EMA即将金叉');
    }
    if (volumeAcceleration > 1.5) {
      signals.push('量能放大');
    }
    if (rsi > 40 && rsi < 60 && rsiRising) {
      signals.push('RSI恢复');
    }
    if (priceChange24h > 3 && priceChange24h < 15) {
      signals.push('价格温和上涨');
    }
    if (breakingHigh) {
      signals.push('突破20小时高点');
    }
    if (consecutiveGreen >= 3) {
      signals.push(`连续${consecutiveGreen}根阳线`);
    }
    
    return {
      ema7,
      ema25,
      emaGap,
      emaGapNarrowing,
      rsi,
      rsiRising,
      volumeAcceleration,
      priceChange24h,
      breakingHigh,
      holdingLow,
      consecutiveGreen,
      signals,
      currentPrice,
    };
  }

  /**
   * 计算小时线评分（0-10分）
   */
  calculateHourlyScore(data) {
    if (!data) return 0;
    
    let score = 0;
    
    // 1. EMA即将金叉或已金叉（0-3分）
    if (data.emaGap >= 0) {
      score += 3; // 已金叉
    } else if (Math.abs(data.emaGap) < 0.01 && data.emaGapNarrowing) {
      score += 2; // 即将金叉
    } else if (Math.abs(data.emaGap) < 0.03 && data.emaGapNarrowing) {
      score += 1; // 接近金叉
    }
    
    // 2. RSI恢复（0-2分）
    if (data.rsi > 40 && data.rsi < 60 && data.rsiRising) {
      score += 2;
    } else if (data.rsi > 35 && data.rsi < 65 && data.rsiRising) {
      score += 1;
    }
    
    // 3. 量能加速（0-2分）
    if (data.volumeAcceleration > 2) {
      score += 2; // 强烈放量
    } else if (data.volumeAcceleration > 1.5) {
      score += 1; // 温和放量
    }
    
    // 4. 价格动量（0-2分）
    if (data.priceChange24h > 5 && data.priceChange24h < 15) {
      score += 2; // 理想涨幅
    } else if (data.priceChange24h > 3 && data.priceChange24h < 20) {
      score += 1; // 温和上涨
    }
    
    // 5. 突破信号（0-1分）
    if (data.breakingHigh && data.volumeAcceleration > 1.2) {
      score += 1; // 放量突破
    }
    
    // 6. 连续阳线（0-1分）
    if (data.consecutiveGreen >= 4) {
      score += 1; // 强势
    }
    
    return Math.min(score, 10); // 最高10分
  }

  /**
   * Calculate ambush score (0-15)
   */
  calculateAmbushScore(data, symbol) {
    let score = 0;

    // 1. Deep pullback from 30d high (>30%) - 2 points
    if (data.drawdownFrom30dHigh > 0.30) score += 2;
    else if (data.drawdownFrom30dHigh > 0.20) score += 1;

    // 2. Close to 60d low (<10% above) - 2 points
    if (data.distanceFromLow < 0.10) score += 2;
    else if (data.distanceFromLow < 0.15) score += 1;

    // 3. EMA golden cross proximity (<2% gap, EMA7 below EMA25) - 3 points
    if (data.emaGap < 0 && Math.abs(data.emaGap) < 0.02) score += 3;
    else if (data.emaGap < 0 && Math.abs(data.emaGap) < 0.05) score += 2;
    else if (data.emaGap < 0) score += 1;

    // 4. RSI recovering from oversold (40-55 range, rising) - 2 points
    if (data.rsi > 40 && data.rsi < 55 && data.rsiRising) score += 2;
    else if (data.rsi > 35 && data.rsi < 60 && data.rsiRising) score += 1;

    // 5. Extended consolidation (>10 days below EMA25) - 2 points
    if (data.consolidationDays >= 10) score += 2;
    else if (data.consolidationDays >= 7) score += 1;

    // 6. Volume warming up (1.2-1.8x avg) - 1 point
    if (data.volumeTrend > 1.2 && data.volumeTrend < 1.8) score += 1;

    // 7. Sufficient liquidity (>500k USDT) - 1 point
    if (data.quoteVolume > 500000) score += 1;

    // 8. Not in extreme volatility (avoid pump & dump) - 1 point
    if (Math.abs(data.priceChange) < 15) score += 1;

    // 9. EMA direction starting to turn up - 1 point
    if (data.emaDirection === 'rising') score += 1;

    return score;
  }

  /**
   * Simple EMA calculation
   */
  calculateSimpleEMA(values, period) {
    if (values.length < period) return 0;
    
    const k = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = period; i < values.length; i++) {
      ema = values[i] * k + ema * (1 - k);
    }
    
    return ema;
  }

  /**
   * Simple RSI calculation
   */
  calculateSimpleRSI(closes, period = 14) {
    if (closes.length < period + 1) return 50;

    const changes = [];
    for (let i = 1; i < closes.length; i++) {
      changes.push(closes[i] - closes[i - 1]);
    }

    let gainSum = 0;
    let lossSum = 0;
    for (let i = 0; i < period; i++) {
      if (changes[i] > 0) gainSum += changes[i];
      else lossSum += Math.abs(changes[i]);
    }

    let avgGain = gainSum / period;
    let avgLoss = lossSum / period;

    for (let i = period; i < changes.length; i++) {
      const gain = changes[i] > 0 ? changes[i] : 0;
      const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  /**
   * Update watchlist with new candidates
   * 优化：融合评分系统，日线+小时线双重评估
   */
  updateWatchlist(candidates) {
    const now = Date.now();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 延长到30天

    // Remove old entries (严格出池条件)
    for (const [symbol, entry] of this.watchlist.entries()) {
      const age = now - entry.addedAt;
      const daysInPool = Math.floor(age / (24 * 60 * 60 * 1000));
      
      // 出池条件（三选一）：
      // 1. 超过30天
      // 2. 评分<6 且持续3天（需要检查历史评分）
      // 3. 价格暴涨>30%（已启动）
      if (age > maxAge) {
        this.watchlist.delete(symbol);
        logger.info(`Removed ${symbol} from watchlist (expired: ${daysInPool} days)`);
      }
      // Note: 价格暴涨检测会在 checkWatchlistForEntries 中处理
    }

    // Add/update new candidates (融合评分系统)
    for (const candidate of candidates) {
      const totalScore = candidate.totalScore || candidate.score || 0;
      const dailyScore = candidate.dailyScore || candidate.score || 0;
      const hourlyScore = candidate.hourlyScore || 0;
      
      if (!this.watchlist.has(candidate.symbol)) {
        // 新币种：直接加入
        this.watchlist.set(candidate.symbol, {
          score: totalScore,
          dailyScore: dailyScore,
          hourlyScore: hourlyScore,
          highestScore: totalScore,  // 记录历史最高分
          addedAt: now,
          lastNotified: 0,
          data: candidate,
        });
        
        const scoreInfo = hourlyScore > 0 
          ? `总分${totalScore} (日线${dailyScore} + 小时线${hourlyScore})`
          : `日线评分${dailyScore}`;
        
        logger.info(`✅ Added ${candidate.symbol} to watchlist (${scoreInfo})`);
        
        if (candidate.hourlySignals && candidate.hourlySignals.length > 0) {
          logger.info(`   小时线信号: ${candidate.hourlySignals.join(', ')}`);
        }
      } else {
        // 已存在：更新评分
        const existing = this.watchlist.get(candidate.symbol);
        const oldTotal = existing.score;
        
        if (totalScore > existing.highestScore) {
          existing.highestScore = totalScore;
          logger.info(`📈 ${candidate.symbol} score increased: ${oldTotal} → ${totalScore}`);
          
          if (candidate.hourlySignals && candidate.hourlySignals.length > 0) {
            logger.info(`   新增小时线信号: ${candidate.hourlySignals.join(', ')}`);
          }
        }
        
        existing.score = totalScore;
        existing.dailyScore = dailyScore;
        existing.hourlyScore = hourlyScore;
        existing.data = candidate;
      }
    }
  }

  /**
   * Check watchlist for entry signals (优化：5分钟检查)
   * 增加：即将金叉预警、价格暴涨移出、多重触发条件、BTC市场环境过滤
   */
  async checkWatchlistForEntries() {
    const entrySignals = [];
    const preWarnings = [];  // 即将金叉预警
    const toRemove = [];  // 需要移出的币种

    // === 【BTC市场环境检查】===
    let btcTrend = 'neutral';
    let btcAdx = 0;
    try {
      const btcKlines = await this.binance.getKlines('BTCUSDT', '1h', 50);
      if (btcKlines && btcKlines.length >= 50) {
        const btcCloses = btcKlines.map(k => k.close);
        const btcEma7 = this.calculateSimpleEMA(btcCloses, 7);
        const btcEma25 = this.calculateSimpleEMA(btcCloses, 25);
        btcTrend = btcEma7 > btcEma25 ? 'bullish' : 'bearish';
        // 简化ADX计算（可选）
        const btcRsi = this.calculateSimpleRSI(btcCloses, 14);
        btcAdx = btcRsi > 50 ? 25 : 15; // 简化版
        
        logger.info(`📊 BTC市场环境: ${btcTrend} | ADX: ${btcAdx}`);
      }
    } catch (error) {
      logger.debug(`Failed to check BTC trend: ${error.message}`);
    }

    for (const [symbol, entry] of this.watchlist.entries()) {
      try {
        // Check current 1h data
        const klines = await this.binance.getKlines(symbol, '1h', 50);
        if (!klines || klines.length < 50) continue;

        const closes = klines.map(k => k.close);
        const volumes = klines.map(k => k.volume);
        const highs = klines.map(k => k.high);

        const currentPrice = closes[closes.length - 1];
        
        // 检查是否已暴涨（移出观察池）
        const entryPrice = entry.data.currentPrice;
        const priceIncrease = ((currentPrice - entryPrice) / entryPrice) * 100;
        
        if (priceIncrease > 30) {
          toRemove.push(symbol);
          logger.info(`${symbol} 已暴涨 ${priceIncrease.toFixed(1)}%，从观察池移出`);
          continue;
        }

        const ema7 = this.calculateSimpleEMA(closes, 7);
        const ema25 = this.calculateSimpleEMA(closes, 25);
        const prevEma7 = this.calculateSimpleEMA(closes.slice(0, -1), 7);
        const prevEma25 = this.calculateSimpleEMA(closes.slice(0, -1), 25);

        const emaGap = (ema7 - ema25) / ema25;

        // 预警：即将金叉（EMA7 距离 EMA25 < 0.5%）
        if (ema7 < ema25 && Math.abs(emaGap) < 0.005 && !entry.preWarned) {
          preWarnings.push({
            symbol,
            emaGap: Math.abs(emaGap) * 100,
            currentPrice,
            watchlistScore: entry.highestScore,
          });
          entry.preWarned = true;  // 标记已预警，避免重复
        }

        // 触发条件1：EMA 金叉（必须有量能确认）
        const goldenCross = prevEma7 <= prevEma25 && ema7 > ema25;
        
        // 触发条件2：放量确认（严格要求）
        const avgVolume = volumes.slice(-10, -1).reduce((a, b) => a + b, 0) / 9;
        const currentVolume = volumes[volumes.length - 1];
        const volumeBreakout = currentVolume > avgVolume * 2;  // 2倍放量
        const volumeConfirm = currentVolume > avgVolume * 1.5;  // 1.5倍量能确认
        const priceBreakout = ((currentPrice - closes[closes.length - 2]) / closes[closes.length - 2]) * 100 > 5;

        // 触发条件3：突破近期高点
        const recentHigh = Math.max(...highs.slice(-10, -1));
        const breakoutHigh = currentPrice > recentHigh * 1.02;

        // 触发条件4：RSI 确认（避免超买）
        const rsi = this.calculateSimpleRSI(closes, 14);
        const rsiOk = rsi >= 45 && rsi <= 70;  // RSI在合理区间

        // 触发条件5：金叉后回踩确认（更可靠）
        const goldenCrossConfirmed = goldenCross && ema7 > ema25 * 1.005; // 金叉后EMA7要明显在EMA25之上

        // ===【综合判断 - 多重确认机制】===
        let triggered = false;
        let signalType = '';
        let confidence = 60;
        let reasons = [];

        // 方案1：金叉 + 量能确认 + RSI正常（最严格）
        if (goldenCrossConfirmed && volumeConfirm && rsiOk) {
          triggered = true;
          signalType = 'EMA金叉+放量';
          confidence = volumeBreakout ? 90 : 80;
          reasons = ['EMA金叉确认', '量能放大', 'RSI正常'];
        } 
        // 方案2：放量突破 + 价格突破 + RSI正常
        else if (volumeBreakout && priceBreakout && rsiOk) {
          triggered = true;
          signalType = '放量突破';
          confidence = 85;
          reasons = ['放量2倍+', '价格突破5%+', 'RSI正常'];
        } 
        // 方案3：突破前高 + 放量 + 接近金叉
        else if (breakoutHigh && volumeBreakout && Math.abs(emaGap) < 0.02 && rsiOk) {
          triggered = true;
          signalType = '突破前高+放量';
          confidence = 82;
          reasons = ['突破近期高点', '放量2倍+', 'EMA即将金叉', 'RSI正常'];
        }
        // 方案4：仅金叉但无量能 - 不触发，只记录
        else if (goldenCross && !volumeConfirm) {
          logger.info(`⚠️ ${symbol} 金叉但量能不足，不发送信号（量能：${(currentVolume/avgVolume).toFixed(2)}x）`);
        }

        if (triggered) {
          // === 【BTC市场环境过滤】===
          let finalConfidence = confidence;
          let warning = '';
          
          // BTC弱势时降低置信度
          if (btcTrend === 'bearish' && btcAdx > 20) {
            finalConfidence = Math.floor(confidence * 0.8); // 降低20%置信度
            warning = '⚠️ BTC弱势，谨慎进场';
            reasons.push('BTC弱势环境');
          }
          
          // 如果最终置信度<75%，不发送信号
          if (finalConfidence < 75) {
            logger.info(`⚠️ ${symbol} 触发信号但置信度不足 ${finalConfidence}% (<75%)，不发送 | BTC: ${btcTrend}`);
            continue;
          }

          entrySignals.push({
            symbol,
            signalType,
            watchlistScore: entry.highestScore,
            ema7,
            ema25,
            volumeConfirm: volumeConfirm,
            volumeMultiplier: (currentVolume / avgVolume).toFixed(2),
            rsi: rsi.toFixed(1),
            confidence: finalConfidence,
            currentPrice,
            reasons: reasons,
            btcTrend: btcTrend,
            warning: warning,
          });

          logger.info(`🚀 Entry signal: ${symbol} - ${signalType} (confidence: ${finalConfidence}%)`);
          logger.info(`   触发原因: ${reasons.join(', ')}`);
          logger.info(`   量能: ${(currentVolume/avgVolume).toFixed(2)}x | RSI: ${rsi.toFixed(1)} | BTC: ${btcTrend}`);
          if (warning) logger.info(`   ${warning}`);
          
          // 发出信号后，从观察池移出（已启动）
          toRemove.push(symbol);
        }

      } catch (error) {
        logger.debug(`Error checking ${symbol}: ${error.message}`);
      }
    }

    // 移出已触发的币种
    for (const symbol of toRemove) {
      this.watchlist.delete(symbol);
    }

    // 发送即将金叉预警
    if (preWarnings.length > 0) {
      logger.info(`📢 Pre-warnings: ${preWarnings.length} coins approaching golden cross`);
      // 可选：发送预警消息（简化版）
      // await this.sendPreWarnings(preWarnings);
    }

    return entrySignals;
  }

  /**
   * Get current watchlist
   */
  getWatchlist() {
    return Array.from(this.watchlist.entries()).map(([symbol, entry]) => ({
      symbol,
      score: entry.score,
      highestScore: entry.highestScore,  // 历史最高分
      addedAt: entry.addedAt,
      daysInWatchlist: Math.floor((Date.now() - entry.addedAt) / (24 * 60 * 60 * 1000)),
    })).sort((a, b) => b.highestScore - a.highestScore);  // 按最高分排序
  }
}

module.exports = { AmbushScanner };


