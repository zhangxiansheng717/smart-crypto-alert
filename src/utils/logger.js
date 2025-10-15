const logLevel = process.env.LOG_LEVEL || 'info';

const levels = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = levels[logLevel] || 1;

function log(level, ...args) {
  if (levels[level] >= currentLevel) {
    const timestamp = new Date().toLocaleString('zh-CN', { hour12: false });
    console.log(`[${timestamp}] [${level.toUpperCase()}]`, ...args);
  }
}

const logger = {
  debug: (...args) => log('debug', ...args),
  info: (...args) => log('info', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args),
};

module.exports = { logger };

