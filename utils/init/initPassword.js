const { getPasswordProblem } = require('../password');
const { getProxyAuthHeader } = require('../proxyAuth');
const { isOidcEnabled } = require('../oidc');
const Logger = require('../Logger');
const logger = new Logger();

const initPassword = () => {
  const problem = getPasswordProblem();

  if (!problem) return;

  if (getProxyAuthHeader() || isOidcEnabled()) {
    logger.log(
      `${problem}. Password login is disabled; sign in with OIDC or your reverse proxy instead.`,
      'WARN'
    );
    return;
  }

  logger.log(
    `${problem}. Login is DISABLED and the dashboard is read-only until you set PASSWORD (or PASSWORD_FILE / a docker secret) to a strong, non-default value.`,
    'ERROR'
  );
};

module.exports = initPassword;
