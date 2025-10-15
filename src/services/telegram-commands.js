/**
 * Telegram Command Handler
 * Handles user commands for querying, positions, and watchlist
 */

const { logger } = require('../utils/logger');
const { analyzePatterns, getPatternRecommendation } = require('../patterns/pattern-fusion');

class TelegramCommands {
  constructor(bot, chatId, binanceService, positionTracker, ambushScanner, config) {
    this.bot = bot;
    this.chatId = chatId;
    this.binance = binanceService;
    this.positions = positionTracker;
    this.ambush = ambushScanner;
    this.config = config;
    this.allSymbols = [];
    
    // Context for interactive commands
    this.userContext = {};
  }

  /**
   * Initialize command handlers
   */
  async init() {
    // Fetch all symbols for validation
    this.allSymbols = await this.binance.getUSDTSymbols();
    
    // Start listening to messages
    this.bot.on('message', async (msg) => {
      if (msg.chat.id.toString() !== this.chatId) return; // Ignore other chats
      
      const text = (msg.text || '').trim();
      if (!text) return;
      
      try {
        await this.handleMessage(text, msg.from.id);
      } catch (err) {
        logger.error(`Command error: ${err.message}`);
        await this.sendError(err.message);
      }
    });
    
    logger.info('Telegram command handler initialized');
  }

  /**
   * Handle incoming message
   */
  async handleMessage(text, userId) {
    const upper = text.toUpperCase();
    
    // Standard commands
    if (text.startsWith('/')) {
      return await this.handleCommand(text);
    }
    
    // Simplified inputs
    if (upper === 'LIST' || upper === '列表' || upper === 'LISTALL') {
      return await this.handleList(upper === 'LISTALL');
    }
    
    if (upper === 'HELP' || upper === '帮助') {
      return await this.handleHelp();
    }
    
    // Symbol query (e.g., "BTCUSDT" or "BTC")
    if (await this.isValidSymbol(upper)) {
      return await this.handleAnalyze(upper);
    }
    
    // Try to match partial symbol (e.g., "BTC" -> "BTCUSDT")
    const matched = this.matchSymbol(upper);
    if (matched) {
      return await this.handleAnalyze(matched);
    }
    
    // If nothing matches, send help
    await this.sendMessage(`❓ 未识别的命令：${text}\n\n输入 help 查看帮助`);
  }

  /**
   * Handle standard commands
   */
  async handleCommand(text) {
    const parts = text.split(' ').filter(p => p);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    switch (cmd) {
      case '/analyze':
      case '/a':
        if (args.length === 0) {
          return await this.sendMessage('用法：/analyze BTCUSDT 或直接输入 BTCUSDT');
        }
        return await this.handleAnalyze(args[0].toUpperCase());
      
      case '/add':
      case '/addposition':
        return await this.handleAddPosition(args);
      
      case '/positions':
      case '/pos':
      case '/p':
        return await this.handlePositions();
      
      case '/close':
        return await this.handleClose(args);
      
      case '/closeall':
        return await this.handleCloseAll();
      
      case '/setstop':
        return await this.handleSetStop(args);
      
      case '/watchlist':
      case '/watch':
      case '/w':
        return await this.handleWatchlist();
      
      case '/scan':
        return await this.handleScan();
      
      case '/help':
      case '/h':
        return await this.handleHelp();
      
      default:
        return await this.sendMessage(`❓ 未知命令：${cmd}\n\n输入 /help 查看帮助`);
    }
  }

  /**
   * Handle multi-timeframe analysis
   */
  async handleAnalyze(symbolInput) {
    const symbol = await this.normalizeSymbol(symbolInput);
    if (!symbol) {
      return await this.sendMessage(`❌ 未找到交易对：${symbolInput}`);
    }

    await this.sendMessage(`🔍 正在分析 ${symbol}，请稍候...`);

    // Analyze multiple timeframes
    const timeframes = ['15m', '1h', '4h', '1d'];
    const analyses = {};
    
    for (const tf of timeframes) {
      const data = await this.binance.processSymbol(symbol, tf, 30);
      if (data && data.klines) {
        // Pattern analysis
        const patternAnalysis = await analyzePatterns(data.klines, {
          rsi: data.rsi,
          ema7: data.ema7,
          ema25: data.ema25,
          adx: data.adx,
          trend: data.trend,
          volumeMultiplier: data.volumeMultiplier,
        });
        
        data.patternAnalysis = patternAnalysis;
        analyses[tf] = data;
      }
    }

    if (Object.keys(analyses).length === 0) {
      return await this.sendMessage(`❌ 无法获取 ${symbol} 数据`);
    }

    // Generate comprehensive report
    const report = this.generateMultiTimeframeReport(symbol, analyses);
    await this.sendMessage(report);
  }

