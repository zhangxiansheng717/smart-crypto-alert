const parseBool = (v, def) => {
  if (v === undefined) return def;
  const s = String(v).toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
};

const parseNum = (v, def) => {
  if (v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

function createConfig() {
  return {
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN || '',
      chatId: process.env.TELEGRAM_CHAT_ID || '',
    },
    proxy: {
      httpProxy: process.env.HTTP_PROXY || process.env.http_proxy || '',
      httpsProxy: process.env.HTTPS_PROXY || process.env.https_proxy || '',
    },
    monitor: {
      enable: {
        '5m': parseBool(process.env.ENABLE_5M, true),
        '15m': parseBool(process.env.ENABLE_15M, true),
        '1h': parseBool(process.env.ENABLE_1H, true),
        '4h': parseBool(process.env.ENABLE_4H, false),
        '1d': parseBool(process.env.ENABLE_1D, false),
      },
      thresholds: {
        '5m': parseNum(process.env.PRICE_THRESHOLD_5M, 3.0),
        '15m': parseNum(process.env.PRICE_THRESHOLD_15M, 4.0),
        '1h': parseNum(process.env.PRICE_THRESHOLD_1H, 5.0),
        '4h': parseNum(process.env.PRICE_THRESHOLD_4H, 6.0),
        '1d': parseNum(process.env.PRICE_THRESHOLD_1D, 8.0),
      },
      volumeMedianPeriods: parseNum(process.env.VOLUME_MEDIAN_PERIODS, 20),
      cooldownMinutes: parseNum(process.env.COOLDOWN_MINUTES, 30),
      minVolumeMultiplier: parseNum(process.env.MIN_VOLUME_MULTIPLIER, 1.0),
      concurrencyLimit: parseNum(process.env.CONCURRENCY_LIMIT, 10),
    },
    logLevel: process.env.LOG_LEVEL || 'info',
    binance: {
      restBase: 'https://fapi.binance.com',
      klinesEndpoint: '/fapi/v1/klines',
      exchangeInfoEndpoint: '/fapi/v1/exchangeInfo',
    },
  };
}

module.exports = { createConfig };


