require('dotenv').config();
const { createConfig } = require('./config/config');
const { TelegramService } = require('./services/telegram');

(async () => {
  const config = createConfig();

  if (!config.telegram.botToken || !config.telegram.chatId) {
    console.error('❌ TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set in .env');
    process.exit(1);
  }

  const telegram = new TelegramService(config);

  // Mock data for testing
  const testData = {
    symbol: 'BTCUSDT',
    interval: '15m',
    openPrice: 48000,
    currentPrice: 48500,
    priceChange: 1.04,
    volumeMultiplier: 2.3,
    quoteVolume: 1500000,
    rsi: 65,
    ema7: 48200,
    ema25: 47500,
    adx: 28,
    plusDI: 30,
    minusDI: 15,
    trend: 'bullish',
    supportLevel: 47500,
    resistanceLevel: 49500,
    timestamp: Date.now(),
  };

  console.log('📤 Sending test alert...');
  await telegram.sendAlert(testData);
  console.log('✅ Test alert sent. Check your Telegram.');
  process.exit(0);
})();

