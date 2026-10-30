// Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const { join } = require('path');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const PASSWORD = 'ci-test-password-8f2d';
const WEATHER_API_KEY = 'ci-weather-key-do-not-leak';
const DOCKER_HOST = 'tcp://10.20.30.40:2375';

process.env.NODE_ENV = 'test';
process.env.PASSWORD = PASSWORD;
process.env.SECRET = crypto.randomBytes(32).toString('hex');

// Config is read from data/ relative to the working directory, so each run
// gets its own copy instead of touching the developer's data/
const repoRoot = join(__dirname, '..');
const workDir = fs.mkdtempSync(join(os.tmpdir(), 'flame-api-test-'));
const configPath = join(workDir, 'data/config.json');

fs.mkdirSync(join(workDir, 'data'));
fs.writeFileSync(
  configPath,
  JSON.stringify({
    ...require('../utils/init/initialConfig.json'),
    customTitle: 'CI Flame',
    WEATHER_API_KEY,
    dockerHost: DOCKER_HOST,
    lat: 51.5,
    long: -0.12,
  })
);
process.chdir(workDir);

// The error handler logs every rejected request
test.mock.method(console, 'log', () => {});

test.after(async () => {
  // Saving a weather key schedules the weather jobs, which keep the process alive
  await require('node-schedule').gracefulShutdown();
  process.chdir(repoRoot);
  fs.rmSync(workDir, { recursive: true, force: true });
});

const api = require('../api');
const { PUBLIC_KEYS, DERIVED_KEYS } = require('../utils/sanitizeConfig');
const { getPasswordFingerprint } = require('../utils/password');
const { getTokenVersion } = require('../utils/tokenVersion');

const withEnv = async (overrides, fn) => {
  const saved = {};

  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];

    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }

  try {
    await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const CSRF = { 'X-Flame-CSRF': '1' };

const login = (body) => request(api).post('/api/auth').set(CSRF).send(body);

const getSetCookie = (res) =>
  (res.headers['set-cookie'] || []).find((c) => c.startsWith('flame_token='));

const getToken = async () => {
  const res = await login({ password: PASSWORD, duration: '1h' });
  assert.strictEqual(res.status, 200);

  return getSetCookie(res).split(';')[0].slice('flame_token='.length);
};

const tokenClaims = () => ({
  app: 'flame',
  pwd: getPasswordFingerprint(),
  ver: getTokenVersion(),
});

const getAdminConfig = (token) => {
  const req = request(api).get('/api/config/admin');

  return token ? req.set('Authorization-Flame', `Bearer ${token}`) : req;
};

test.describe('auth', () => {
  test('correct password returns a token that validates', async () => {
    const token = await getToken();

    const res = await request(api).post('/api/auth/validate').send({ token });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.token.isValid, true);
  });

  test('wrong password is rejected', async () => {
    const res = await login({ password: 'wrong', duration: '1h' });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.data, undefined);
  });

  test('null password is rejected', async () => {
    const res = await login({ password: null, duration: '1y' });

    assert.strictEqual(res.status, 400);
  });

  test('missing fields and unknown durations are rejected', async () => {
    assert.strictEqual((await login({ duration: '1h' })).status, 400);
    assert.strictEqual(
      (await login({ password: PASSWORD, duration: '100y' })).status,
      400
    );
  });

  test('login is disabled when PASSWORD is unset or a known default', async () => {
    await withEnv({ PASSWORD: undefined }, async () => {
      const res = await login({ password: '', duration: '1h' });
      assert.strictEqual(res.status, 503);
    });

    await withEnv({ PASSWORD: 'flame_password' }, async () => {
      const res = await login({ password: 'flame_password', duration: '1h' });
      assert.strictEqual(res.status, 503);
    });

    await getToken();
  });

  test('forged, expired and unsigned tokens are rejected', async () => {
    const claims = tokenClaims();
    const now = Math.floor(Date.now() / 1000);

    const tokens = {
      garbage: 'not-a-jwt',
      otherSecret: jwt.sign(claims, crypto.randomBytes(32).toString('hex')),
      expired: jwt.sign(
        { ...claims, iat: now - 120, exp: now - 60 },
        process.env.SECRET
      ),
      algNone: jwt.sign(claims, null, { algorithm: 'none' }),
      wrongApp: jwt.sign({ ...claims, app: 'other' }, process.env.SECRET),
      oldVersion: jwt.sign(
        { ...claims, ver: claims.ver - 1 },
        process.env.SECRET
      ),
      noVersion: jwt.sign(
        { app: claims.app, pwd: claims.pwd },
        process.env.SECRET
      ),
    };

    for (const [name, token] of Object.entries(tokens)) {
      const validate = await request(api)
        .post('/api/auth/validate')
        .send({ token });
      assert.strictEqual(validate.status, 401, `validate: ${name}`);

      const admin = await getAdminConfig(token);
      assert.strictEqual(admin.status, 401, `admin config: ${name}`);
    }
  });

  test('changing PASSWORD invalidates existing tokens', async () => {
    const token = await getToken();

    await withEnv({ PASSWORD: 'a-different-password-123' }, async () => {
      assert.strictEqual((await getAdminConfig(token)).status, 401);
    });

    assert.strictEqual((await getAdminConfig(token)).status, 200);
  });
});

