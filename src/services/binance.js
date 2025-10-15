const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { logger } = require('../utils/logger');
const { calculateRSI, calculateEMA, calculateADX } = require('../indicators/indicators');

class BinanceService {
  constructor(config) {
    this.config = config;
    this.baseURL = config.binance.restBase;
    this.proxyAgent = null;

    if (config.proxy.httpsProxy) {
      this.proxyAgent = new HttpsProxyAgent(config.proxy.httpsProxy);
      logger.info(`Using proxy: ${config.proxy.httpsProxy}`);
    }
  }

  /**
   * Get all USDT perpetual symbols
   */
  async getUSDTSymbols() {
    try {
      const url = `${this.baseURL}${this.config.binance.exchangeInfoEndpoint}`;
      const res = await axios.get(url, {
        httpsAgent: this.proxyAgent,
        timeout: 10000,
      });

      const symbols = res.data.symbols
        .filter(s => s.symbol.endsWith('USDT') && s.status === 'TRADING' && s.contractType === 'PERPETUAL')
        .map(s => s.symbol);

      logger.info(`Fetched ${symbols.length} USDT perpetual symbols.`);
      return symbols;
    } catch (err) {
      logger.error('Failed to fetch symbols:', err.message);
      return [];
    }
  }

  /**
   * Get klines for a symbol
   * @param {string} symbol
   * @param {string} interval - 5m, 15m, 1h, 4h, 1d
   * @param {number} limit - number of candles
   */
  async getKlines(symbol, interval, limit = 100) {
    try {
      const url = `${this.baseURL}${this.config.binance.klinesEndpoint}`;
      const res = await axios.get(url, {
        httpsAgent: this.proxyAgent,
        timeout: 10000,
        params: { symbol, interval, limit },
      });

      return res.data.map(k => ({
        openTime: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        closeTime: k[6],
        quoteVolume: parseFloat(k[7]),
      }));
    } catch (err) {
      logger.debug(`Failed to fetch klines for ${symbol} ${interval}:`, err.message);
      return null;
    }
  }

  /**
   * Process klines and calculate indicators
   * @param {string} symbol
   * @param {string} interval
   * @param {number} volumeMedianPeriods
   * @returns {object|null}
   */
  async processSymbol(symbol, interval, volumeMedianPeriods = 20) {
    const requiredCandles = Math.max(volumeMedianPeriods + 2, 30) + 5;
    const klines = await this.getKlines(symbol, interval, requiredCandles);

    if (!klines || klines.length < volumeMedianPeriods + 2) {
      return null;
    }

    const latest = klines[klines.length - 1];
    const openPrice = klines[klines.length - 2].close; // Previous candle close as "open" reference
    const currentPrice = latest.close;
    const priceChange = ((currentPrice - openPrice) / openPrice) * 100;

    // Volume analysis
    const volumeHistory = klines.slice(-volumeMedianPeriods - 1, -1).map(k => k.volume);
    const sortedVolumes = [...volumeHistory].sort((a, b) => a - b);
    const volumeMedian = sortedVolumes[Math.floor(sortedVolumes.length / 2)];
    const volumeMultiplier = volumeMedian > 0 ? latest.volume / volumeMedian : 1;

    // Technical indicators
    const closes = klines.map(k => k.close);
    const rsi = calculateRSI(closes, 14);
    const ema7 = calculateEMA(closes, 7);
    const ema25 = calculateEMA(closes, 25);
    const { adx, plusDI, minusDI } = calculateADX(klines, 14);

    // Trend
    let trend = 'neutral';
    if (ema7 > ema25 && currentPrice > ema7) trend = 'bullish';
    else if (ema7 < ema25 && currentPrice < ema7) trend = 'bearish';

    // Support/Resistance
    const recentHighs = klines.slice(-10).map(k => k.high);
    const recentLows = klines.slice(-10).map(k => k.low);
    const recentHigh = Math.max(...recentHighs);
    const recentLow = Math.min(...recentLows);

    let supportLevel = ema25;
    let resistanceLevel = recentHigh;

    if (currentPrice > ema25) {
      supportLevel = ema25;
      resistanceLevel = recentHigh;
    } else if (currentPrice < ema25) {
      supportLevel = recentLow;
      resistanceLevel = ema25;
    } else {
      supportLevel = ema7 < ema25 ? ema7 : recentLow;
      resistanceLevel = ema7 > ema25 ? ema7 : recentHigh;
    }

    return {
      symbol,
      interval,
      openPrice,
      currentPrice,
      priceChange,
      volumeMultiplier,
      quoteVolume: latest.quoteVolume,
      rsi,
      ema7,
      ema25,
      adx,
      plusDI,
      minusDI,
      trend,
      supportLevel,
      resistanceLevel,
      timestamp: latest.closeTime,
      klines, // Include raw klines for pattern recognition
    };
  }

  /**
   * Process all symbols for a timeframe
   * @param {string[]} symbols
   * @param {string} interval
   * @param {number} concurrency
   * @param {number} volumeMedianPeriods
   */
  async processAllSymbols(symbols, interval, concurrency = 10, volumeMedianPeriods = 20) {
    const results = [];
    const chunks = [];

    for (let i = 0; i < symbols.length; i += concurrency) {
      chunks.push(symbols.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(sym => this.processSymbol(sym, interval, volumeMedianPeriods));
      const res = await Promise.all(promises);
      results.push(...res.filter(r => r !== null));
    }

    return results;
  }
}

module.exports = { BinanceService };

