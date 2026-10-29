const jwt = require('jsonwebtoken');
const { getPasswordFingerprint } = require('./password');
const { getOidcFingerprint } = require('./oidc');
const { getTokenVersion } = require('./tokenVersion');

// Must match the session duration options in the client's AuthForm
const SESSION_DURATIONS = ['1h', '1d', '14d', '30d', '1y'];

// Password sessions are bound to PASSWORD, OIDC sessions (`oidc` set to the
// user name) to the OIDC provider settings
const signToken = (expiresIn, { oidc } = {}) => {
  const claims = oidc
    ? { app: 'flame', sso: 'oidc', sub: oidc, sfp: getOidcFingerprint() }
    : { app: 'flame', pwd: getPasswordFingerprint() };

  const token = jwt.sign(
    { ...claims, ver: getTokenVersion() },
    process.env.SECRET,
    { expiresIn, algorithm: 'HS256' }
  );
  return token;
};

module.exports = signToken;
module.exports.SESSION_DURATIONS = SESSION_DURATIONS;
