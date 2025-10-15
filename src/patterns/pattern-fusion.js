/**
 * 形态融合模块
 * 融合K线形态与图表形态，提升准确率
 * 支持 TA-Lib 微服务（可选62种高级形态）
 */

const { detectCandlestickPatterns } = require('./candlestick');
const { detectChartPatterns } = require('./chart-patterns');
const TALibClient = require('./talib-client');

// 初始化 TA-Lib 客户端（如果不可用则降级到基础形态）
const talibClient = new TALibClient(process.env.TALIB_SERVICE_URL || 'http://localhost:5000');
let talibAvailable = false;

// 启动时检查 TA-Lib 服务可用性
(async () => {
  talibAvailable = await talibClient.isAvailable();
  if (talibAvailable) {
    console.log('✅ TA-Lib 服务已连接 - 62种形态可用');
  } else {
    console.log('⚠️ TA-Lib 服务不可用 - 使用基础形态（12种）');
  }
})();

/**
 * 分析形态（多层验证确认）
 * @param {Array} klines - 历史K线数据
 * @param {Object} technicalData - RSI, EMA, ADX, 量能等技术数据
 * @returns {Object} 综合形态分析结果
 */
async function analyzePatterns(klines, technicalData) {
  if (!klines || klines.length < 20) {
    return { patterns: [], signals: [], overallConfidence: 0 };
  }

  // 优先使用 TA-Lib 检测形态，如果不可用则降级到基础形态
  let candlestickPatterns = [];
  
  if (talibAvailable) {
    try {
      const talibPatterns = await talibClient.detectPatterns(klines);
      candlestickPatterns = talibPatterns.map(p => ({
        name: p.name,
        type: p.signal === 'bullish' ? 'bullish_reversal' : 'bearish_reversal',
        confidence: p.confidence,
        emoji: getEmojiForPattern(p),
        description: `${p.name}（TA-Lib）`,
        source: 'talib'
      }));
    } catch (error) {
      // 失败时降级到基础形态
      candlestickPatterns = detectCandlestickPatterns(klines);
    }
  } else {
    candlestickPatterns = detectCandlestickPatterns(klines);
  }

  // 检测图表形态
  const chartPatterns = detectChartPatterns(klines);

  // 合并所有形态
  const allPatterns = [...candlestickPatterns, ...chartPatterns];

  // 生成融合信号（当多个形态相互确认时）
  const fusionSignals = generateFusionSignals(
    candlestickPatterns,
    chartPatterns,
    technicalData
  );

  // 计算综合置信度
  const overallConfidence = calculateOverallConfidence(
    allPatterns,
    fusionSignals,
    technicalData
  );

  return {
    patterns: allPatterns,
    fusionSignals: fusionSignals,
    overallConfidence: overallConfidence,
    summary: generateSummary(allPatterns, fusionSignals, technicalData),
  };
}

/**
 * 生成融合信号（当多个形态相互确认时）
 */
function generateFusionSignals(candlestickPatterns, chartPatterns, technicalData) {
  const signals = [];

  // 检查看涨形态融合
  const hasBullishCandlestick = candlestickPatterns.some(p => p.type === 'bullish_reversal');
  const hasBullishChart = chartPatterns.some(p => p.type === 'bullish_reversal' || p.type === 'bullish_breakout');
  
  // 检查看跌形态融合
  const hasBearishCandlestick = candlestickPatterns.some(p => p.type === 'bearish_reversal');
  const hasBearishChart = chartPatterns.some(p => p.type === 'bearish_reversal' || p.type === 'bearish_breakout');

  // 看涨融合信号
  if (hasBullishCandlestick && hasBullishChart) {
    let confidence = 75;
    
    // 技术指标确认提升置信度
    if (technicalData.rsi && technicalData.rsi < 40) confidence += 5; // 超卖
    if (technicalData.trend === 'bullish') confidence += 10; // 趋势一致
    if (technicalData.volumeMultiplier > 1.5) confidence += 5; // 量能确认
    if (technicalData.adx > 20) confidence += 5; // 趋势强度

    signals.push({
      type: 'fusion_bullish',
      name: '多重看涨信号',
      emoji: '🚀',
      confidence: Math.min(confidence, 95),
      description: 'K线形态 + 图表形态 + 技术指标共振',
      candlestickPatterns: candlestickPatterns.filter(p => p.type === 'bullish_reversal').map(p => p.name),
      chartPatterns: chartPatterns.filter(p => p.type === 'bullish_reversal' || p.type === 'bullish_breakout').map(p => p.name),
    });
  }

  // 看跌融合信号
  if (hasBearishCandlestick && hasBearishChart) {
    let confidence = 75;
    
    if (technicalData.rsi && technicalData.rsi > 60) confidence += 5; // 超买
    if (technicalData.trend === 'bearish') confidence += 10; // 趋势一致
    if (technicalData.volumeMultiplier > 1.5) confidence += 5; // 量能确认
    if (technicalData.adx > 20) confidence += 5; // 趋势强度

    signals.push({
      type: 'fusion_bearish',
      name: '多重看跌信号',
      emoji: '⚠️',
      confidence: Math.min(confidence, 95),
      description: 'K线形态 + 图表形态 + 技术指标共振',
      candlestickPatterns: candlestickPatterns.filter(p => p.type === 'bearish_reversal').map(p => p.name),
      chartPatterns: chartPatterns.filter(p => p.type === 'bearish_reversal' || p.type === 'bearish_breakout').map(p => p.name),
    });
  }

  // 检查信号冲突（警告）
  if ((hasBullishCandlestick && hasBearishChart) || (hasBearishCandlestick && hasBullishChart)) {
    signals.push({
      type: 'conflict',
      name: '信号冲突',
      emoji: '⚖️',
      confidence: 30,
      description: 'K线形态与图表形态方向相反，建议等待',
    });
  }

  return signals;
}

