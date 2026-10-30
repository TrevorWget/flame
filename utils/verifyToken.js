const jwt = require('jsonwebtoken');
const { isLoginEnabled, getPasswordFingerprint } = require('./password');
const { isOidcEnabled, getOidcFingerprint } = require('./oidc');
const { getTokenVersion } = require('./tokenVersion');

// Returns the payload of an unexpired HS256 token issued for the current token
// version and the current PASSWORD (or OIDC settings, for OIDC sessions), or null
const readToken = (token) => {
  if (!token || typeof token !== 'string') {
    return null;
  }

  try {
    const payload = jwt.verify(token, process.env.SECRET, {
      algorithms: ['HS256'],
    });

    if (payload.app !== 'flame' || payload.ver !== getTokenVersion()) {
      return null;
    }

    const isValid =
      payload.sso === undefined
        ? isLoginEnabled() && payload.pwd === getPasswordFingerprint()
        : payload.sso === 'oidc' &&
          typeof payload.sub === 'string' &&
          isOidcEnabled() &&
          payload.sfp === getOidcFingerprint();

    return isValid ? payload : null;
  } catch {
    return null;
  }
};

const verifyToken = (token) => readToken(token) !== null;

module.exports = verifyToken;
module.exports.readToken = readToken;