  /**
   * Generate multi-timeframe analysis report
   */
  generateMultiTimeframeReport(symbol, analyses) {
    const timeframes = ['15m', '1h', '4h', '1d'];
    const tfNames = { '15m': '15分钟', '1h': '1小时', '4h': '4小时', '1d': '1天' };
    const tfEmojis = { '15m': '🟡', '1h': '🟢', '4h': '🔵', '1d': '🟣' };

    let message = `📊 ${symbol} 多周期综合分析\n\n`;

    // Current price (use 15m data)
    const current = analyses['15m'] || analyses['1h'] || analyses['4h'] || analyses['1d'];
    if (current) {
      message += `💰 当前价格: $${this.formatPrice(current.currentPrice)}\n\n`;
    }

    // Individual timeframe analysis
    message += `📈 各周期分析:\n\n`;
    
    for (const tf of timeframes) {
      if (!analyses[tf]) continue;
      
      const data = analyses[tf];
      const emoji = tfEmojis[tf];
      const name = tfNames[tf];
      
      const trendIcon = data.trend === 'bullish' ? '🚀' : (data.trend === 'bearish' ? '📉' : '➡️');
      const trendText = data.trend === 'bullish' ? '多头' : (data.trend === 'bearish' ? '空头' : '震荡');
      
      message += `${emoji} 【${name}】${trendIcon} ${trendText}\n`;
      message += `  RSI: ${data.rsi.toFixed(0)} | ADX: ${data.adx} | 量能: ${data.volumeMultiplier.toFixed(1)}x\n`;
      message += `  EMA7: ${this.formatPrice(data.ema7)} | EMA25: ${this.formatPrice(data.ema25)}\n`;
      
      // Pattern info
      if (data.patternAnalysis && data.patternAnalysis.patterns.length > 0) {
        const topPattern = data.patternAnalysis.patterns[0];
        message += `  形态: ${topPattern.emoji} ${topPattern.name}\n`;
      }
      
      message += `\n`;
    }

    // Multi-timeframe resonance analysis
    message += `🎯 多周期共振分析:\n`;
    
    const bullishCount = timeframes.filter(tf => analyses[tf] && analyses[tf].trend === 'bullish').length;
    const bearishCount = timeframes.filter(tf => analyses[tf] && analyses[tf].trend === 'bearish').length;
    const neutralCount = timeframes.filter(tf => analyses[tf] && analyses[tf].trend === 'neutral').length;
    
    if (bullishCount >= 3) {
      message += `✅ 多周期共振做多（${bullishCount}/${timeframes.length}个周期多头）\n`;
      message += `💡 强烈建议：多头趋势确认，可以做多\n`;
    } else if (bearishCount >= 3) {
      message += `❌ 多周期共振做空（${bearishCount}/${timeframes.length}个周期空头）\n`;
      message += `💡 强烈建议：空头趋势确认，可以做空或观望\n`;
    } else {
      message += `⚠️ 周期冲突（多头${bullishCount} | 空头${bearishCount} | 震荡${neutralCount}）\n`;
      message += `💡 建议：等待趋势明确，暂时观望\n`;
    }
    
    message += `\n`;

    // Support/Resistance (from 1h data)
    const refData = analyses['1h'] || analyses['4h'] || analyses['1d'];
    if (refData) {
      message += `💰 关键位置（1小时）:\n`;
      message += `  支撑: $${this.formatPrice(refData.supportLevel)}\n`;
      message += `  阻力: $${this.formatPrice(refData.resistanceLevel)}\n\n`;
    }

    // Overall recommendation
    message += `💡 综合建议:\n`;
    
    if (bullishCount >= 3) {
      const data1h = analyses['1h'];
      if (data1h) {
        if (data1h.rsi < 70 && data1h.adx >= 25 && data1h.volumeMultiplier >= 1.5) {
          message += `✅ 可以做多\n`;
          message += `  入场: 当前价附近\n`;
          message += `  止损: $${this.formatPrice(refData.supportLevel * 0.98)}\n`;
          message += `  目标: $${this.formatPrice(refData.resistanceLevel)}\n`;
          message += `  仓位: 10-20%\n`;
        } else if (data1h.rsi >= 80) {
          message += `⚠️ 虽然多头，但RSI${data1h.rsi.toFixed(0)}极度超买\n`;
          message += `  建议: 等回调再入场\n`;
        } else {
          message += `📊 多头趋势，可关注\n`;
          message += `  建议: 等待更好入场点\n`;
        }
      }
    } else if (bearishCount >= 3) {
      message += `❌ 空头趋势，不建议做多\n`;
      message += `  建议: 观望或考虑做空\n`;
    } else {
      message += `⏸️ 趋势不明，建议观望\n`;
      message += `  等待多周期共振再操作\n`;
    }

    const now = new Date();
    message += `\n⏰ ${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;

    return message;
  }

  /**
   * Handle add position
   */
  async handleAddPosition(args) {
    if (args.length < 2) {
      return await this.sendMessage('用法：/add BTCUSDT 48500 [long/short]\n例如：/add BTCUSDT 48500 long');
    }

    const symbol = await this.normalizeSymbol(args[0].toUpperCase());
    const price = parseFloat(args[1]);
    const direction = args[2] ? args[2].toLowerCase() : 'long';

    if (!symbol) {
      return await this.sendMessage(`❌ 未找到交易对：${args[0]}`);
    }

    if (isNaN(price) || price <= 0) {
      return await this.sendMessage(`❌ 价格无效：${args[1]}`);
    }

    if (direction !== 'long' && direction !== 'short') {
      return await this.sendMessage(`❌ 方向无效：${args[2]}（只能是 long 或 short）`);
    }

    const position = await this.positions.addPosition(symbol, price, direction);
    
    const directionText = direction === 'long' ? '多头' : '空头';
    let msg = `✅ 已添加 ${symbol} ${directionText}持仓\n\n`;
    msg += `入场价: $${this.formatPrice(price)}\n`;
    msg += `止损: $${this.formatPrice(position.stopLoss)} (${((position.stopLoss - price) / price * 100).toFixed(2)}%)\n`;
    msg += `止盈1: $${this.formatPrice(position.takeProfits[0])}\n`;
    msg += `止盈2: $${this.formatPrice(position.takeProfits[1])}\n`;
    msg += `止盈3: $${this.formatPrice(position.takeProfits[2])}\n\n`;
    msg += `💡 系统将每5分钟监控此持仓`;

    return await this.sendMessage(msg);
  }

  /**
   * Handle view positions
   */
  async handlePositions() {
    const summary = await this.positions.getPositionsSummary();
    
    if (summary.count === 0) {
      return await this.sendMessage('📊 当前没有持仓\n\n使用 /add BTCUSDT 48500 long 添加持仓');
    }

    let msg = `💼 当前持仓（${summary.count}个）\n\n`;

    summary.positions.forEach((pos, index) => {
      const dirEmoji = pos.direction === 'long' ? '📈' : '📉';
      const dirText = pos.direction === 'long' ? '多头' : '空头';
      
      msg += `${index + 1}. ${pos.symbol} ${dirEmoji}${dirText}\n`;
      msg += `   入场: $${this.formatPrice(pos.entryPrice)} (${pos.daysHeld}天前)\n`;
      msg += `   当前: $${this.formatPrice(pos.currentPrice)}\n`;
      msg += `   盈亏: ${pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(2)}%\n`;
      msg += `   止损: $${this.formatPrice(pos.stopLoss)}`;
      if (pos.closeToSL) msg += ' ⚠️ 接近';
      msg += `\n`;
      msg += `   止盈1: $${this.formatPrice(pos.nextTP)}`;
      if (pos.closeToTP) msg += ' ⬅️ 即将到达';
      msg += `\n`;
      msg += `   RSI: ${pos.rsi.toFixed(0)} | ADX: ${pos.adx}\n`;
      msg += `   状态: ${pos.status}\n\n`;
    });

    msg += `📊 平均盈亏: ${summary.totalPnl >= 0 ? '+' : ''}${summary.totalPnl.toFixed(2)}%\n\n`;
    msg += `💡 命令:\n`;
    msg += `  /close BTCUSDT - 平掉指定持仓\n`;
    msg += `  /closeall - 清空所有持仓`;

    return await this.sendMessage(msg);
  }

  /**
   * Handle close position
   */
  async handleClose(args) {
    if (args.length === 0) {
      return await this.sendMessage('用法：/close BTCUSDT [long/short]\n不指定方向则关闭该币所有持仓');
    }

    const symbol = await this.normalizeSymbol(args[0].toUpperCase());
    const direction = args[1] ? args[1].toLowerCase() : null;

    if (!symbol) {
      return await this.sendMessage(`❌ 未找到交易对：${args[0]}`);
    }

    const closedPositions = await this.positions.closePosition(symbol, direction);
    
    // Get current price for PNL calculation
    const data = await this.binance.processSymbol(symbol, '15m');
    
    let msg = `✅ 已平仓 ${symbol}\n\n`;
    
    for (const pos of closedPositions) {
      const currentPrice = data ? data.currentPrice : pos.entryPrice;
      const pnl = pos.direction === 'long'
        ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
        : ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;
      
      const dirText = pos.direction === 'long' ? '多头' : '空头';
      msg += `${dirText}持仓:\n`;
      msg += `  入场: $${this.formatPrice(pos.entryPrice)}\n`;
      msg += `  平仓: $${this.formatPrice(currentPrice)}\n`;
      msg += `  盈亏: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%\n\n`;
    }

    return await this.sendMessage(msg);
  }

  /**
   * Handle close all positions
   */
  async handleCloseAll() {
    const count = await this.positions.closeAllPositions();
    return await this.sendMessage(`✅ 已清空所有持仓（共${count}个）`);
  }

  /**
   * Handle set stop loss
   */
  async handleSetStop(args) {
    if (args.length < 2) {
      return await this.sendMessage('用法：/setstop BTCUSDT 47500 [long/short]');
    }

    const symbol = await this.normalizeSymbol(args[0].toUpperCase());
    const newStop = parseFloat(args[1]);
    const direction = args[2] ? args[2].toLowerCase() : 'long';

    if (!symbol) {
      return await this.sendMessage(`❌ 未找到交易对：${args[0]}`);
    }

    if (isNaN(newStop) || newStop <= 0) {
      return await this.sendMessage(`❌ 止损价格无效：${args[1]}`);
    }

    await this.positions.updateStopLoss(symbol, newStop, direction);
    
    return await this.sendMessage(`✅ ${symbol} ${direction === 'long' ? '多头' : '空头'}止损已更新为 $${this.formatPrice(newStop)}`);
  }

  /**
   * Handle watchlist
   */
  async handleWatchlist() {
    const watchlist = this.ambush.getWatchlist();
    
    if (watchlist.length === 0) {
      return await this.sendMessage('📋 观察池为空\n\n等待每日8点扫描或使用 /scan 手动扫描');
    }

    let msg = `📋 观察池（${watchlist.length}个）\n\n`;
    
    watchlist.forEach((item, index) => {
      msg += `${index + 1}. ${item.symbol}\n`;
      msg += `   评分: ${item.score}/15`;
      const stars = '⭐'.repeat(Math.min(Math.floor(item.score / 3), 5));
      msg += ` ${stars}\n`;
      msg += `   已观察: ${item.daysInWatchlist}天\n\n`;
    });

    msg += `💡 系统每5分钟检查金叉信号\n`;
    msg += `金叉确认后会自动推送入场提醒`;

    return await this.sendMessage(msg);
  }

  /**
   * Handle manual scan
   */
  async handleScan() {
    await this.sendMessage('🔍 开始扫描全市场，预计需要2-3分钟...');
    
    const candidates = await this.ambush.scanMarket(this.allSymbols);
    
    if (candidates.length === 0) {
      return await this.sendMessage('✅ 扫描完成\n\n未发现符合条件的埋伏币');
    }

    await this.telegram.sendAmbushReport(candidates.slice(0, 10));
    return await this.sendMessage(`✅ 扫描完成，发现 ${candidates.length} 个潜力币\n\n详情已发送`);
  }

  /**
   * Handle list symbols
   */
  async handleList(all = false) {
    const symbols = all ? this.allSymbols : this.allSymbols.slice(0, 50);
    
    let msg = `📋 支持的交易对${all ? `（全部${this.allSymbols.length}个）` : '（前50个）'}\n\n`;
    
    // Group by category (simple heuristic)
    const mainCoins = symbols.filter(s => ['BTC', 'ETH', 'BNB', 'SOL', 'ADA', 'XRP', 'DOT', 'MATIC', 'AVAX', 'LINK'].some(c => s.startsWith(c)));
    const defi = symbols.filter(s => ['UNI', 'AAVE', 'MKR', 'COMP', 'SNX', 'CRV', 'SUSHI'].some(c => s.startsWith(c)));
    const layer = symbols.filter(s => ['ARB', 'OP', 'APT', 'SUI', 'SEI', 'STRK'].some(c => s.startsWith(c)));
    
    if (mainCoins.length > 0) {
      msg += `主流币:\n${mainCoins.slice(0, 15).join(', ')}\n\n`;
    }
    
    if (!all && defi.length > 0) {
      msg += `DeFi:\n${defi.slice(0, 10).join(', ')}\n\n`;
    }
    
    if (!all && layer.length > 0) {
      msg += `Layer1/2:\n${layer.slice(0, 10).join(', ')}\n\n`;
    }
    
    msg += `查询格式:\n`;
    msg += `• 直接输入: BTCUSDT\n`;
    msg += `• 简写: BTC（自动识别为BTCUSDT）\n`;
    msg += `• 命令: /analyze BTCUSDT\n\n`;
    
    if (!all) {
      msg += `完整列表: 输入 listall`;
    }

    return await this.sendMessage(msg);
  }

  /**
   * Handle help
   */
  async handleHelp() {
    let msg = `📚 命令帮助\n\n`;
    msg += `🔍 查询分析:\n`;
    msg += `  BTCUSDT - 直接输入币种名\n`;
    msg += `  BTC - 简写（自动补全）\n`;
    msg += `  /analyze BTCUSDT - 标准命令\n`;
    msg += `  list - 查看币种列表\n\n`;
    
    msg += `💼 持仓管理:\n`;
    msg += `  /add BTCUSDT 48500 long - 添加多头持仓\n`;
    msg += `  /add BTCUSDT 48500 short - 添加空头持仓\n`;
    msg += `  /positions - 查看所有持仓\n`;
    msg += `  /close BTCUSDT - 平掉指定持仓\n`;
    msg += `  /closeall - 清空所有持仓\n`;
    msg += `  /setstop BTCUSDT 47500 - 修改止损\n\n`;
    
    msg += `🔍 埋伏币:\n`;
    msg += `  /watchlist - 查看观察池\n`;
    msg += `  /scan - 立即扫描全市场\n\n`;
    
    msg += `💡 说明:\n`;
    msg += `• 系统每5分钟监控持仓\n`;
    msg += `• 每天8点自动发送埋伏币日报\n`;
    msg += `• 观察池每5分钟检查入场信号`;

    return await this.sendMessage(msg);
  }

  /**
   * Check if input is valid symbol
   */
  async isValidSymbol(input) {
    return this.allSymbols.includes(input);
  }

  /**
   * Match partial symbol (e.g., "BTC" -> "BTCUSDT")
   */
  matchSymbol(input) {
    // Try exact match first
    if (this.allSymbols.includes(input)) return input;
    
    // Try with USDT suffix
    const withUSDT = `${input}USDT`;
    if (this.allSymbols.includes(withUSDT)) return withUSDT;
    
    // Try finding partial match
    const matched = this.allSymbols.find(s => s.startsWith(input));
    return matched || null;
  }

  /**
   * Normalize symbol input
   */
  async normalizeSymbol(input) {
    return this.matchSymbol(input);
  }

  /**
   * Format price
   */
  formatPrice(price) {
    if (price >= 1000) return price.toFixed(2);
    if (price >= 1) return price.toFixed(4);
    if (price >= 0.01) return price.toFixed(6);
    return price.toFixed(8);
  }

  /**
   * Send message to user
   */
  async sendMessage(text) {
    try {
      await this.bot.sendMessage(this.chatId, text);
    } catch (err) {
      logger.error(`Failed to send message: ${err.message}`);
    }
  }

  /**
   * Send error message
   */
  async sendError(errorMessage) {
    await this.sendMessage(`❌ 错误: ${errorMessage}`);
  }
}

module.exports = { TelegramCommands };

