/**
 * Test pattern recognition functionality
 */

require('dotenv').config();
const { createConfig } = require('./config/config');
const { BinanceService } = require('./services/binance');
const { analyzePatterns, getPatternRecommendation } = require('./patterns/pattern-fusion');
const { logger } = require('./utils/logger');

(async () => {
  logger.info('Testing pattern recognition...');

  const config = createConfig();
  const binance = new BinanceService(config);

  // Test symbols
  const testSymbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];

  for (const symbol of testSymbols) {
    logger.info(`\n${'='.repeat(60)}`);
    logger.info(`Testing ${symbol}...`);
    logger.info('='.repeat(60));

    // Get data
    const data = await binance.processSymbol(symbol, '1h', 30);
    
    if (!data || !data.klines) {
      logger.warn(`Failed to fetch data for ${symbol}`);
      continue;
    }

    // Analyze patterns
    const patternAnalysis = await analyzePatterns(data.klines, {
      rsi: data.rsi,
      ema7: data.ema7,
      ema25: data.ema25,
      adx: data.adx,
      trend: data.trend,
      volumeMultiplier: data.volumeMultiplier,
    });

    logger.info(`\nCurrent Price: $${data.currentPrice.toFixed(2)}`);
    logger.info(`Price Change: ${data.priceChange > 0 ? '+' : ''}${data.priceChange.toFixed(2)}%`);
    logger.info(`RSI: ${data.rsi.toFixed(0)} | ADX: ${data.adx} | Trend: ${data.trend}`);
    logger.info(`Volume: ${data.volumeMultiplier.toFixed(1)}x\n`);

    // Display patterns
    if (patternAnalysis.patterns.length > 0) {
      logger.info('📊 Detected Patterns:');
      patternAnalysis.patterns.forEach(p => {
        logger.info(`  ${p.emoji} ${p.name} (${p.type}) - Confidence: ${p.confidence}%`);
        logger.info(`     ${p.description}`);
      });
    } else {
      logger.info('📊 No significant patterns detected');
    }

    // Display fusion signals
    if (patternAnalysis.fusionSignals.length > 0) {
      logger.info('\n🔥 Fusion Signals:');
      patternAnalysis.fusionSignals.forEach(s => {
        logger.info(`  ${s.emoji} ${s.name} - Confidence: ${s.confidence}%`);
        logger.info(`     ${s.description}`);
      });
    }

    // Display recommendation
    const recommendation = getPatternRecommendation(
      patternAnalysis,
      data.currentPrice,
      data.priceChange > 0 ? 'up' : 'down'
    );

    logger.info(`\n💡 Recommendation: ${recommendation.emoji} ${recommendation.action.toUpperCase()}`);
    logger.info(`   Reason: ${recommendation.reason}`);
    logger.info(`\n🎯 Overall Confidence: ${patternAnalysis.overallConfidence}%`);
    logger.info(`📝 Summary: ${patternAnalysis.summary}`);
  }

  logger.info(`\n${'='.repeat(60)}`);
  logger.info('✅ Pattern recognition test completed');
  process.exit(0);
})();


