const jwt = require('jsonwebtoken');
const { getPasswordFingerprint } = require('./password');

const signToken = (expiresIn) => {
  const token = jwt.sign(
    { app: 'flame', pwd: getPasswordFingerprint() },
    process.env.SECRET,
    { expiresIn, algorithm: 'HS256' }
  );
  return token;
};

module.exports = signToken;