test.describe('session cookie and CSRF', () => {
  const withCookie = (req, token) => req.set('Cookie', `flame_token=${token}`);

  test('login sets an HttpOnly SameSite=Strict cookie instead of returning the token', async () => {
    const before = Date.now();
    const res = await login({ password: PASSWORD, duration: '1h' });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.isAuthenticated, true);
    assert.ok(!('token' in res.body.data));

    const expiresAt = res.body.data.expiresAt;
    assert.ok(Math.abs(expiresAt - (before + 3600 * 1000)) < 5000);

    const cookie = getSetCookie(res);
    assert.ok(!res.text.includes(cookie.split(';')[0].split('=')[1]));
    assert.match(cookie, /; HttpOnly/);
    assert.match(cookie, /; SameSite=Strict/);
    assert.match(cookie, /; Path=\//);
    assert.match(cookie, /; Expires=/);
    // Plain-HTTP installs must still get a usable cookie
    assert.doesNotMatch(cookie, /; Secure/);
  });

  test('cookie is Secure over HTTPS behind a trusted proxy only', async () => {
    const forwardedLogin = () =>
      login({ password: PASSWORD, duration: '1h' }).set(
        'X-Forwarded-Proto',
        'https'
      );

    assert.doesNotMatch(getSetCookie(await forwardedLogin()), /; Secure/);

    api.set('trust proxy', true);
    try {
      assert.match(getSetCookie(await forwardedLogin()), /; Secure/);
    } finally {
      api.set('trust proxy', false);
    }
  });

  test('login requires the CSRF header', async () => {
    const res = await request(api)
      .post('/api/auth')
      .send({ password: PASSWORD, duration: '1h' });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(getSetCookie(res), undefined);
  });

  test('session endpoint reports the cookie session', async () => {
    const anonymous = await request(api).get('/api/auth');
    assert.strictEqual(anonymous.status, 200);
    assert.deepStrictEqual(anonymous.body.data, {
      isAuthenticated: false,
      expiresAt: null,
      method: null,
      user: null,
      logoutUrl: null,
    });

    const token = await getToken();
    const res = await withCookie(request(api).get('/api/auth'), token);
    assert.strictEqual(res.body.data.isAuthenticated, true);
    assert.strictEqual(res.body.data.method, 'password');
    assert.strictEqual(res.body.data.expiresAt, jwt.decode(token).exp * 1000);

    const forged = await withCookie(request(api).get('/api/auth'), 'not-a-jwt');
    assert.strictEqual(forged.body.data.isAuthenticated, false);
  });

  test('cookie authenticates reads without the CSRF header', async () => {
    const token = await getToken();
    const res = await withCookie(request(api).get('/api/config/admin'), token);

    assert.strictEqual(res.status, 200);
  });

  test('cookie-authenticated mutations require the CSRF header', async () => {
    const token = await getToken();
    const before = fs.readFileSync(configPath, 'utf-8');

    const rejected = await withCookie(request(api).put('/api/config'), token).send(
      { customTitle: 'csrf' }
    );
    assert.strictEqual(rejected.status, 403);
    assert.strictEqual(fs.readFileSync(configPath, 'utf-8'), before);

    const accepted = await withCookie(request(api).put('/api/config'), token)
      .set(CSRF)
      .send({ customTitle: 'CI Flame' });
    assert.strictEqual(accepted.status, 200);
  });

  test('a cross-site form POST with the cookie is rejected', async () => {
    const token = await getToken();

    const res = await withCookie(request(api).post('/api/apps'), token)
      .type('form')
      .send({ name: 'evil', url: 'http://evil.example' });
    assert.strictEqual(res.status, 403);
    assert.match(res.body.error, /X-Flame-CSRF/);
  });

  test('the Authorization-Flame header needs no CSRF header', async () => {
    const token = await getToken();

    const res = await request(api)
      .put('/api/config')
      .set('Authorization-Flame', `Bearer ${token}`)
      .send({ customTitle: 'CI Flame' });
    assert.strictEqual(res.status, 200);
  });

  test('logout clears the cookie', async () => {
    assert.strictEqual(
      (await request(api).post('/api/auth/logout')).status,
      403
    );

    const res = await request(api).post('/api/auth/logout').set(CSRF);
    assert.strictEqual(res.status, 200);

    const cookie = getSetCookie(res);
    assert.match(cookie, /^flame_token=;/);
    assert.match(cookie, /Expires=Thu, 01 Jan 1970/);
    assert.match(cookie, /; HttpOnly/);
  });

  test('log out all sessions invalidates every token', async () => {
    const first = await getToken();
    const second = await getToken();

    assert.strictEqual(
      (await request(api).post('/api/auth/logout-all').set(CSRF)).status,
      401
    );
    assert.strictEqual(
      (await withCookie(request(api).post('/api/auth/logout-all'), first))
        .status,
      403
    );

    const res = await withCookie(
      request(api).post('/api/auth/logout-all'),
      first
    ).set(CSRF);
    assert.strictEqual(res.status, 200);
    assert.match(getSetCookie(res), /^flame_token=;/);

    for (const token of [first, second]) {
      assert.strictEqual((await getAdminConfig(token)).status, 401);
      const session = await withCookie(request(api).get('/api/auth'), token);
      assert.strictEqual(session.body.data.isAuthenticated, false);
    }

    assert.strictEqual(
      JSON.parse(fs.readFileSync(join(workDir, 'data/sessions.json'), 'utf-8'))
        .tokenVersion,
      getTokenVersion()
    );
    assert.strictEqual((await getAdminConfig(await getToken())).status, 200);
  });
});

