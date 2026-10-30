const crypto = require('crypto');
const { getCookie } = require('./authCookie');

const STATE_COOKIE = 'flame_oidc';
const STATE_PATH = '/api/auth/oidc';
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

const key = () =>
  Buffer.from(
    crypto.hkdfSync(
      'sha256',
      process.env.SECRET,
      Buffer.alloc(0),
      'flame-oidc-state',
      32
    )
  );

// Lax, not Strict: the cookie must come back on the provider's cross-site
// redirect to the callback
const cookieOptions = (req) => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: req.secure,
  path: STATE_PATH,
});

// Encrypted, not just signed, because it holds the PKCE verifier
const seal = (data) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(data), 'utf8'),
    cipher.final(),
  ]);

  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
};

const unseal = (value) => {
  try {
    const raw = Buffer.from(value, 'base64url');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key(),
      raw.subarray(0, 12)
    );
    decipher.setAuthTag(raw.subarray(12, 28));

    return JSON.parse(
      Buffer.concat([
        decipher.update(raw.subarray(28)),
        decipher.final(),
      ]).toString('utf8')
    );
  } catch {
    return null;
  }
};

const setOidcState = (req, res, state) => {
  res.cookie(
    STATE_COOKIE,
    seal({ ...state, exp: Date.now() + STATE_MAX_AGE_MS }),
    { ...cookieOptions(req), maxAge: STATE_MAX_AGE_MS }
  );
};

// Returns the unexpired state of the login this browser started, or null.
// Always clears the cookie: each state is good for one callback only.
const takeOidcState = (req, res) => {
  const value = getCookie(req, STATE_COOKIE);

  res.clearCookie(STATE_COOKIE, cookieOptions(req));

  const state = value ? unseal(value) : null;

  return state && state.exp > Date.now() ? state : null;
};

module.exports = { STATE_COOKIE, setOidcState, takeOidcState };
