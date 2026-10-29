const verifyToken = require('../utils/verifyToken');

const auth = (req, res, next) => {
  const authHeader = req.header('Authorization-Flame');
  let token;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  req.isAuthenticated = verifyToken(token);

  next();
};

module.exports = auth;
