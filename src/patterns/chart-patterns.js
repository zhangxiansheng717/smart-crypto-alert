/**
 * Chart Pattern Recognition (custom rule-based)
 */

/**
 * Find local minimum in a range
 */
function findLocalMin(prices, startIdx, endIdx) {
  let minIdx = startIdx;
  let minVal = prices[startIdx];
  
  for (let i = startIdx + 1; i < endIdx && i < prices.length; i++) {
    if (prices[i] < minVal) {
      minVal = prices[i];
      minIdx = i;
    }
  }
  return minIdx;
}

/**
 * Find local maximum in a range
 */
function findLocalMax(prices, startIdx, endIdx) {
  let maxIdx = startIdx;
  let maxVal = prices[startIdx];
  
  for (let i = startIdx + 1; i < endIdx && i < prices.length; i++) {
    if (prices[i] > maxVal) {
      maxVal = prices[i];
      maxIdx = i;
    }
  }
  return maxIdx;
}

/**
 * Calculate average of array
 */
function average(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Detect double bottom pattern
 * @param {Array} klines - at least 20 candles
 * @returns {Object|null}
 */
function detectDoubleBottom(klines) {
  if (!klines || klines.length < 20) return null;

  const recent = klines.slice(-20);
  const lows = recent.map(k => k.low);
  const closes = recent.map(k => k.close);
  const volumes = recent.map(k => k.volume);

  // Find two local minimums
  const minIdx1 = findLocalMin(lows, 0, 10);
  const minIdx2 = findLocalMin(lows, 10, 20);

  const low1 = lows[minIdx1];
  const low2 = lows[minIdx2];
  
  // Check if two bottoms are similar (within 3%)
  const diff = Math.abs(low1 - low2) / Math.min(low1, low2);
  if (diff > 0.03) return null;

  // Check if there's a bounce between two bottoms (at least 5%)
  const middleSection = lows.slice(minIdx1 + 1, minIdx2);
  if (middleSection.length === 0) return null;
  
  const middleHigh = Math.max(...middleSection);
  const bounce = (middleHigh - low1) / low1;
  if (bounce < 0.05) return null;

  // Check volume confirmation (second bottom should have higher volume)
  const vol1 = volumes[minIdx1];
  const vol2 = volumes[minIdx2];
  const volumeIncrease = vol2 > vol1 * 1.2;

  // Check if price is breaking neckline
  const neckline = middleHigh;
  const currentPrice = closes[closes.length - 1];
  const breakingNeckline = currentPrice > neckline * 0.98; // Within 2% of neckline

  let confidence = 60;
  if (volumeIncrease) confidence += 10;
  if (breakingNeckline) confidence += 15;
  if (diff < 0.015) confidence += 5; // Very similar bottoms

  return {
    name: '双底',
    type: 'bullish_reversal',
    confidence: Math.min(confidence, 90),
    emoji: '🔄',
    description: '底部反转形态',
    neckline: neckline,
    target: neckline + (neckline - Math.min(low1, low2)), // Target = neckline + height
    status: breakingNeckline ? 'breaking' : 'forming',
  };
}

/**
 * Detect double top pattern
 * @param {Array} klines - at least 20 candles
 * @returns {Object|null}
 */
function detectDoubleTop(klines) {
  if (!klines || klines.length < 20) return null;

  const recent = klines.slice(-20);
  const highs = recent.map(k => k.high);
  const closes = recent.map(k => k.close);
  const volumes = recent.map(k => k.volume);

  // Find two local maximums
  const maxIdx1 = findLocalMax(highs, 0, 10);
  const maxIdx2 = findLocalMax(highs, 10, 20);

  const high1 = highs[maxIdx1];
  const high2 = highs[maxIdx2];
  
  // Check if two tops are similar (within 3%)
  const diff = Math.abs(high1 - high2) / Math.max(high1, high2);
  if (diff > 0.03) return null;

  // Check if there's a pullback between two tops (at least 5%)
  const middleSection = highs.slice(maxIdx1 + 1, maxIdx2);
  if (middleSection.length === 0) return null;
  
  const middleLow = Math.min(...middleSection);
  const pullback = (high1 - middleLow) / high1;
  if (pullback < 0.05) return null;

  // Check volume confirmation (second top should have lower volume - bearish)
  const vol1 = volumes[maxIdx1];
  const vol2 = volumes[maxIdx2];
  const volumeDecrease = vol2 < vol1 * 0.8;

  // Check if price is breaking neckline
  const neckline = middleLow;
  const currentPrice = closes[closes.length - 1];
  const breakingNeckline = currentPrice < neckline * 1.02; // Within 2% of neckline

  let confidence = 60;
  if (volumeDecrease) confidence += 10;
  if (breakingNeckline) confidence += 15;
  if (diff < 0.015) confidence += 5;

  return {
    name: '双顶',
    type: 'bearish_reversal',
    confidence: Math.min(confidence, 90),
    emoji: '🔁',
    description: '顶部反转形态',
    neckline: neckline,
    target: neckline - (Math.max(high1, high2) - neckline), // Target = neckline - height
    status: breakingNeckline ? 'breaking' : 'forming',
  };
}

/**
 * Detect platform consolidation (potential breakout)
 * @param {Array} klines - at least 15 candles
 * @returns {Object|null}
 */
function detectPlatformConsolidation(klines) {
  if (!klines || klines.length < 15) return null;

  const recent = klines.slice(-15);
  const highs = recent.map(k => k.high);
  const lows = recent.map(k => k.low);
  const closes = recent.map(k => k.close);
  const volumes = recent.map(k => k.volume);

  // Calculate price range over the period
  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);
  const priceRange = (maxHigh - minLow) / minLow;

  // Platform should have narrow range (< 5%)
  if (priceRange > 0.05) return null;

  // Check for recent breakout
  const avgPrice = average(closes.slice(0, -1));
  const currentPrice = closes[closes.length - 1];
  const priceChange = (currentPrice - avgPrice) / avgPrice;

  // Check volume surge
  const avgVolume = average(volumes.slice(0, -1));
  const currentVolume = volumes[volumes.length - 1];
  const volumeSurge = currentVolume > avgVolume * 1.5;

  // Determine breakout direction
  let breakoutType = null;
  let confidence = 65;

  if (Math.abs(priceChange) > 0.03 && volumeSurge) {
    breakoutType = priceChange > 0 ? 'bullish_breakout' : 'bearish_breakout';
    confidence = 75;
    
    if (volumeSurge && currentVolume > avgVolume * 2) {
      confidence += 10;
    }
  } else if (priceRange < 0.03) {
    // Very tight consolidation, no breakout yet
    breakoutType = 'neutral';
    confidence = 60;
  } else {
    return null;
  }

  return {
    name: '平台整理',
    type: breakoutType,
    confidence: Math.min(confidence, 85),
    emoji: breakoutType === 'bullish_breakout' ? '📊' : (breakoutType === 'bearish_breakout' ? '📉' : '➡️'),
    description: breakoutType === 'neutral' ? '等待突破方向' : (breakoutType === 'bullish_breakout' ? '向上突破' : '向下突破'),
    consolidationRange: { high: maxHigh, low: minLow },
    status: breakoutType === 'neutral' ? 'consolidating' : 'breakout',
  };
}

