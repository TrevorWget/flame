const { parseTrustProxy } = require('../trustProxy');
const { getProxyAuthHeader, getProxyAuthProblem } = require('../proxyAuth');
const {
  isOidcConfigured,
  getOidcProblem,
  getOidcSettings,
  getOidcConfiguration,
} = require('../oidc');
const Logger = require('../Logger');
const logger = new Logger();

const initSso = () => {
  const header = getProxyAuthHeader();

  if (header) {
    const problem = getProxyAuthProblem(
      parseTrustProxy(process.env.TRUST_PROXY)
    );

    if (problem) {
      logger.log(
        `AUTH_PROXY_HEADER is set but forward-auth login is DISABLED: ${problem}.`,
        'ERROR'
      );
    } else {
      logger.log(
        `Forward-auth login enabled: trusting the ${header} header from ${process.env.TRUST_PROXY.trim()}`
      );
    }
  }

  if (isOidcConfigured()) {
    const problem = getOidcProblem();

    if (problem) {
      logger.log(`OIDC login is DISABLED: ${problem}.`, 'ERROR');
      return;
    }

    const { discoveryUrl } = getOidcSettings();

    // Only for the log; logins retry discovery if this fails
    getOidcConfiguration().then(
      () => logger.log(`OIDC login enabled (${discoveryUrl})`),
      (e) =>
        logger.log(
          `OIDC discovery from ${discoveryUrl} failed, retrying on the next login: ${e.message}`,
          'WARN'
        )
    );
  }
};

module.exports = initSso;
