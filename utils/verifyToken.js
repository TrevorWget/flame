const jwt = require('jsonwebtoken');
const { isLoginEnabled, getPasswordFingerprint } = require('./password');
const { getTokenVersion } = require('./tokenVersion');

// Returns the payload of an unexpired HS256 token issued for the current
// PASSWORD and token version, or null
const readToken = (token) => {
  if (!token || typeof token !== 'string' || !isLoginEnabled()) {
    return null;
  }

  try {
    const payload = jwt.verify(token, process.env.SECRET, {
      algorithms: ['HS256'],
    });

    const isValid =
      payload.app === 'flame' &&
      payload.pwd === getPasswordFingerprint() &&
      payload.ver === getTokenVersion();

    return isValid ? payload : null;
  } catch {
    return null;
  }
};

const verifyToken = (token) => readToken(token) !== null;

module.exports = verifyToken;
module.exports.readToken = readToken;
