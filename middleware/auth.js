const ErrorResponse = require('../utils/ErrorResponse');
const { readToken } = require('../utils/verifyToken');
const { getProxyUser } = require('../utils/proxyAuth');
const {
  CSRF_HEADER,
  getTokenCookie,
  isCsrfSafe,
} = require('../utils/authCookie');

// The session cookie is sent by the browser automatically, so mutations
// authenticated by it must pass the CSRF check. The Authorization-Flame header
// (for API clients) is never attached implicitly and needs no CSRF check.
// A forward-auth header is added by the proxy to every request the browser
// makes, so it is treated like the cookie.
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
  req.proxyUser = req.tokenPayload ? null : getProxyUser(req);

  if (req.proxyUser && !isCsrfSafe(req)) {
    return next(new ErrorResponse(`Missing ${CSRF_HEADER} header`, 403));
  }

  req.isAuthenticated = req.tokenPayload !== null || req.proxyUser !== null;

  next();
};

module.exports = auth;
