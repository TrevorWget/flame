// Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const { join } = require('path');
const jwt = require('jsonwebtoken');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.PASSWORD = 'ci-theme-options-password-8b2f';
process.env.SECRET = crypto.randomBytes(32).toString('hex');
process.env.VERSION = '0.0.0';

const repoRoot = join(__dirname, '..');
const workDir = fs.mkdtempSync(join(os.tmpdir(), 'flame-theme-options-test-'));
const initialFiles = require('../utils/init/initialFiles.json').files;
const initialConfig = require('../utils/init/initialConfig.json');

fs.mkdirSync(join(workDir, 'data'));
fs.mkdirSync(join(workDir, 'utils/init'), { recursive: true });
fs.copyFileSync(
  join(repoRoot, 'utils/init/themes.json'),
  join(workDir, 'utils/init/themes.json')
);
process.chdir(workDir);

test.mock.method(console, 'log', () => {});

const api = require('../api');
const { connectDB, sequelize } = require('../db');
const associateModels = require('../models/associateModels');
const normalizeTheme = require('../utils/init/normalizeTheme');
const { getSunTimes, themeSunTimes } = require('../utils/sunTimes');
const { toPublicConfig } = require('../utils/sanitizeConfig');
const { getPasswordFingerprint } = require('../utils/password');
const { getTokenVersion } = require('../utils/tokenVersion');

const TRON = '#EFFBFF;#6EE2FF;#242B33';
const CLOUD = '#35342f;#37bbe4;#f1f2f0';

const token = jwt.sign(
  { app: 'flame', pwd: getPasswordFingerprint(), ver: getTokenVersion() },
  process.env.SECRET,
  { expiresIn: '1h', algorithm: 'HS256' }
);

const authed = (method, path) =>
  request(api)[method](path).set('Authorization-Flame', `Bearer ${token}`);

const readConfig = () => JSON.parse(fs.readFileSync('data/config.json'));

const reset = (config = {}) => {
  fs.writeFileSync(
    'data/config.json',
    JSON.stringify({ ...initialConfig, ...config })
  );

  for (const file of initialFiles.filter((f) => f.isJSON)) {
    fs.writeFileSync(join('data', file.name), JSON.stringify(file.template));
  }
};

