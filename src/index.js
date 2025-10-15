require('dotenv').config();

const { createConfig } = require('./config/config');
const { MultiTimeframeMonitor } = require('./services/monitor');
const { logger } = require('./utils/logger');

(async () => {
  const config = createConfig();
  const monitor = new MultiTimeframeMonitor(config);
  await monitor.start();
  logger.info('Smart Crypto Alert started.');
})();


