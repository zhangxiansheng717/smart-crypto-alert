/**
 * Candlestick Pattern Recognition (using technicalindicators library)
 */

const {
  hammer,
  hangingman,
  doji,
  bullishengulfingpattern,
  bearishengulfingpattern,
  morningdojistar,
  eveningdojistar,
  shootingstar,
  bullishharami,
  bearishharami,
  dragonflydoji,
  gravestonedoji,
} = require('technicalindicators');

/**
 * Detect candlestick patterns from klines
 * @param {Array} klines - array of kline objects with open/high/low/close
 * @returns {Array} detected patterns with signal type
 */
function detectCandlestickPatterns(klines) {
  if (!klines || klines.length < 3) return [];

  // Use last 5 candles for pattern detection
  const recentKlines = klines.slice(-5);
  
  const opens = recentKlines.map(k => k.open);
  const highs = recentKlines.map(k => k.high);
  const lows = recentKlines.map(k => k.low);
  const closes = recentKlines.map(k => k.close);

  const patterns = [];

  try {
    // Bullish reversal patterns
    const hammerResult = hammer({ open: opens, high: highs, low: lows, close: closes });
    if (hammerResult && hammerResult[hammerResult.length - 1]) {
      patterns.push({ 
        name: '锤子线', 
        type: 'bullish_reversal', 
        confidence: 75,
        emoji: '🔨',
        description: '底部反转信号'
      });
    }

    const bullEngulfing = bullishengulfingpattern({ open: opens, high: highs, low: lows, close: closes });
    if (bullEngulfing && bullEngulfing[bullEngulfing.length - 1]) {
      patterns.push({ 
        name: '看涨吞没', 
        type: 'bullish_reversal', 
        confidence: 80,
        emoji: '📈',
        description: '强烈看涨信号'
      });
    }

    const morningStar = morningdojistar({ open: opens, high: highs, low: lows, close: closes });
    if (morningStar && morningStar[morningStar.length - 1]) {
      patterns.push({ 
        name: '早晨之星', 
        type: 'bullish_reversal', 
        confidence: 85,
        emoji: '⭐',
        description: '底部反转强信号'
      });
    }

    const bullHarami = bullishharami({ open: opens, high: highs, low: lows, close: closes });
    if (bullHarami && bullHarami[bullHarami.length - 1]) {
      patterns.push({ 
        name: '看涨孕线', 
        type: 'bullish_reversal', 
        confidence: 70,
        emoji: '🤰',
        description: '可能反转上涨'
      });
    }

    const dragonflyDojiResult = dragonflydoji({ open: opens, high: highs, low: lows, close: closes });
    if (dragonflyDojiResult && dragonflyDojiResult[dragonflyDojiResult.length - 1]) {
      patterns.push({ 
        name: '蜻蜓十字', 
        type: 'bullish_reversal', 
        confidence: 75,
        emoji: '🪰',
        description: '底部反转'
      });
    }

    // Bearish reversal patterns
    const hangingManResult = hangingman({ open: opens, high: highs, low: lows, close: closes });
    if (hangingManResult && hangingManResult[hangingManResult.length - 1]) {
      patterns.push({ 
        name: '上吊线', 
        type: 'bearish_reversal', 
        confidence: 75,
        emoji: '🪢',
        description: '顶部反转信号'
      });
    }

    const bearEngulfing = bearishengulfingpattern({ open: opens, high: highs, low: lows, close: closes });
    if (bearEngulfing && bearEngulfing[bearEngulfing.length - 1]) {
      patterns.push({ 
        name: '看跌吞没', 
        type: 'bearish_reversal', 
        confidence: 80,
        emoji: '📉',
        description: '强烈看跌信号'
      });
    }

    const eveningStar = eveningdojistar({ open: opens, high: highs, low: lows, close: closes });
    if (eveningStar && eveningStar[eveningStar.length - 1]) {
      patterns.push({ 
        name: '黄昏之星', 
        type: 'bearish_reversal', 
        confidence: 85,
        emoji: '🌙',
        description: '顶部反转强信号'
      });
    }

    const shootingStarResult = shootingstar({ open: opens, high: highs, low: lows, close: closes });
    if (shootingStarResult && shootingStarResult[shootingStarResult.length - 1]) {
      patterns.push({ 
        name: '流星线', 
        type: 'bearish_reversal', 
        confidence: 75,
        emoji: '☄️',
        description: '顶部反转'
      });
    }

    const bearHarami = bearishharami({ open: opens, high: highs, low: lows, close: closes });
    if (bearHarami && bearHarami[bearHarami.length - 1]) {
      patterns.push({ 
        name: '看跌孕线', 
        type: 'bearish_reversal', 
        confidence: 70,
        emoji: '🫃',
        description: '可能反转下跌'
      });
    }

    const gravestoneDojiResult = gravestonedoji({ open: opens, high: highs, low: lows, close: closes });
    if (gravestoneDojiResult && gravestoneDojiResult[gravestoneDojiResult.length - 1]) {
      patterns.push({ 
        name: '墓碑十字', 
        type: 'bearish_reversal', 
        confidence: 75,
        emoji: '🪦',
        description: '顶部反转'
      });
    }

    // Neutral/indecision patterns
    const dojiResult = doji({ open: opens, high: highs, low: lows, close: closes });
    if (dojiResult && dojiResult[dojiResult.length - 1]) {
      // Only add doji if no other pattern detected
      if (patterns.length === 0) {
        patterns.push({ 
          name: '十字星', 
          type: 'neutral', 
          confidence: 50,
          emoji: '✝️',
          description: '市场犹豫，等待方向'
        });
      }
    }

  } catch (error) {
    // Silently fail if pattern detection has issues
    console.error('Candlestick pattern detection error:', error.message);
  }

  return patterns;
}

module.exports = {
  detectCandlestickPatterns,
};