/**
 * Detect V-shaped reversal
 * @param {Array} klines - at least 10 candles
 * @returns {Object|null}
 */
function detectVReversal(klines) {
  if (!klines || klines.length < 10) return null;

  const recent = klines.slice(-10);
  const closes = recent.map(k => k.close);
  const volumes = recent.map(k => k.volume);

  // Check for continuous decline followed by sharp reversal
  const firstHalf = closes.slice(0, 5);
  const secondHalf = closes.slice(5);

  // First half should be declining
  let declining = true;
  for (let i = 1; i < firstHalf.length; i++) {
    if (firstHalf[i] > firstHalf[i - 1]) {
      declining = false;
      break;
    }
  }

  if (!declining) return null;

  // Last candle should be strong reversal (>5% gain)
  const lastCandle = recent[recent.length - 1];
  const lastCandleChange = (lastCandle.close - lastCandle.open) / lastCandle.open;

  if (lastCandleChange < 0.05) return null;

  // Volume should be high on reversal candle
  const avgVolume = average(volumes.slice(0, -1));
  const lastVolume = volumes[volumes.length - 1];
  const volumeConfirm = lastVolume > avgVolume * 1.5;

  let confidence = 65;
  if (volumeConfirm) confidence += 15;
  if (lastCandleChange > 0.08) confidence += 10;

  return {
    name: 'V形反转',
    type: 'bullish_reversal',
    confidence: Math.min(confidence, 85),
    emoji: '📐',
    description: '急速反转上涨',
    reversalStrength: lastCandleChange * 100,
  };
}

/**
 * Detect all chart patterns
 * @param {Array} klines
 * @returns {Array}
 */
function detectChartPatterns(klines) {
  const patterns = [];

  // Try each pattern detection
  const doubleBottom = detectDoubleBottom(klines);
  if (doubleBottom) patterns.push(doubleBottom);

  const doubleTop = detectDoubleTop(klines);
  if (doubleTop) patterns.push(doubleTop);

  const platform = detectPlatformConsolidation(klines);
  if (platform) patterns.push(platform);

  const vReversal = detectVReversal(klines);
  if (vReversal) patterns.push(vReversal);

  return patterns;
}

module.exports = {
  detectChartPatterns,
  detectDoubleBottom,
  detectDoubleTop,
  detectPlatformConsolidation,
  detectVReversal,
};


