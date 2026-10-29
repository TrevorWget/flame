const TOKEN_COOKIE = 'flame_token';

// Browsers only let same-origin scripts set custom headers (cross-origin
// requests carrying one need a CORS preflight, which Flame never grants), so
// requiring it on cookie-authenticated mutations blocks CSRF. SameSite alone
// doesn't cover other services on the same host, which are "same-site".
const CSRF_HEADER = 'X-Flame-CSRF';

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

const cookieOptions = (req) => ({
  httpOnly: true,
  sameSite: 'strict',
  // req.secure honours X-Forwarded-Proto when TRUST_PROXY is set; plain-HTTP
  // LAN installs get a non-Secure cookie so login keeps working
  secure: req.secure,
  path: '/',
});

const getCookie = (req, name) => {
  for (const part of (req.headers.cookie || '').split(';')) {
    const separator = part.indexOf('=');

    if (separator > -1 && part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }

  return undefined;
};

const getTokenCookie = (req) => getCookie(req, TOKEN_COOKIE);

const setTokenCookie = (req, res, token, expires) => {
  res.cookie(TOKEN_COOKIE, token, { ...cookieOptions(req), expires });
};

const clearTokenCookie = (req, res) => {
  res.clearCookie(TOKEN_COOKIE, cookieOptions(req));
};

const isCsrfSafe = (req) =>
  SAFE_METHODS.includes(req.method) || Boolean(req.get(CSRF_HEADER));

module.exports = {
  TOKEN_COOKIE,
  CSRF_HEADER,
  getCookie,
  getTokenCookie,
  setTokenCookie,
  clearTokenCookie,
  isCsrfSafe,
};
