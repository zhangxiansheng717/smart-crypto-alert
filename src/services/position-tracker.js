/**
 * Position Tracker - Monitor open positions and send alerts
 * Supports both LONG and SHORT positions
 */

const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../utils/logger');

class PositionTracker {
  constructor(binanceService, telegramService, config) {
    this.binance = binanceService;
    this.telegram = telegramService;
    this.config = config;
    this.positionsFile = path.join(__dirname, '../../data/positions.json');
    this.positions = {};
    
    this.initDataDir();
  }

  async initDataDir() {
    const dataDir = path.join(__dirname, '../../data');
    try {
      await fs.mkdir(dataDir, { recursive: true });
    } catch (err) {
      // Directory might already exist
    }
  }

  /**
   * Load positions from file
   */
  async loadPositions() {
    try {
      const data = await fs.readFile(this.positionsFile, 'utf8');
      this.positions = JSON.parse(data);
      return this.positions;
    } catch (err) {
      this.positions = {};
      return {};
    }
  }

  /**
   * Save positions to file
   */
  async savePositions() {
    try {
      await fs.writeFile(
        this.positionsFile, 
        JSON.stringify(this.positions, null, 2),
        'utf8'
      );
    } catch (err) {
      logger.error(`Failed to save positions: ${err.message}`);
    }
  }

  /**
   * Calculate simple ATR
   */
  calculateATR(klines, period = 14) {
    if (!klines || klines.length < period + 1) return 0;
    
    let trSum = 0;
    for (let i = 1; i <= Math.min(period, klines.length - 1); i++) {
      const high = klines[klines.length - i].high;
      const low = klines[klines.length - i].low;
      const prevClose = klines[klines.length - i - 1].close;
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trSum += tr;
    }
    
    return trSum / Math.min(period, klines.length - 1);
  }

  /**
   * Add position (supports both long and short)
   * @param {string} symbol
   * @param {number} entryPrice
   * @param {string} direction - 'long' or 'short'
   */
  async addPosition(symbol, entryPrice, direction = 'long') {
    await this.loadPositions();
    
    // Get current technical data
    const data = await this.binance.processSymbol(symbol, '1h', 30);
    
    if (!data) {
      throw new Error(`无法获取 ${symbol} 数据`);
    }

    // Calculate ATR
    let atr = 0;
    if (data.klines && data.klines.length >= 15) {
      atr = this.calculateATR(data.klines, 14);
    }
    
    // Fallback to 2% of price if ATR fails
    if (atr === 0 || atr < entryPrice * 0.005) {
      atr = entryPrice * 0.02;
    }

    // Calculate stop loss and take profits based on direction
    let stopLoss, takeProfits;
    
    if (direction === 'long') {
      // Long position
      stopLoss = entryPrice - atr * 1.5;
      takeProfits = [
        entryPrice + atr * 2,   // TP1: Risk:Reward 1:2
        entryPrice + atr * 3,   // TP2: 1:3
        entryPrice + atr * 5,   // TP3: 1:5
      ];
    } else {
      // Short position
      stopLoss = entryPrice + atr * 1.5;
      takeProfits = [
        entryPrice - atr * 2,
        entryPrice - atr * 3,
        entryPrice - atr * 5,
      ];
    }

    const key = `${symbol}_${direction}_${Date.now()}`;
    
    this.positions[key] = {
      symbol,
      entryPrice,
      direction,
      addedAt: Date.now(),
      ema7AtEntry: data.ema7,
      ema25AtEntry: data.ema25,
      atr: atr,
      stopLoss,
      takeProfits,
      highestPrice: direction === 'long' ? entryPrice : entryPrice,  // For trailing stop
      lowestPrice: direction === 'short' ? entryPrice : entryPrice,
      alerts: {
        sl: false,
        tp1: false,
        tp2: false,
        tp3: false,
        rsiExtreme: false,  // Overbought for long, oversold for short
        trendReversal: false,
        patternReversal: false,
      }
    };

    await this.savePositions();
    logger.info(`Position added: ${symbol} @ ${entryPrice} (${direction})`);
    
    return this.positions[key];
  }

