const jwt = require('jsonwebtoken');
const { getPasswordFingerprint } = require('./password');
const { getTokenVersion } = require('./tokenVersion');

const signToken = (expiresIn) => {
  const token = jwt.sign(
    { app: 'flame', pwd: getPasswordFingerprint(), ver: getTokenVersion() },
    process.env.SECRET,
    { expiresIn, algorithm: 'HS256' }
  );
  return token;
};

module.exports = signToken;
