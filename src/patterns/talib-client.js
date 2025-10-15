/**
 * TA-Lib Pattern Service Client
 * Connects to Python microservice for advanced pattern recognition
 */

const axios = require('axios');
const logger = require('../utils/logger');

class TALibClient {
  constructor(serviceUrl = 'http://localhost:5000') {
    this.serviceUrl = serviceUrl;
    this.timeout = 5000; // 5 seconds timeout
  }

  /**
   * Check if service is available
   */
  async isAvailable() {
    try {
      const response = await axios.get(`${this.serviceUrl}/health`, { timeout: 2000 });
      return response.data.status === 'healthy';
    } catch (error) {
      return false;
    }
  }

  /**
   * Detect candlestick patterns using TA-Lib (62 patterns)
   * @param {Array} klines - array of kline objects {open, high, low, close}
   * @returns {Array} detected patterns
   */
  async detectPatterns(klines) {
    try {
      if (!klines || klines.length < 3) {
        return [];
      }

      const response = await axios.post(
        `${this.serviceUrl}/patterns`,
        { klines },
        { timeout: this.timeout }
      );

      if (response.data.success) {
        return response.data.patterns.map(p => ({
          name: p.name,
          type: p.type,
          signal: p.signal,
          confidence: p.confidence,
          code: p.code,
          source: 'talib'
        }));
      }

      return [];
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        logger.debug('TA-Lib service not available, using fallback');
      } else {
        logger.error(`TA-Lib pattern detection error: ${error.message}`);
      }
      return [];
    }
  }

  /**
   * Get list of all available patterns
   */
  async listPatterns() {
    try {
      const response = await axios.get(`${this.serviceUrl}/patterns/list`, { 
        timeout: this.timeout 
      });
      return response.data.patterns;
    } catch (error) {
      logger.error(`Failed to list patterns: ${error.message}`);
      return [];
    }
  }

  /**
   * Calculate indicators using TA-Lib
   * @param {Array} close - closing prices
   * @param {Array} indicators - ['RSI', 'MACD', 'EMA']
   */
  async calculateIndicators(close, indicators = ['RSI', 'MACD', 'EMA']) {
    try {
      const response = await axios.post(
        `${this.serviceUrl}/indicators`,
        { close, indicators },
        { timeout: this.timeout }
      );

      if (response.data.success) {
        return response.data.indicators;
      }

      return null;
    } catch (error) {
      logger.error(`TA-Lib indicator calculation error: ${error.message}`);
      return null;
    }
  }
}

module.exports = TALibClient;