test.describe('config visibility', () => {
  let token;

  test.before(async () => {
    token = jwt.sign(tokenClaims(), process.env.SECRET, {
      expiresIn: '1h',
      algorithm: 'HS256',
    });
  });

  test('public config only contains allow-listed keys', async () => {
    const res = await request(api).get('/api/config');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.customTitle, 'CI Flame');
    assert.strictEqual(res.body.data.hasWeatherKey, true);

    for (const key of Object.keys(res.body.data)) {
      assert.ok(
        PUBLIC_KEYS.includes(key) || DERIVED_KEYS.includes(key),
        `unexpected public key: ${key}`
      );
    }

    for (const key of ['WEATHER_API_KEY', 'dockerHost', 'lat', 'long']) {
      assert.ok(!(key in res.body.data), `${key} must not be public`);
    }

    assert.ok(!res.text.includes(WEATHER_API_KEY));
    assert.ok(!res.text.includes('10.20.30.40'));
  });

  test('admin config requires a valid token', async () => {
    assert.strictEqual((await getAdminConfig()).status, 401);

    const wrongHeader = await request(api)
      .get('/api/config/admin')
      .set('Authorization', `Bearer ${token}`);
    assert.strictEqual(wrongHeader.status, 401);
  });

  test('admin config includes settings but never the weather API key', async () => {
    const res = await getAdminConfig(token);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.dockerHost, DOCKER_HOST);
    assert.strictEqual(res.body.data.lat, 51.5);
    assert.strictEqual(res.body.data.hasWeatherKey, true);
    assert.ok(!('WEATHER_API_KEY' in res.body.data));
    assert.ok(!res.text.includes(WEATHER_API_KEY));
  });

  test('config updates require a token', async () => {
    const before = fs.readFileSync(configPath, 'utf-8');

    const res = await request(api)
      .put('/api/config')
      .send({ customTitle: 'pwned', dockerHost: 'tcp://evil:2375' });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(fs.readFileSync(configPath, 'utf-8'), before);
  });

  test('authenticated updates store the weather key without echoing it', async () => {
    const res = await request(api)
      .put('/api/config')
      .set('Authorization-Flame', `Bearer ${token}`)
      .send({ customTitle: 'Updated', WEATHER_API_KEY: 'new-weather-key' });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.customTitle, 'Updated');
    assert.ok(!res.text.includes('new-weather-key'));

    const stored = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    assert.strictEqual(stored.WEATHER_API_KEY, 'new-weather-key');

    const publicRes = await request(api).get('/api/config');
    assert.strictEqual(publicRes.body.data.customTitle, 'Updated');
    assert.ok(!publicRes.text.includes('new-weather-key'));
  });
});

// Leaves this client rate limited, so it runs last
test.describe('login rate limit', () => {
  test('repeated failed logins are rate limited', async () => {
    // A successful login clears this client's failed attempts
    await getToken();

    for (let i = 0; i < 10; i++) {
      assert.strictEqual(
        (await login({ password: 'wrong', duration: '1h' })).status,
        401
      );
    }

    const res = await login({ password: PASSWORD, duration: '1h' });
    assert.strictEqual(res.status, 429);
    assert.ok(Number(res.headers['retry-after']) > 0);
  });
});