  /**
   * Monitor all positions (called every 5 minutes)
   */
  async monitorPositions() {
    await this.loadPositions();
    
    const keys = Object.keys(this.positions);
    if (keys.length === 0) return;

    logger.debug(`Monitoring ${keys.length} positions...`);

    for (const key of keys) {
      const pos = this.positions[key];
      
      try {
        // Get latest data
        const data = await this.binance.processSymbol(pos.symbol, '15m', 30);
        if (!data) continue;

        const currentPrice = data.currentPrice;
        
        // Calculate PNL
        const pnl = pos.direction === 'long'
          ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
          : ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;

        // Update highest/lowest price for trailing stop
        if (pos.direction === 'long' && currentPrice > pos.highestPrice) {
          pos.highestPrice = currentPrice;
          // Trailing stop (if profit > 5%)
          if (pnl > 5) {
            const newStopLoss = currentPrice - pos.atr * 1.5;
            if (newStopLoss > pos.stopLoss) {
              const oldStopLoss = pos.stopLoss;
              pos.stopLoss = newStopLoss;
              logger.info(`${pos.symbol} 多头止损上移：${oldStopLoss.toFixed(4)} → ${newStopLoss.toFixed(4)}`);
            }
          }
        } else if (pos.direction === 'short' && currentPrice < pos.lowestPrice) {
          pos.lowestPrice = currentPrice;
          // Trailing stop for short
          if (pnl > 5) {
            const newStopLoss = currentPrice + pos.atr * 1.5;
            if (newStopLoss < pos.stopLoss) {
              const oldStopLoss = pos.stopLoss;
              pos.stopLoss = newStopLoss;
              logger.info(`${pos.symbol} 空头止损下移：${oldStopLoss.toFixed(4)} → ${newStopLoss.toFixed(4)}`);
            }
          }
        }

        // Trigger 1: Stop Loss
        if (this.checkStopLoss(pos, currentPrice) && !pos.alerts.sl) {
          await this.telegram.sendPositionAlert({
            type: 'stop_loss',
            position: pos,
            currentPrice,
            pnl,
          });
          pos.alerts.sl = true;
        }

        // Trigger 2: Take Profits
        for (let i = 0; i < 3; i++) {
          const tpKey = `tp${i+1}`;
          if (this.checkTakeProfit(pos, currentPrice, i) && !pos.alerts[tpKey]) {
            await this.telegram.sendPositionAlert({
              type: 'take_profit',
              position: pos,
              currentPrice,
              pnl,
              tpLevel: i + 1,
              tpPrice: pos.takeProfits[i],
            });
            pos.alerts[tpKey] = true;
          }
        }

        // Trigger 3: RSI Extreme (Overbought for long, Oversold for short)
        if (pos.direction === 'long' && pnl > 5 && data.rsi >= 75 && !pos.alerts.rsiExtreme) {
          await this.telegram.sendPositionAlert({
            type: 'rsi_extreme',
            position: pos,
            currentPrice,
            pnl,
            rsi: data.rsi,
            message: 'RSI超买，考虑止盈',
          });
          pos.alerts.rsiExtreme = true;
          setTimeout(() => { pos.alerts.rsiExtreme = false; }, 60*60*1000);
        } else if (pos.direction === 'short' && pnl > 5 && data.rsi <= 25 && !pos.alerts.rsiExtreme) {
          await this.telegram.sendPositionAlert({
            type: 'rsi_extreme',
            position: pos,
            currentPrice,
            pnl,
            rsi: data.rsi,
            message: 'RSI超卖，考虑平仓',
          });
          pos.alerts.rsiExtreme = true;
          setTimeout(() => { pos.alerts.rsiExtreme = false; }, 60*60*1000);
        }

        // Trigger 4: Trend Reversal
        if (this.checkTrendReversal(pos, data) && !pos.alerts.trendReversal) {
          await this.telegram.sendPositionAlert({
            type: 'trend_reversal',
            position: pos,
            currentPrice,
            pnl,
            ema7: data.ema7,
            ema25: data.ema25,
            message: pos.direction === 'long' ? 'EMA死叉，趋势反转' : 'EMA金叉，趋势反转',
          });
          pos.alerts.trendReversal = true;
        }

        // Trigger 5: Pattern Reversal (if pattern data available)
        if (data.patternAnalysis && data.patternAnalysis.patterns.length > 0) {
          const oppositePatterns = pos.direction === 'long'
            ? data.patternAnalysis.patterns.filter(p => p.type === 'bearish_reversal' && p.confidence >= 75)
            : data.patternAnalysis.patterns.filter(p => p.type === 'bullish_reversal' && p.confidence >= 75);
          
          if (oppositePatterns.length > 0 && pnl > 0 && !pos.alerts.patternReversal) {
            await this.telegram.sendPositionAlert({
              type: 'pattern_reversal',
              position: pos,
              currentPrice,
              pnl,
              patterns: oppositePatterns,
            });
            pos.alerts.patternReversal = true;
          }
        }

      } catch (err) {
        logger.error(`Error monitoring ${pos.symbol}: ${err.message}`);
      }
    }

    await this.savePositions();
  }

  /**
   * Check if stop loss is hit
   */
  checkStopLoss(pos, currentPrice) {
    if (pos.direction === 'long') {
      return currentPrice <= pos.stopLoss;
    } else {
      return currentPrice >= pos.stopLoss;  // Short: stop loss above entry
    }
  }

  /**
   * Check if take profit is hit
   */
  checkTakeProfit(pos, currentPrice, level) {
    if (pos.direction === 'long') {
      return currentPrice >= pos.takeProfits[level];
    } else {
      return currentPrice <= pos.takeProfits[level];  // Short: TP below entry
    }
  }

