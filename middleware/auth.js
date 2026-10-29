const ErrorResponse = require('../utils/ErrorResponse');
const { readToken } = require('../utils/verifyToken');
const {
  CSRF_HEADER,
  getTokenCookie,
  isCsrfSafe,
} = require('../utils/authCookie');

// The session cookie is sent by the browser automatically, so mutations
// authenticated by it must pass the CSRF check. The Authorization-Flame header
// (for API clients) is never attached implicitly and needs no CSRF check.
const auth = (req, res, next) => {
  const authHeader = req.header('Authorization-Flame');
  let token;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else {
    token = getTokenCookie(req);

    if (token && !isCsrfSafe(req)) {
      return next(new ErrorResponse(`Missing ${CSRF_HEADER} header`, 403));
    }
  }

  req.tokenPayload = readToken(token);
  req.isAuthenticated = req.tokenPayload !== null;

  next();
};

module.exports = auth;
