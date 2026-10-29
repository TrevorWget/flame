const Logger = require('../../../utils/Logger');
const logger = new Logger();

// Integration syncs run every 30 seconds; repeated warnings are logged once per process
const warned = new Set();

const warnOnce = (message) => {
  if (!warned.has(message)) {
    warned.add(message);
    logger.log(message, 'WARN');
  }
};

module.exports = warnOnce;