/**
 * 计算综合置信度（基于所有因素）
 */
function calculateOverallConfidence(patterns, fusionSignals, technicalData) {
  if (patterns.length === 0) return 0;

  // 如果有融合信号，使用其置信度
  if (fusionSignals.length > 0) {
    const highestFusionConfidence = Math.max(...fusionSignals.map(s => s.confidence));
    return highestFusionConfidence;
  }

  // 否则，使用形态置信度平均值
  const avgPatternConfidence = patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length;

  // 基于技术指标调整
  let adjustment = 0;
  if (technicalData.volumeMultiplier > 2) adjustment += 5; // 放量
  if (technicalData.adx > 25) adjustment += 5; // 强趋势

  return Math.min(avgPatternConfidence + adjustment, 95);
}

/**
 * 生成可读性好的形态总结
 */
function generateSummary(patterns, fusionSignals, technicalData) {
  if (patterns.length === 0 && fusionSignals.length === 0) {
    return '未检测到明显形态';
  }

  // 优先级：融合信号 > 图表形态 > K线形态
  if (fusionSignals.length > 0) {
    const primarySignal = fusionSignals[0];
    return `${primarySignal.emoji} ${primarySignal.name}（置信度${primarySignal.confidence}%）`;
  }

  // 找到最高置信度的形态
  const sortedPatterns = [...patterns].sort((a, b) => b.confidence - a.confidence);
  const topPattern = sortedPatterns[0];

  let summary = `${topPattern.emoji} ${topPattern.name}`;
  
  if (topPattern.status === 'breaking') {
    summary += '（突破中）';
  } else if (topPattern.status === 'forming') {
    summary += '（形成中）';
  }

  summary += `（置信度${topPattern.confidence}%）`;

  return summary;
}

/**
 * 基于形态分析获取操作建议
 */
function getPatternRecommendation(patternAnalysis, currentPrice, direction) {
  const { fusionSignals, patterns, overallConfidence } = patternAnalysis;

  // 形态不明显
  if (overallConfidence < 60) {
    return {
      action: 'wait',
      reason: '形态不明显，建议观望',
      emoji: '⏸️',
    };
  }

  // 优先检查融合信号
  if (fusionSignals.length > 0) {
    const primarySignal = fusionSignals[0];
    
    if (primarySignal.type === 'conflict') {
      return {
        action: 'wait',
        reason: '信号冲突，等待明确方向',
        emoji: '⚖️',
      };
    }

    if (primarySignal.type === 'fusion_bullish' && direction === 'up') {
      return {
        action: 'strong_buy',
        reason: `多重看涨共振（${primarySignal.confidence}%）`,
        emoji: '🚀',
      };
    }

    if (primarySignal.type === 'fusion_bearish' && direction === 'down') {
      return {
        action: 'strong_sell',
        reason: `多重看跌共振（${primarySignal.confidence}%）`,
        emoji: '⚠️',
      };
    }

    // 形态与价格方向相反 - 警告
    if (primarySignal.type === 'fusion_bullish' && direction === 'down') {
      return {
        action: 'caution',
        reason: '形态看涨但价格下跌，可能是假跌破',
        emoji: '⚠️',
      };
    }

    if (primarySignal.type === 'fusion_bearish' && direction === 'up') {
      return {
        action: 'caution',
        reason: '形态看跌但价格上涨，可能是假突破',
        emoji: '⚠️',
      };
    }
  }

  // 无融合信号，检查单个高置信度形态
  const highConfidencePatterns = patterns.filter(p => p.confidence >= 75);
  if (highConfidencePatterns.length > 0) {
    const topPattern = highConfidencePatterns[0];
    
    if ((topPattern.type === 'bullish_reversal' || topPattern.type === 'bullish_breakout') && direction === 'up') {
      return {
        action: 'buy',
        reason: `${topPattern.name}形态确认`,
        emoji: topPattern.emoji,
      };
    }

    if ((topPattern.type === 'bearish_reversal' || topPattern.type === 'bearish_breakout') && direction === 'down') {
      return {
        action: 'sell',
        reason: `${topPattern.name}形态确认`,
        emoji: topPattern.emoji,
      };
    }
  }

  // 默认：中等置信度
  return {
    action: 'watch',
    reason: '形态初步形成，等待确认',
    emoji: '👀',
  };
}

/**
 * 为TA-Lib形态获取对应emoji
 */
function getEmojiForPattern(pattern) {
  const emojiMap = {
    bullish: ['🔨', '📈', '⭐', '🚀', '💪', '🟢', '⬆️', '🌱'],
    bearish: ['📉', '⚠️', '🔴', '⬇️', '💥', '🌙', '☄️', '🪦']
  };
  
  const emojis = pattern.signal === 'bullish' ? emojiMap.bullish : emojiMap.bearish;
  return emojis[Math.floor(Math.random() * emojis.length)];
}

module.exports = {
  analyzePatterns,
  getPatternRecommendation,
};


