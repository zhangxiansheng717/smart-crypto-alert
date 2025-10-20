const TelegramBot = require('node-telegram-bot-api');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { logger } = require('../utils/logger');

class TelegramService {
  constructor(config, enablePolling = false) {
    this.config = config;
    this.bot = null;
    this.chatId = config.telegram.chatId;

    // Daily alert count: Map<"symbol-interval-direction", count>
    this.dailyAlertCount = new Map();

    // Cooldown: Map<"symbol-interval-direction", timestamp>
    this.cooldownMap = new Map();

    if (config.telegram.botToken) {
      const botOptions = { polling: enablePolling };  // Enable polling for commands
      if (config.proxy.httpsProxy) {
        botOptions.request = {
          agentClass: HttpsProxyAgent,
          agentOptions: { proxy: config.proxy.httpsProxy },
        };
      }
      this.bot = new TelegramBot(config.telegram.botToken, botOptions);
      this.startDailyReset();
    }
  }

  /**
   * Reset daily count at midnight
   */
  startDailyReset() {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    const msUntilMidnight = tomorrow - now;

    setTimeout(() => {
      this.dailyAlertCount.clear();
      logger.info('Daily alert count reset.');
      setInterval(() => {
        this.dailyAlertCount.clear();
        logger.info('Daily alert count reset.');
      }, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
  }

  /**
   * Check if symbol is in cooldown
   */
  isInCooldown(symbol, interval, direction) {
    const key = `${symbol}-${interval}-${direction}`;
    const lastTime = this.cooldownMap.get(key);
    if (!lastTime) return false;

    const elapsed = (Date.now() - lastTime) / 1000 / 60;
    return elapsed < this.config.monitor.cooldownMinutes;
  }

  /**
   * Record alert time for cooldown
   */
  recordAlertTime(symbol, interval, direction) {
    const key = `${symbol}-${interval}-${direction}`;
    this.cooldownMap.set(key, Date.now());
  }

  /**
   * Get and increment alert count
   */
  getAndIncrementAlertCount(symbol, interval, direction) {
    const key = `${symbol}-${interval}-${direction}`;
    const current = this.dailyAlertCount.get(key) || 0;
    const newCount = current + 1;
    this.dailyAlertCount.set(key, newCount);
    return newCount;
  }

  /**
   * Format price with dynamic precision
   */
  formatPrice(price) {
    if (price >= 1000) return price.toFixed(2);
    if (price >= 1) return price.toFixed(4);
    if (price >= 0.01) return price.toFixed(6);
    return price.toFixed(8);
  }

  /**
   * Get formatted time string (server local time, 24-hour format)
   * 格式: YYYY-MM-DD HH:mm:ss
   */
  getTimeString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const date = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${date} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * Get formatted hour string (for reports)
   */
  getHourString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const date = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    
    return `${year}-${month}-${date} ${hours}:00`;
  }

  /**
   * Get timeframe emoji color
   */
  getTimeframeEmoji(interval) {
    const map = {
      '5m': '🔴',
      '15m': '🟡',
      '1h': '🟢',
      '4h': '🔵',
      '1d': '🟣',
    };
    return map[interval] || '⚪';
  }

  /**
   * Calculate comprehensive rating and analysis
   */
  analyzeSignal(data) {
    const { priceChange, rsi, trend, volumeMultiplier, adx, currentPrice, ema7, ema25, symbol, quoteVolume, btcMarketCondition } = data;
    const direction = priceChange > 0 ? 'up' : 'down';

    let rating = 'C';
    let suggestion = '等待观察';
    let reasons = [];
    let warnings = [];

    // ADX trend strength
    const trendStrong = adx >= 25;
    const trendWeak = adx <= 18;

    // Volume
    const volumeHigh = volumeMultiplier >= 2.5;
    const volumeNormal = volumeMultiplier >= 1.5 && volumeMultiplier < 2.5;
    const volumeLow = volumeMultiplier < 1.5;

    // RSI
    const rsiOverbought = rsi >= 70;
    const rsiOversold = rsi <= 30;
    const rsiNeutral = rsi > 30 && rsi < 70;

    // BTC market filter (for altcoins)
    const isAltcoin = symbol !== 'BTCUSDT' && symbol !== 'ETHUSDT';
    const btcBearish = btcMarketCondition && btcMarketCondition.trend === 'bearish' && btcMarketCondition.adx >= 25;
    const btcBullish = btcMarketCondition && btcMarketCondition.trend === 'bullish' && btcMarketCondition.adx >= 25;

    // Low liquidity check
    const lowLiquidity = quoteVolume < 1000000; // < 100万 USDT

    if (direction === 'up') {
      // Bullish analysis
      if (trend === 'bullish' && volumeHigh && rsiNeutral && trendStrong) {
        rating = 'A';
        suggestion = '可考虑做多';
        reasons.push('✅ 多头趋势确认');
        reasons.push('✅ 放量上涨（有买盘）');
        reasons.push('✅ 趋势强劲（ADX高）');
        
        // BTC filter for altcoins
        if (isAltcoin && btcBearish) {
          rating = 'C';
          suggestion = '观望（大盘弱势）';
          reasons.push('⚠️ BTC空头强势，山寨币风险高');
        }
      } else if (trend === 'bullish' && volumeNormal && rsiNeutral) {
        rating = 'B';
        suggestion = '谨慎做多';
        reasons.push('✅ 多头趋势中');
        reasons.push('⚠️ 量能一般');
        
        if (isAltcoin && btcBearish) {
          rating = 'C';
          suggestion = '不建议做多（大盘弱）';
        }
      } else if (trend === 'bullish' && rsiOverbought) {
        rating = 'C';
        suggestion = '不建议追高';
        reasons.push('✗ RSI超买（容易回调）');
        warnings.push('⚠️ 超买追高风险');
      } else if (trend === 'bearish') {
        rating = 'C';
        suggestion = '不建议追';
        reasons.push('✗ 逆势反弹（下跌趋势中）');
        if (volumeHigh && trendWeak) {
          warnings.push('🚨 庄家诱多警示：震荡区强拉，高位接盘风险大');
        } else if (volumeLow) {
          warnings.push('⚠️ 缩量反弹，多为诱多');
        }
      } else if (volumeLow && Math.abs(priceChange) > 5) {
        rating = 'C';
        suggestion = '警惕诱多';
        reasons.push('✗ 量价背离（涨但无量）');
        warnings.push('🚨 庄家对敲警示：大涨缩量，散户追高易被套');
      }
    } else {
      // Bearish analysis
      if (trend === 'bearish' && volumeHigh && rsiNeutral && trendStrong) {
        rating = 'A';
        suggestion = '可考虑做空';
        reasons.push('✅ 空头趋势确认');
        reasons.push('✅ 放量下跌（抛压大）');
        reasons.push('✅ 趋势强劲（ADX高）');
      } else if (trend === 'bearish' && volumeNormal && rsiNeutral) {
        rating = 'B';
        suggestion = '谨慎做空';
        reasons.push('✅ 空头趋势中');
        reasons.push('⚠️ 量能一般');
      } else if (trend === 'bearish' && rsiOversold) {
        rating = 'C';
        suggestion = '等待企稳';
        reasons.push('✗ RSI超卖（可能反弹）');
      } else if (trend === 'bullish') {
        rating = 'C';
        suggestion = '不建议做空';
        reasons.push('✗ 逆势回调（上涨趋势中）');
        if (volumeHigh) {
          warnings.push('⚠️ 多头回调，可能是洗盘');
        }
      } else if (volumeLow && Math.abs(priceChange) > 5) {
        rating = 'C';
        suggestion = '观望';
        reasons.push('✗ 阴跌缩量（慢慢磨）');
        warnings.push('⚠️ 小币种风险：缺乏流动性，易暴跌');
      }
    }

    // Additional warnings for weak trends
    if (trendWeak && Math.abs(priceChange) > 5) {
      warnings.push('⚠️ 震荡市拉升，假突破概率高');
    }

    // Small cap coin warning
    if (currentPrice < 0.1 && volumeMultiplier < 2) {
      warnings.push('⚠️ 小市值币种，庄家控盘风险高');
    }

    // Low liquidity warning
    if (lowLiquidity && Math.abs(priceChange) > 5) {
      warnings.push('⚠️ 成交额过低（流动性差），易被操控');
    }

    // Extreme volatility warning
    if (Math.abs(priceChange) > 30 && volumeMultiplier < 2) {
      warnings.push('🚨 极端波动+缩量：庄家控盘，远离！');
    }

    return { rating, suggestion, reasons, warnings };
  }

  /**
   * Send alert message
   */
  async sendAlert(data) {
    if (!this.bot || !this.chatId) {
      logger.warn('Telegram bot not configured.');
      return;
    }

    const { symbol, interval, priceChange, currentPrice, volumeMultiplier, quoteVolume, rsi, ema7, ema25, adx, trend, supportLevel, resistanceLevel } = data;

    const direction = priceChange > 0 ? 'up' : 'down';
    const directionText = priceChange > 0 ? '上涨' : '下跌';

    // Check cooldown
    if (this.isInCooldown(symbol, interval, direction)) {
      logger.debug(`Skipped ${symbol} ${interval} ${directionText} (cooldown).`);
      return;
    }

    // Get alert count
    const alertCount = this.getAndIncrementAlertCount(symbol, interval, direction);

    // Record cooldown
    this.recordAlertTime(symbol, interval, direction);

    // Analysis
    const { rating, suggestion, reasons, warnings } = this.analyzeSignal(data);

    // Timeframe display
    const emoji = this.getTimeframeEmoji(interval);
    const threshold = this.config.monitor.thresholds[interval] || 0;

    // Format time (24-hour)
    const timeStr = this.getTimeString();

    // RSI status
    let rsiStatus = '📊 中性';
    if (rsi >= 70) rsiStatus = '⚠️ 超买';
    else if (rsi <= 30) rsiStatus = '⚠️ 超卖';
    else if (rsi >= 60) rsiStatus = '✅ 强势';
    else if (rsi <= 40) rsiStatus = '📊 弱势';

    // Trend status
    let trendIcon = '➡️ 震荡';
    if (trend === 'bullish') trendIcon = '🚀 多头排列';
    else if (trend === 'bearish') trendIcon = '📉 空头排列';

    // Volume tag
    let volumeTag = '📊 正常';
    if (volumeMultiplier >= 3) volumeTag = '💥 爆量';
    else if (volumeMultiplier >= 2) volumeTag = '⚡ 放量';
    else if (volumeMultiplier < 1) volumeTag = '📉 缩量';

    // ADX status
    let adxStatus = '';
    if (adx >= 25) adxStatus = '（趋势强）';
    else if (adx <= 18) adxStatus = '（震荡）';
    else adxStatus = '（过渡）';

    // Build message
    let message = `📊 合约价格异动提醒（${symbol} 第${alertCount}次提醒）\n\n`;
    message += `交易对: ${symbol}\n`;
    message += `周期: ${emoji} ${interval}\n`;
    message += `变动幅度: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}% (${directionText})\n`;
    message += `阈值: ${threshold}%\n`;
    message += `当前价格: ${this.formatPrice(currentPrice)}\n\n`;

    message += `📈 技术分析:\n`;
    message += `• RSI(14): ${rsi.toFixed(0)} ${rsiStatus}\n`;
    message += `• MA趋势: ${trendIcon}\n`;
    message += `• EMA7: ${this.formatPrice(ema7)} | EMA25: ${this.formatPrice(ema25)}\n`;
    message += `• 量能: ${volumeTag} ${volumeMultiplier.toFixed(1)}x\n`;
    message += `• ADX: ${adx.toFixed(0)} ${adxStatus}\n\n`;

    message += `💰 参考位置:\n`;
    message += `• 支撑位: $${this.formatPrice(supportLevel)}\n`;
    message += `• 阻力位: $${this.formatPrice(resistanceLevel)}\n\n`;

    // Pattern recognition (if available)
    if (data.patternAnalysis && data.patternAnalysis.patterns.length > 0) {
      message += `🔍 形态识别:\n`;
      message += `• ${data.patternAnalysis.summary}\n`;
      
      if (data.patternAnalysis.fusionSignals.length > 0) {
        const fusionSignal = data.patternAnalysis.fusionSignals[0];
        message += `• ${fusionSignal.emoji} ${fusionSignal.description}\n`;
      }
      message += `\n`;
    }

    message += `💡 综合评级: ${rating}级信号\n`;
    
    // Use pattern recommendation if available and high confidence
    if (data.patternRecommendation && data.patternAnalysis.overallConfidence >= 75) {
      message += `${data.patternRecommendation.emoji} 形态建议: ${data.patternRecommendation.reason}\n`;
    }
    
    message += `${priceChange > 0 ? '✅' : '⚠️'} 建议方向: ${suggestion}\n\n`;

    if (reasons.length > 0) {
      message += `📝 原因分析:\n`;
      reasons.forEach(r => {
        message += `${r}\n`;
      });
      message += `\n`;
    }

    if (warnings.length > 0) {
      message += `⚠️ 风险警示:\n`;
      warnings.forEach(w => {
        message += `${w}\n`;
      });
      message += `\n`;
    }

    message += `时间: ${timeStr}`;

    try {
      await this.bot.sendMessage(this.chatId, message);
      logger.info(`Alert sent: ${symbol} ${interval} ${directionText} (${alertCount})`);
    } catch (err) {
      logger.error(`Failed to send alert: ${err.message}`);
    }
  }

  /**
   * Send ambush coin report (融合日线+小时线)
   */
  async sendAmbushReport(candidates) {
    if (!this.bot || !this.chatId || !candidates || candidates.length === 0) {
      return;
    }

    const timeStr = this.getHourString();

    let message = `🔍 埋伏币扫描报告（${timeStr}）\n\n`;
    message += `📊 融合评分系统（日线+小时线）\n`;
    message += `发现 ${candidates.length} 个潜力币种：\n\n`;

    candidates.forEach((coin, index) => {
      message += `${index + 1}. ${coin.symbol}\n`;
      
      // 融合评分显示
      const totalScore = coin.totalScore || coin.score || 0;
      const dailyScore = coin.dailyScore || coin.score || 0;
      const hourlyScore = coin.hourlyScore || 0;
      
      if (hourlyScore > 0) {
        message += `   📈 总分: ${totalScore}/20 (日${dailyScore} + 时${hourlyScore}) `;
      } else {
        message += `   📈 日线评分: ${dailyScore}/15 `;
      }
      
      // Add star rating
      const stars = '⭐'.repeat(Math.min(Math.floor(totalScore / 4), 5));
      message += `${stars}\n`;
      
      message += `   💰 当前价: $${this.formatPrice(coin.currentPrice)}\n`;
      message += `   📉 距30日高点: -${(coin.drawdownFrom30dHigh * 100).toFixed(1)}%\n`;
      message += `   📊 距60日低点: +${(coin.distanceFromLow * 100).toFixed(1)}%\n`;
      message += `   📈 RSI(日): ${coin.rsi.toFixed(0)}`;
      
      if (coin.rsiRising) message += ' ⬆️';
      message += `\n`;
      
      message += `   🔄 EMA金叉距离: ${Math.abs(coin.emaGap * 100).toFixed(2)}%\n`;
      message += `   ⏰ 整理天数: ${coin.consolidationDays}天\n`;
      
      // 小时线信号
      if (coin.hourlySignals && coin.hourlySignals.length > 0) {
        message += `   ⚡ 小时线: ${coin.hourlySignals.join(', ')}\n`;
      }
      
      message += `\n`;
    });

    message += `💡 说明：\n`;
    message += `• 📊 融合评分：日线(底部形态) + 小时线(动态信号)\n`;
    message += `• ⭐ 评分 ≥7 自动加入观察池\n`;
    message += `• 🔍 每5分钟检测入场信号（EMA金叉/放量突破）\n`;
    message += `• ⏰ 下次扫描：6小时后\n\n`;
    message += `⚠️ 风险提示：底部形态需要时间确认，请控制仓位！`;

    try {
      await this.bot.sendMessage(this.chatId, message);
      logger.info(`Ambush report sent with ${candidates.length} candidates (融合评分)`);
    } catch (err) {
      logger.error(`Failed to send ambush report: ${err.message}`);
    }
  }

  /**
   * Send entry signal (when watchlist coin triggers golden cross)
   */
  async sendEntrySignal(signal) {
    if (!this.bot || !this.chatId) {
      return;
    }

    const timeStr = this.getTimeString();

    let message = `🚀 埋伏币入场信号\n\n`;
    message += `交易对: ${signal.symbol}\n`;
    message += `信号类型: ${signal.signalType}\n`;
    message += `观察池评分: ${signal.watchlistScore}/20+\n`;
    message += `当前价格: $${this.formatPrice(signal.currentPrice)}\n\n`;

    message += `📊 技术确认:\n`;
    message += `• EMA7: ${this.formatPrice(signal.ema7)}\n`;
    message += `• EMA25: ${this.formatPrice(signal.ema25)}\n`;
    message += `• 量能: ${signal.volumeMultiplier}x (${signal.volumeConfirm ? '✅' : '⚠️'})\n`;
    message += `• RSI(14): ${signal.rsi}\n`;
    message += `• 置信度: ${signal.confidence}%\n`;
    if (signal.btcTrend) {
      const btcEmoji = signal.btcTrend === 'bullish' ? '🟢' : '🔴';
      message += `• BTC趋势: ${btcEmoji} ${signal.btcTrend === 'bullish' ? '多头' : '空头'}\n`;
    }
    message += `\n`;

    message += `✅ 触发原因:\n`;
    if (signal.reasons && signal.reasons.length > 0) {
      signal.reasons.forEach(reason => {
        message += `• ${reason}\n`;
      });
    }
    message += `\n`;

    message += `💡 操作建议:\n`;
    if (signal.volumeConfirm && signal.confidence >= 80) {
      message += `✅ 建议试探性入场\n`;
      message += `• 建议仓位: 5-10%\n`;
      message += `• 止损位: EMA25 下方（$${this.formatPrice(signal.ema25 * 0.97)}）\n`;
      message += `• 止盈位: +10~15%\n`;
    } else {
      message += `⚠️ 谨慎观望\n`;
      message += `• 信号强度不够，建议等待\n`;
      message += `• 关注量能是否持续放大\n`;
    }
    
    if (signal.warning) {
      message += `\n${signal.warning}\n`;
    }

    message += `\n⏰ ${timeStr}`;

    try {
      await this.bot.sendMessage(this.chatId, message);
      logger.info(`Entry signal sent: ${signal.symbol}`);
    } catch (err) {
      logger.error(`Failed to send entry signal: ${err.message}`);
    }
  }

  /**
   * Send position alert (stop loss / take profit / etc.)
   */
  async sendPositionAlert(alertData) {
    if (!this.bot || !this.chatId) return;

    const { type, position, currentPrice, pnl } = alertData;
    const dirText = position.direction === 'long' ? '多头' : '空头';

    const timeStr = this.getTimeString();

    let message = '';

    switch (type) {
      case 'stop_loss':
        message = `🚨 止损提醒\n\n`;
        message += `交易对: ${position.symbol} (${dirText})\n`;
        message += `入场价: $${this.formatPrice(position.entryPrice)}\n`;
        message += `当前价: $${this.formatPrice(currentPrice)}\n`;
        message += `止损价: $${this.formatPrice(position.stopLoss)}\n`;
        message += `盈亏: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%\n\n`;
        message += `⚠️ 建议: 立即止损离场，控制损失\n`;
        message += `\n⏰ ${timeStr}`;
        break;

      case 'take_profit':
        const tpEmojis = ['🎯', '🎉', '💎'];
        const tpPercents = ['50%', '30%', '20%'];
        message = `${tpEmojis[alertData.tpLevel - 1]} 止盈${alertData.tpLevel}提醒\n\n`;
        message += `交易对: ${position.symbol} (${dirText})\n`;
        message += `入场价: $${this.formatPrice(position.entryPrice)}\n`;
        message += `当前价: $${this.formatPrice(currentPrice)}\n`;
        message += `止盈${alertData.tpLevel}: $${this.formatPrice(alertData.tpPrice)}\n`;
        message += `盈亏: +${pnl.toFixed(2)}%\n\n`;
        message += `💡 建议: 平掉 ${tpPercents[alertData.tpLevel - 1]} 仓位，锁定利润\n`;
        if (alertData.tpLevel === 1) {
          message += `剩余仓位继续持有，止损移至成本价\n`;
        }
        message += `\n⏰ ${timeStr}`;
        break;

      case 'rsi_extreme':
        const rsiEmoji = position.direction === 'long' ? '⚠️' : '💡';
        message = `${rsiEmoji} RSI ${alertData.message}\n\n`;
        message += `交易对: ${position.symbol} (${dirText})\n`;
        message += `入场价: $${this.formatPrice(position.entryPrice)}\n`;
        message += `当前价: $${this.formatPrice(currentPrice)}\n`;
        message += `RSI: ${alertData.rsi.toFixed(0)}\n`;
        message += `盈亏: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%\n\n`;
        message += `💡 建议: 考虑分批止盈，或移动止损保护利润\n`;
        message += `\n⏰ ${timeStr}`;
        break;

      case 'trend_reversal':
        message = `🔄 趋势反转提醒\n\n`;
        message += `交易对: ${position.symbol} (${dirText})\n`;
        message += `${alertData.message}\n`;
        message += `EMA7: ${this.formatPrice(alertData.ema7)}\n`;
        message += `EMA25: ${this.formatPrice(alertData.ema25)}\n`;
        message += `盈亏: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%\n\n`;
        message += `⚠️ 建议: 趋势反转，考虑止盈离场\n`;
        message += `\n⏰ ${timeStr}`;
        break;

      case 'pattern_reversal':
        const patterns = alertData.patterns.map(p => `${p.emoji}${p.name}`).join('、');
        message = `📊 形态反转提醒\n\n`;
        message += `交易对: ${position.symbol} (${dirText})\n`;
        message += `检测到: ${patterns}\n`;
        message += `盈亏: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%\n\n`;
        message += `⚠️ 建议: 出现反转形态，考虑止盈或收紧止损\n`;
        message += `\n⏰ ${timeStr}`;
        break;

      default:
        message = `📊 持仓提醒\n\n${position.symbol}: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`;
    }

    try {
      await this.bot.sendMessage(this.chatId, message);
      logger.info(`Position alert sent: ${position.symbol} (${type})`);
    } catch (err) {
      logger.error(`Failed to send position alert: ${err.message}`);
    }
  }
}

module.exports = { TelegramService };

