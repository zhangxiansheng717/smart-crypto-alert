/**
 * Test TA-Lib integration with Node.js
 */

const TALibClient = require('./patterns/talib-client');
const { analyzePatterns } = require('./patterns/pattern-fusion');

// Sample klines data
const sampleKlines = [
  { open: 100, high: 102, low: 98, close: 99, volume: 1000 },
  { open: 99, high: 101, low: 97, close: 98, volume: 1100 },
  { open: 98, high: 100, low: 95, close: 99.5, volume: 1500 },
  { open: 99.5, high: 103, low: 99, close: 102, volume: 1800 },
  { open: 102, high: 105, low: 101, close: 104, volume: 2000 },
  { open: 104, high: 106, low: 103, close: 105, volume: 1900 },
  { open: 105, high: 108, low: 104, close: 107, volume: 2200 },
  { open: 107, high: 110, low: 106, close: 109, volume: 2500 },
  { open: 109, high: 111, low: 108, close: 110, volume: 2300 },
  { open: 110, high: 112, low: 109, close: 111, volume: 2100 },
  { open: 111, high: 113, low: 110, close: 112, volume: 2000 },
  { open: 112, high: 114, low: 111, close: 113, volume: 1900 },
  { open: 113, high: 115, low: 112, close: 114, volume: 1800 },
  { open: 114, high: 116, low: 113, close: 115, volume: 1700 },
  { open: 115, high: 117, low: 114, close: 116, volume: 1600 },
  { open: 116, high: 118, low: 115, close: 117, volume: 1500 },
  { open: 117, high: 119, low: 116, close: 118, volume: 1400 },
  { open: 118, high: 120, low: 117, close: 119, volume: 1300 },
  { open: 119, high: 121, low: 118, close: 120, volume: 1200 },
  { open: 120, high: 122, low: 119, close: 121, volume: 1100 },
];

const technicalData = {
  rsi: 65,
  ema7: 115,
  ema25: 108,
  trend: 'bullish',
  volumeMultiplier: 1.8,
  adx: 28
};

async function testTALibClient() {
  console.log('🧪 Testing TA-Lib Client\n');
  console.log('='.repeat(60));
  
  const client = new TALibClient();
  
  // Test 1: Check availability
  console.log('\n1️⃣ Checking service availability...');
  const isAvailable = await client.isAvailable();
  if (isAvailable) {
    console.log('✅ TA-Lib service is available');
  } else {
    console.log('❌ TA-Lib service is NOT available');
    console.log('   Please start the Python service first:');
    console.log('   cd python-service && python pattern_service.py');
    return;
  }
  
  // Test 2: Detect patterns
  console.log('\n2️⃣ Detecting candlestick patterns...');
  const patterns = await client.detectPatterns(sampleKlines);
  
  if (patterns.length > 0) {
    console.log(`✅ Found ${patterns.length} pattern(s):`);
    patterns.forEach(p => {
      console.log(`   • ${p.name} (${p.type}) - ${p.signal}, confidence: ${p.confidence}%`);
    });
  } else {
    console.log('ℹ️  No patterns detected (this is normal for uptrend data)');
  }
  
  // Test 3: List available patterns
  console.log('\n3️⃣ Listing available patterns...');
  const allPatterns = await client.listPatterns();
  
  if (allPatterns.length > 0) {
    console.log(`✅ Total ${allPatterns.length} patterns available`);
    console.log('\n   Sample patterns:');
    allPatterns.slice(0, 10).forEach(p => {
      console.log(`   • ${p.name} (${p.type})`);
    });
    console.log(`   ... and ${allPatterns.length - 10} more`);
  }
  
  // Test 4: Calculate indicators
  console.log('\n4️⃣ Calculating indicators...');
  const closes = sampleKlines.map(k => k.close);
  const indicators = await client.calculateIndicators(closes, ['RSI', 'EMA']);
  
  if (indicators) {
    console.log('✅ Indicators calculated:');
    if (indicators.rsi) {
      const rsiValues = indicators.rsi.filter(v => v !== null && !isNaN(v));
      console.log(`   • RSI (last): ${rsiValues[rsiValues.length - 1]?.toFixed(2)}`);
    }
    if (indicators.ema7) {
      const ema7Values = indicators.ema7.filter(v => v !== null && !isNaN(v));
      console.log(`   • EMA7 (last): ${ema7Values[ema7Values.length - 1]?.toFixed(2)}`);
    }
    if (indicators.ema25) {
      const ema25Values = indicators.ema25.filter(v => v !== null && !isNaN(v));
      console.log(`   • EMA25 (last): ${ema25Values[ema25Values.length - 1]?.toFixed(2)}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ TA-Lib client test completed successfully!\n');
}

async function testPatternFusion() {
  console.log('\n🧪 Testing Pattern Fusion Integration\n');
  console.log('='.repeat(60));
  
  console.log('\n🔍 Analyzing patterns with fusion...');
  
  const analysis = await analyzePatterns(sampleKlines, technicalData);
  
  console.log('\n📊 Pattern Analysis Results:');
  console.log(`   Total patterns found: ${analysis.patterns.length}`);
  console.log(`   Overall confidence: ${analysis.overallConfidence}%`);
  console.log(`   Summary: ${analysis.summary}`);
  
  if (analysis.patterns.length > 0) {
    console.log('\n   Detected patterns:');
    analysis.patterns.forEach(p => {
      const source = p.source === 'talib' ? '(TA-Lib)' : '(Built-in)';
      console.log(`   • ${p.emoji} ${p.name} ${source} - ${p.confidence}%`);
    });
  }
  
  if (analysis.fusionSignals && analysis.fusionSignals.length > 0) {
    console.log('\n   🚀 Fusion signals:');
    analysis.fusionSignals.forEach(s => {
      console.log(`   • ${s.emoji} ${s.name} - ${s.confidence}%`);
      console.log(`     ${s.description}`);
    });
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Pattern fusion test completed!\n');
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 TA-Lib Integration Test Suite');
  console.log('='.repeat(60));
  
  try {
    // Run tests
    await testTALibClient();
    await testPatternFusion();
    
    console.log('✅ All tests completed successfully!\n');
    console.log('💡 Next steps:');
    console.log('   1. Start the main service: npm start');
    console.log('   2. Monitor Telegram for alerts with enhanced pattern detection');
    console.log('   3. Check logs for "TA-Lib service connected" message\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Ensure Python service is running: cd python-service && python pattern_service.py');
    console.error('   2. Check service health: curl http://localhost:5000/health');
    console.error('   3. Verify port 5000 is not in use\n');
    process.exit(1);
  }
}

// Run tests
main();

