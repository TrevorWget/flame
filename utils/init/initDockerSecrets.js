const fs = require('fs');
const { getSecrets } = require('docker-secret');
const Logger = require('../Logger');
const logger = new Logger();

const initDockerSecrets = () => {
  try {
    const secrets = getSecrets();

    for (const property in secrets) {
      const upperProperty = property.toUpperCase();

      process.env[upperProperty] = secrets[property];

      logger.log(`${upperProperty} was overwritten with docker secret value`);
    }
  } catch (e) {
    logger.log(`Failed to initialize docker secrets. Error: ${e}`, 'ERROR');
  }

  // FOO_FILE=/path sets FOO to the file's contents (trimmed, like docker-secret)
  for (const [key, path] of Object.entries(process.env)) {
    const name = key.match(/^([A-Z][A-Z0-9_]*)_FILE$/)?.[1];

    if (!name || !path) continue;

    try {
      process.env[name] = fs.readFileSync(path, 'utf8').trim();
      logger.log(`${name} was overwritten with the contents of ${key}`);
    } catch (e) {
      // Fail closed rather than fall back to a stale or default value
      delete process.env[name];
      logger.log(
        `${name} is unset because ${key} could not be read: ${e.message}`,
        'ERROR'
      );
    }
  }
};

module.exports = initDockerSecrets;
