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

const login = (body) => request(api).post('/api/auth').send(body);

const getToken = async () => {
  const res = await login({ password: PASSWORD, duration: '1h' });
  assert.strictEqual(res.status, 200);

  return res.body.data.token;
};

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

    assert.strictEqual(res.status, 401);
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
      const res = await login({ password: null, duration: '1h' });
      assert.strictEqual(res.status, 503);
    });

    await withEnv({ PASSWORD: 'flame_password' }, async () => {
      const res = await login({ password: 'flame_password', duration: '1h' });
      assert.strictEqual(res.status, 503);
    });

    await getToken();
  });

  test('forged, expired and unsigned tokens are rejected', async () => {
    const claims = { app: 'flame', pwd: getPasswordFingerprint() };
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

test.describe('config visibility', () => {
  let token;

  test.before(async () => {
    token = jwt.sign(
      { app: 'flame', pwd: getPasswordFingerprint() },
      process.env.SECRET,
      { expiresIn: '1h', algorithm: 'HS256' }
    );
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
