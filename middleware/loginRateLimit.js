const ErrorResponse = require('../utils/ErrorResponse');

const MAX_FAILED_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

// ip -> { count, resetAt }. In-memory, so limits reset on restart.
const attempts = new Map();

setInterval(() => {
  const now = Date.now();

  for (const [ip, entry] of attempts) {
    if (entry.resetAt <= now) {
      attempts.delete(ip);
    }
  }
}, WINDOW_MS).unref();

// Counts every attempt up front (so parallel requests can't slip past the
// limit) and forgets the client's attempts after a successful login.
const loginRateLimit = (req, res, next) => {
  const ip = req.ip;
  const now = Date.now();

  let entry = attempts.get(ip);

  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    attempts.set(ip, entry);
  }

  if (entry.count >= MAX_FAILED_ATTEMPTS) {
    res.set('Retry-After', Math.ceil((entry.resetAt - now) / 1000));

    return next(
      new ErrorResponse('Too many login attempts, try again later', 429)
    );
  }

  entry.count++;

  res.on('finish', () => {
    if (res.statusCode < 400) {
      attempts.delete(ip);
    }
  });

  next();
};

module.exports = loginRateLimit;
