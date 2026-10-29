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
process.env.PASSWORD = 'ci-test-password-91be';
process.env.SECRET = crypto.randomBytes(32).toString('hex');
// Names the database backup that connectDB takes before migrating
process.env.VERSION = '0.0.0';

// The database and config live in data/ relative to the working directory
const repoRoot = join(__dirname, '..');
const workDir = fs.mkdtempSync(join(os.tmpdir(), 'flame-pinned-apps-test-'));

fs.mkdirSync(join(workDir, 'data'));
fs.writeFileSync(
  join(workDir, 'data/config.json'),
  JSON.stringify({
    ...require('../utils/init/initialConfig.json'),
    useOrdering: 'orderId',
  })
);
process.chdir(workDir);

test.mock.method(console, 'log', () => {});

const { connectDB, sequelize } = require('../db');
const associateModels = require('../models/associateModels');
const Category = require('../models/Category');
const App = require('../models/App');
const applyIntegrationApps = require('../controllers/apps/docker/applyIntegrationApps');
const api = require('../api');
const { getPasswordFingerprint } = require('../utils/password');
const { getTokenVersion } = require('../utils/tokenVersion');

let token;
let media;
let hidden;

test.before(async () => {
  await connectDB();
  associateModels();

  token = jwt.sign(
    { app: 'flame', pwd: getPasswordFingerprint(), ver: getTokenVersion() },
    process.env.SECRET,
    { expiresIn: '1h', algorithm: 'HS256' }
  );

  media = await Category.create({
    name: 'Media',
    type: 'apps',
    isPinned: true,
  });
  hidden = await Category.create({
    name: 'Hidden',
    type: 'apps',
    isPinned: true,
    isPublic: 0,
  });

  await App.bulkCreate([
    {
      name: 'Jellyfin',
      url: 'jf',
      categoryId: media.id,
      orderId: 1,
      isPinned: true,
    },
    {
      name: 'Sonarr',
      url: 'so',
      categoryId: media.id,
      orderId: 2,
      isPinned: false,
    },
    {
      name: 'Private',
      url: 'pr',
      categoryId: media.id,
      orderId: 3,
      isPinned: true,
      isPublic: 0,
    },
    {
      name: 'Vault',
      url: 'va',
      categoryId: hidden.id,
      orderId: 1,
      isPinned: true,
    },
  ]);
});

test.after(async () => {
  await sequelize.close();
  process.chdir(repoRoot);
  fs.rmSync(workDir, { recursive: true, force: true });
});

const auth = (req) => req.set('Authorization-Flame', `Bearer ${token}`);

const getApps = async (asUser) => {
  const req = request(api).get('/api/categories');
  const res = await (asUser ? auth(req) : req);
  assert.strictEqual(res.status, 200);

  return Object.fromEntries(
    res.body.data
      .filter(({ type }) => type === 'apps')
      .map(({ name, apps }) => [
        name,
        Object.fromEntries(apps.map((a) => [a.name, a.isPinned])),
      ])
  );
};

test.describe('app pins in GET /api/categories', () => {
  test('every app comes with its own isPinned, unpinned ones included', async () => {
    assert.deepStrictEqual(await getApps(true), {
      Media: { Jellyfin: true, Sonarr: false, Private: true },
      Hidden: { Vault: true },
    });
  });

  test('guests only get public categories and public apps', async () => {
    assert.deepStrictEqual(await getApps(false), {
      Media: { Jellyfin: true, Sonarr: false },
    });
  });

  test('pinning and unpinning an app is reflected', async () => {
    const sonarr = await App.findOne({ where: { name: 'Sonarr' } });

    for (const isPinned of [true, false]) {
      const res = await auth(request(api).put(`/api/apps/${sonarr.id}`)).send({
        isPinned,
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual((await getApps(false)).Media.Sonarr, isPinned);
    }
  });

  test('apps of stopped containers are unpinned, manual apps are not', async () => {
    const item = (name) => ({
      name,
      url: `http://${name}.local`,
      icon: 'docker',
      categoryId: media.id,
      orderId: 10,
    });

    await applyIntegrationApps('docker', [item('radarr'), item('lidarr')], {
      defaultIcon: 'docker',
    });
    assert.strictEqual((await getApps(false)).Media.radarr, true);

    await applyIntegrationApps('docker', [item('lidarr')], {
      defaultIcon: 'docker',
      unpinMissing: true,
    });

    const pins = (await getApps(false)).Media;
    assert.strictEqual(pins.radarr, false);
    assert.strictEqual(pins.lidarr, true);
    assert.strictEqual(pins.Jellyfin, true);
  });
});
