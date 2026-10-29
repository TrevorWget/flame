const crypto = require('crypto');

// Values that have shipped in Flame's Dockerfiles, .env, compose files or README
const KNOWN_DEFAULT_PASSWORDS = [
  'flame_password',
  'change_me',
  'my_custom_secret_password_123',
];

const getPasswordProblem = () => {
  const password = process.env.PASSWORD;

  if (typeof password !== 'string' || password.length === 0) {
    return 'PASSWORD is not set';
  }

  if (KNOWN_DEFAULT_PASSWORDS.includes(password)) {
    return 'PASSWORD is set to a publicly known default value';
  }

  return null;
};

const isLoginEnabled = () => getPasswordProblem() === null;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest();

const checkPassword = (candidate) => {
  if (!isLoginEnabled() || typeof candidate !== 'string' || !candidate) {
    return false;
  }

  return crypto.timingSafeEqual(
    sha256(candidate),
    sha256(process.env.PASSWORD)
  );
};

// Embedded in tokens so that changing PASSWORD invalidates existing sessions
const getPasswordFingerprint = () =>
  crypto
    .createHmac('sha256', process.env.SECRET)
    .update(process.env.PASSWORD || '')
    .digest('base64')
    .slice(0, 22);

module.exports = {
  KNOWN_DEFAULT_PASSWORDS,
  getPasswordProblem,
  isLoginEnabled,
  checkPassword,
  getPasswordFingerprint,
};