  /**
   * Check for trend reversal
   */
  checkTrendReversal(pos, data) {
    if (pos.direction === 'long') {
      // Long: death cross
      return data.ema7 < data.ema25 && pos.ema7AtEntry >= pos.ema25AtEntry;
    } else {
      // Short: golden cross
      return data.ema7 > data.ema25 && pos.ema7AtEntry <= pos.ema25AtEntry;
    }
  }

  /**
   * Get positions summary
   */
  async getPositionsSummary() {
    await this.loadPositions();
    
    const summary = [];
    let totalPnl = 0;

    for (const [key, pos] of Object.entries(this.positions)) {
      const data = await this.binance.processSymbol(pos.symbol, '15m');
      if (!data) continue;

      const currentPrice = data.currentPrice;
      const pnl = pos.direction === 'long'
        ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
        : ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;

      const daysHeld = Math.floor((Date.now() - pos.addedAt) / (24*60*60*1000));

      // Determine status
      let status = '📊 持有中';
      if (pnl >= 10) status = '💰 大幅盈利';
      else if (pnl >= 5) status = '✅ 盈利中';
      else if (pnl > 0) status = '📈 小幅盈利';
      else if (pnl > -3) status = '⚠️ 小幅浮亏';
      else if (pnl > -5) status = '⚠️ 浮亏中';
      else status = '🚨 严重浮亏';

      // Check if close to stop loss
      const distanceToSL = pos.direction === 'long'
        ? ((currentPrice - pos.stopLoss) / currentPrice) * 100
        : ((pos.stopLoss - currentPrice) / currentPrice) * 100;
      
      const closeToSL = distanceToSL < 2; // Within 2% of stop loss

      // Check if close to TP
      const distanceToTP1 = pos.direction === 'long'
        ? ((pos.takeProfits[0] - currentPrice) / currentPrice) * 100
        : ((currentPrice - pos.takeProfits[0]) / currentPrice) * 100;
      
      const closeToTP = distanceToTP1 < 2;

      summary.push({
        symbol: pos.symbol,
        direction: pos.direction,
        entryPrice: pos.entryPrice,
        currentPrice,
        pnl,
        daysHeld,
        stopLoss: pos.stopLoss,
        nextTP: pos.takeProfits[0],
        rsi: data.rsi,
        adx: data.adx,
        status,
        closeToSL,
        closeToTP,
      });

      totalPnl += pnl;
    }

    // Sort by PNL descending
    summary.sort((a, b) => b.pnl - a.pnl);

    return {
      positions: summary,
      totalPnl: summary.length > 0 ? totalPnl / summary.length : 0,
      count: summary.length,
    };
  }

  /**
   * Close position
   */
  async closePosition(symbol, direction = null) {
    await this.loadPositions();
    
    let keysToRemove;
    
    if (direction) {
      // Close specific direction
      keysToRemove = Object.keys(this.positions).filter(k => 
        k.startsWith(`${symbol}_${direction}_`)
      );
    } else {
      // Close all positions for this symbol
      keysToRemove = Object.keys(this.positions).filter(k => 
        k.startsWith(`${symbol}_`)
      );
    }

    if (keysToRemove.length === 0) {
      throw new Error(`未找到 ${symbol} 的持仓`);
    }

    const closedPositions = [];
    for (const key of keysToRemove) {
      closedPositions.push({...this.positions[key]});
      delete this.positions[key];
      logger.info(`Position closed: ${key}`);
    }

    await this.savePositions();
    return closedPositions;
  }

  /**
   * Close all positions
   */
  async closeAllPositions() {
    await this.loadPositions();
    const count = Object.keys(this.positions).length;
    this.positions = {};
    await this.savePositions();
    logger.info(`All positions closed (${count} total)`);
    return count;
  }

  /**
   * Update stop loss manually
   */
  async updateStopLoss(symbol, newStopLoss, direction = 'long') {
    await this.loadPositions();
    
    const keys = Object.keys(this.positions).filter(k => 
      k.startsWith(`${symbol}_${direction}_`)
    );

    if (keys.length === 0) {
      throw new Error(`未找到 ${symbol} 的${direction === 'long' ? '多头' : '空头'}持仓`);
    }

    for (const key of keys) {
      this.positions[key].stopLoss = newStopLoss;
      logger.info(`${symbol} 止损已更新为：${newStopLoss}`);
    }

    await this.savePositions();
    return keys.length;
  }

  /**
   * Start monitoring loop (every 5 minutes)
   */
  startMonitoring() {
    this.loadPositions();
    
    // Initial check after 1 minute
    setTimeout(async () => {
      await this.monitorPositions();
    }, 60 * 1000);

    // Check every 5 minutes
    setInterval(async () => {
      await this.monitorPositions();
    }, 5 * 60 * 1000);

    logger.info('Position tracker started (checking every 5 minutes)');
  }
}

module.exports = { PositionTracker };

