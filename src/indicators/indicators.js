/**
 * Technical Indicators: RSI, EMA, ADX
 */

/**
 * Calculate RSI (Relative Strength Index)
 * @param {number[]} closes - array of close prices (oldest first)
 * @param {number} period - default 14
 * @returns {number} RSI value (0-100)
 */
function calculateRSI(closes, period = 14) {
  if (!closes || closes.length < period + 1) return 50;

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
 * Calculate EMA (Exponential Moving Average)
 * @param {number[]} values - array of values (oldest first)
 * @param {number} period
 * @returns {number} EMA value (full precision)
 */
function calculateEMA(values, period) {
  if (!values || values.length < period) return 0;

  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }

  return ema;
}

/**
 * Calculate ADX (Average Directional Index)
 * @param {Array<{high, low, close}>} candles - oldest first
 * @param {number} period - default 14
 * @returns {{adx: number, plusDI: number, minusDI: number}}
 */
function calculateADX(candles, period = 14) {
  if (!candles || candles.length < period + 1) {
    return { adx: 0, plusDI: 0, minusDI: 0 };
  }

  const tr = [];
  const plusDM = [];
  const minusDM = [];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    const prevClose = candles[i - 1].close;

    const trueRange = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    tr.push(trueRange);

    const upMove = high - prevHigh;
    const downMove = prevLow - low;

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  // Smooth TR, +DM, -DM using Wilder's smoothing
  let smoothTR = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);

  const diPlus = [];
  const diMinus = [];

  for (let i = period; i < tr.length; i++) {
    smoothTR = smoothTR - smoothTR / period + tr[i];
    smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
    smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];

    diPlus.push(smoothTR > 0 ? (smoothPlusDM / smoothTR) * 100 : 0);
    diMinus.push(smoothTR > 0 ? (smoothMinusDM / smoothTR) * 100 : 0);
  }

  if (diPlus.length === 0) {
    return { adx: 0, plusDI: 0, minusDI: 0 };
  }

  // Calculate DX
  const dx = [];
  for (let i = 0; i < diPlus.length; i++) {
    const sum = diPlus[i] + diMinus[i];
    const diff = Math.abs(diPlus[i] - diMinus[i]);
    dx.push(sum > 0 ? (diff / sum) * 100 : 0);
  }

  // ADX is EMA of DX
  let adx = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dx.length; i++) {
    adx = (dx[i] + (period - 1) * adx) / period;
  }

  const latestDIPlus = diPlus[diPlus.length - 1] || 0;
  const latestDIMinus = diMinus[diMinus.length - 1] || 0;

  return {
    adx: parseFloat(adx.toFixed(2)),
    plusDI: parseFloat(latestDIPlus.toFixed(2)),
    minusDI: parseFloat(latestDIMinus.toFixed(2)),
  };
}

module.exports = {
  calculateRSI,
  calculateEMA,
  calculateADX,
};

