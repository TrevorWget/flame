const jwt = require('jsonwebtoken');
const { isLoginEnabled, getPasswordFingerprint } = require('./password');

// Returns true only for unexpired HS256 tokens issued for the current PASSWORD
const verifyToken = (token) => {
  if (!token || typeof token !== 'string' || !isLoginEnabled()) {
    return false;
  }

  try {
    const payload = jwt.verify(token, process.env.SECRET, {
      algorithms: ['HS256'],
    });

    return payload.app === 'flame' && payload.pwd === getPasswordFingerprint();
  } catch {
    return false;
  }
};

module.exports = verifyToken;
