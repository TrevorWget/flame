const initConfig = require('./initConfig');
const initFiles = require('./initFiles');
const initDockerSecrets = require('./initDockerSecrets');
const initSecret = require('./initSecret');
const initPassword = require('./initPassword');
const normalizeTheme = require('./normalizeTheme');

const initApp = async () => {
  initDockerSecrets();
  initSecret();
  initPassword();
  await initFiles();
  await initConfig();
  await normalizeTheme();
};

module.exports = initApp;