const hhmm = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(
    minutes % 60
  ).padStart(2, '0')}`;

const assertNear = (minutes, expected, tolerance = 4) => {
  const [h, m] = expected.split(':').map(Number);
  const diff = Math.abs(minutes - (h * 60 + m));

  assert.ok(
    Math.min(diff, 1440 - diff) <= tolerance,
    `${hhmm(minutes)} is not within ${tolerance} min of ${expected}`
  );
};

test.before(async () => {
  reset();
  await connectDB();
  associateModels();
});

test.after(async () => {
  await sequelize.close();
  process.chdir(repoRoot);
  fs.rmSync(workDir, { recursive: true, force: true });
});

test.describe('sun times', () => {
  // Published times, in UTC
  const cases = [
    ['London, June', 51.5074, -0.1278, '2026-06-21T12:00:00Z', '03:43', '20:21'],
    ['New York, January', 40.7128, -74.006, '2026-01-15T17:00:00Z', '12:19', '21:55'],
    ['Sydney, December', -33.87, 151.21, '2026-12-21T02:00:00Z', '18:41', '09:05'],
    // Sunset falls after UTC midnight
    ['Los Angeles, July', 34.05, -118.24, '2026-07-01T20:00:00Z', '12:45', '03:08'],
  ];

  for (const [name, lat, long, date, sunrise, sunset] of cases) {
    test(name, () => {
      const times = getSunTimes(lat, long, new Date(date));

      assert.strictEqual(times.polar, null);
      assertNear(times.sunrise, sunrise);
      assertNear(times.sunset, sunset);
    });
  }

  test('polar night and midnight sun', () => {
    assert.deepStrictEqual(
      getSunTimes(69.65, 18.96, new Date('2026-12-21T12:00:00Z')),
      { sunrise: null, sunset: null, polar: 'night' }
    );
    assert.deepStrictEqual(
      getSunTimes(69.65, 18.96, new Date('2026-06-21T12:00:00Z')),
      { sunrise: null, sunset: null, polar: 'day' }
    );
  });

  test('are only worked out for a sun schedule with a location', () => {
    const config = {
      themeMode: 'time',
      themeSchedule: 'sun',
      lat: 51.5,
      long: -0.12,
    };

    assert.ok(themeSunTimes(config));
    assert.strictEqual(themeSunTimes({ ...config, themeMode: 'system' }), null);
    assert.strictEqual(
      themeSunTimes({ ...config, themeSchedule: 'fixed' }),
      null
    );
    assert.strictEqual(themeSunTimes({ ...config, lat: 0, long: 0 }), null);
    assert.strictEqual(themeSunTimes({ ...config, lat: null }), null);
  });
});

test.describe('settings', () => {
  test.beforeEach(() => reset());

  test('default to the manual theme and Roboto', () => {
    assert.deepStrictEqual(
      {
        themeMode: initialConfig.themeMode,
        themeSchedule: initialConfig.themeSchedule,
        themeLightTime: initialConfig.themeLightTime,
        themeDarkTime: initialConfig.themeDarkTime,
        fontFamily: initialConfig.fontFamily,
      },
      {
        themeMode: 'manual',
        themeSchedule: 'sun',
        themeLightTime: '07:00',
        themeDarkTime: '19:00',
        fontFamily: 'roboto',
      }
    );
  });

  test('are public, with sun times but not the location', async () => {
    const res = await authed('put', '/api/config').send({
      themeMode: 'time',
      themeSchedule: 'sun',
      lat: 51.5,
      long: -0.12,
      fontFamily: 'inter',
    });
    assert.strictEqual(res.status, 200, res.text);

    const { data } = (await request(api).get('/api/config')).body;

    assert.strictEqual(data.themeMode, 'time');
    assert.strictEqual(data.fontFamily, 'inter');
    assert.strictEqual(typeof data.sunTimes.sunrise, 'number');
    assert.strictEqual(typeof data.sunTimes.sunset, 'number');
    assert.ok(!('lat' in data) && !('long' in data));
    // Derived, so never saved
    assert.ok(!('sunTimes' in readConfig()));
  });

  test('accept the allowed values and reject the rest', async () => {
    const valid = {
      themeMode: 'system',
      lightTheme: CLOUD,
      darkTheme: TRON,
      themeSchedule: 'fixed',
      themeLightTime: '06:30',
      themeDarkTime: '21:15',
      fontFamily: 'jetbrains-mono',
    };

    const res = await authed('put', '/api/config').send(valid);
    assert.strictEqual(res.status, 200, res.text);
    assert.deepStrictEqual(
      Object.fromEntries(Object.keys(valid).map((k) => [k, readConfig()[k]])),
      valid
    );

    for (const [key, value] of [
      ['themeMode', 'auto'],
      ['themeSchedule', 'moon'],
      ['themeLightTime', '7:00'],
      ['themeDarkTime', '24:00'],
      ['fontFamily', 'comic-sans'],
      ['fontFamily', 'https://fonts.googleapis.com/css?family=Inter'],
    ]) {
      const rejected = await authed('put', '/api/config').send({ [key]: value });
      assert.strictEqual(rejected.status, 400, `${key}: ${value}`);
      assert.match(rejected.body.error, new RegExp(`^${key}: `));
    }

    assert.strictEqual(
      (await authed('put', '/api/config').send({ sunTimes: {} })).status,
      200
    );
    assert.ok(!('sunTimes' in readConfig()));
  });

  test('toPublicConfig leaves sun times out unless the schedule uses them', () => {
    assert.strictEqual(toPublicConfig(initialConfig).sunTimes, null);
  });
});

test.describe('theme names in the settings', () => {
  test('are saved as colors at startup', async () => {
    reset({ defaultTheme: 'tron', lightTheme: 'cloud', darkTheme: 'neon' });

    await normalizeTheme();

    const config = readConfig();
    assert.strictEqual(config.defaultTheme, TRON);
    assert.strictEqual(config.lightTheme, CLOUD);
    assert.strictEqual(config.darkTheme, '#EFFBFF;#ea00d9;#091833');
  });

  test('follow an edited theme', async () => {
    reset();
    const theme = {
      name: 'night',
      colors: { background: '#000000', primary: '#ffffff', accent: '#ff0066' },
      isCustom: true,
    };
    const pab = '#ffffff;#ff0066;#000000';

    assert.strictEqual(
      (await authed('post', '/api/themes').send(theme)).status,
      201
    );
    await authed('put', '/api/config').send({
      darkTheme: pab,
      defaultTheme: pab,
      lightTheme: CLOUD,
    });

    const res = await authed('put', '/api/themes/night').send({
      ...theme,
      name: 'midnight',
      colors: { ...theme.colors, accent: '#00ffaa' },
    });
    assert.strictEqual(res.status, 200, res.text);
    assert.deepStrictEqual(
      res.body.data.map((t) => t.name),
      ['midnight']
    );

    const config = readConfig();
    assert.strictEqual(config.darkTheme, '#ffffff;#00ffaa;#000000');
    assert.strictEqual(config.defaultTheme, '#ffffff;#00ffaa;#000000');
    assert.strictEqual(config.lightTheme, CLOUD);
  });

  test('a theme cannot be renamed onto another or be missing', async () => {
    reset();
    const theme = {
      name: 'copy',
      colors: { background: '#000000', primary: '#ffffff', accent: '#ff0066' },
      isCustom: true,
    };
    await authed('post', '/api/themes').send(theme);

    const taken = await authed('put', '/api/themes/copy').send({
      ...theme,
      name: 'tron',
    });
    assert.strictEqual(taken.status, 400);
    assert.match(taken.body.error, /unique/);

    const missing = await authed('put', '/api/themes/nope').send(theme);
    assert.strictEqual(missing.status, 404);
  });
});
