// Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const { join } = require('path');
const jwt = require('jsonwebtoken');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.PASSWORD = 'ci-icons-password-71b0';
process.env.SECRET = crypto.randomBytes(32).toString('hex');
process.env.VERSION = '0.0.0';

const repoRoot = join(__dirname, '..');
const workDir = fs.mkdtempSync(join(os.tmpdir(), 'flame-icons-test-'));
const initialConfig = require('../utils/init/initialConfig.json');

fs.mkdirSync(join(workDir, 'data'));
fs.writeFileSync(join(workDir, 'data/config.json'), JSON.stringify(initialConfig));
process.chdir(workDir);

test.mock.method(console, 'log', () => {});

const api = require('../api');
const { connectDB, sequelize } = require('../db');
const associateModels = require('../models/associateModels');
const { getPasswordFingerprint } = require('../utils/password');
const { getTokenVersion } = require('../utils/tokenVersion');
const { UPLOADS_DIR, clearIconCache } = require('../utils/favicon');
const { PUBLIC_KEYS } = require('../utils/sanitizeConfig');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7, 7, 7]);
const FAVICON = /^favicon-[0-9a-f]{32}\.png$/;

const token = jwt.sign(
  { app: 'flame', pwd: getPasswordFingerprint(), ver: getTokenVersion() },
  process.env.SECRET,
  { expiresIn: '1h', algorithm: 'HS256' }
);

const authed = (method, path) =>
  request(api)[method](path).set('Authorization-Flame', `Bearer ${token}`);

const setConfig = async (changes) => {
  const res = await authed('put', '/api/config').send(changes);
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  clearIconCache();
};

let site;
let siteHits = 0;
let categoryIds = {};

test.before(async () => {
  await connectDB();
  associateModels();

  site = http.createServer((req, res) => {
    siteHits++;

    if (req.url === '/favicon.ico') {
      res.setHeader('Content-Type', 'image/png');
      return res.end(PNG);
    }

    res.setHeader('Content-Type', 'text/html');
    res.end('<html><head><title>LAN app</title></head></html>');
  });
  await new Promise((resolve) => site.listen(0, '127.0.0.1', resolve));

  for (const type of ['apps', 'bookmarks']) {
    const res = await authed('post', '/api/categories').send({ name: type, type });
    categoryIds[type] = res.body.data.id;
  }
});

test.after(async () => {
  site.closeAllConnections();
  site.close();
  await require('node-schedule').gracefulShutdown();
  await sequelize.close();

  for (const file of fs.readdirSync(UPLOADS_DIR)) {
    if (FAVICON.test(file) && fs.readFileSync(join(UPLOADS_DIR, file)).equals(PNG)) {
      fs.rmSync(join(UPLOADS_DIR, file), { force: true });
    }
  }

  process.chdir(repoRoot);
  fs.rmSync(workDir, { recursive: true, force: true });
});

const siteUrl = () => `http://127.0.0.1:${site.address().port}/`;

test.describe('POST /api/icons/fetch', () => {
  test('requires authentication', async () => {
    const res = await request(api).post('/api/icons/fetch').send({ url: siteUrl() });
    assert.strictEqual(res.status, 401);
  });

  test('validates the body and the URL scheme', async () => {
    for (const body of [{}, { url: '' }, { url: 42 }, { url: siteUrl(), extra: 1 }]) {
      const res = await authed('post', '/api/icons/fetch').send(body);
      assert.strictEqual(res.status, 400, JSON.stringify(body));
    }

    for (const url of ['steam://run/570', 'ssh://host', 'javascript:alert(1)']) {
      const res = await authed('post', '/api/icons/fetch').send({ url });
      assert.strictEqual(res.status, 400, url);
    }
  });

  test('LAN addresses are refused until allowed in the settings', async () => {
    await setConfig({ iconFetchAllowPrivate: false });
    const before = siteHits;

    const blocked = await authed('post', '/api/icons/fetch').send({ url: siteUrl() });
    assert.strictEqual(blocked.status, 422);
    assert.match(blocked.body.error, /private network address/);
    assert.strictEqual(siteHits, before);

    await setConfig({ iconFetchAllowPrivate: true });

    const res = await authed('post', '/api/icons/fetch').send({ url: siteUrl() });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.match(res.body.data.icon, FAVICON);

    const served = await request(api).get(`/uploads/${res.body.data.icon}`);
    assert.strictEqual(served.status, 200);
    assert.deepStrictEqual(served.body, PNG);
    assert.strictEqual(served.headers['x-content-type-options'], 'nosniff');
    assert.match(served.headers['content-security-policy'], /sandbox/);
  });

  test('scheme-less URLs are fetched over http', async () => {
    await setConfig({ iconFetchAllowPrivate: true });

    const url = siteUrl().replace('http://', '');
    const res = await authed('post', '/api/icons/fetch').send({ url });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  });

  test('sites without an icon return a readable error', async () => {
    await setConfig({ iconFetchAllowPrivate: true });

    // Nothing listens on port 1
    const res = await authed('post', '/api/icons/fetch').send({
      url: 'http://127.0.0.1:1/',
    });
    assert.strictEqual(res.status, 422);
    assert.strictEqual(res.body.error, 'No usable icon found for 127.0.0.1:1');
  });
});

test.describe('settings', () => {
  test('icon settings default to off and are admin-only', async () => {
    assert.strictEqual(initialConfig.autoFetchIcons, false);
    assert.strictEqual(initialConfig.iconFetchAllowPrivate, false);
    assert.ok(!PUBLIC_KEYS.includes('autoFetchIcons'));
    assert.ok(!PUBLIC_KEYS.includes('iconFetchAllowPrivate'));

    const res = await authed('put', '/api/config').send({ autoFetchIcons: 'yes' });
    assert.strictEqual(res.status, 400);
  });
});

test.describe('auto-fetch', () => {
  const create = (type, body) =>
    authed('post', `/api/${type}`).send({ categoryId: categoryIds[type], ...body });

  test('is off by default', async () => {
    await setConfig({ autoFetchIcons: false, iconFetchAllowPrivate: true });

    const res = await create('apps', { name: 'No fetch', url: siteUrl(), icon: '' });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.data.icon, '');
  });

  test('fills in missing icons of new apps and bookmarks', async () => {
    await setConfig({ autoFetchIcons: true, iconFetchAllowPrivate: true });

    const app = await create('apps', { name: 'Fetched', url: siteUrl(), icon: '' });
    assert.strictEqual(app.status, 201, JSON.stringify(app.body));
    assert.match(app.body.data.icon, FAVICON);

    const omitted = await create('apps', { name: 'Omitted', url: siteUrl() });
    assert.match(omitted.body.data.icon, FAVICON);

    const bookmark = await create('bookmarks', { name: 'Fetched', url: siteUrl(), icon: '' });
    assert.strictEqual(bookmark.status, 201);
    assert.match(bookmark.body.data.icon, FAVICON);
  });

  test('keeps chosen icons and non-web URLs as they are', async () => {
    await setConfig({ autoFetchIcons: true, iconFetchAllowPrivate: true });
    const before = siteHits;

    const mdi = await create('apps', { name: 'MDI', url: siteUrl(), icon: 'plex' });
    assert.strictEqual(mdi.body.data.icon, 'plex');

    const steam = await create('bookmarks', { name: 'Steam', url: 'steam://run/570', icon: '' });
    assert.strictEqual(steam.status, 201);
    assert.strictEqual(steam.body.data.icon, '');

    const upload = await authed('post', '/api/apps')
      .field('name', 'Upload')
      .field('url', siteUrl())
      .field('categoryId', `${categoryIds.apps}`)
      .attach('icon', PNG, 'icon.png');
    assert.match(upload.body.data.icon, /^[0-9a-f-]{36}\.png$/);
    fs.rmSync(join(UPLOADS_DIR, upload.body.data.icon), { force: true });

    assert.strictEqual(siteHits, before);
  });

  test('saving still works when no icon can be fetched', async () => {
    await setConfig({ autoFetchIcons: true, iconFetchAllowPrivate: false });

    const res = await create('apps', { name: 'Blocked', url: siteUrl(), icon: '' });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.data.icon, '');
  });

  test('updates fetch only when the URL or icon is edited', async () => {
    await setConfig({ autoFetchIcons: false, iconFetchAllowPrivate: true });
    const created = await create('apps', { name: 'Later', url: siteUrl(), icon: '' });
    const id = created.body.data.id;

    await setConfig({ autoFetchIcons: true, iconFetchAllowPrivate: true });
    const before = siteHits;

    const pinned = await authed('put', `/api/apps/${id}`).send({ isPinned: true });
    assert.strictEqual(pinned.body.data.icon, '');
    assert.strictEqual(siteHits, before);

    const edited = await authed('put', `/api/apps/${id}`).send({
      ...created.body.data,
      name: 'Later 2',
    });
    assert.strictEqual(edited.status, 200, JSON.stringify(edited.body));
    assert.match(edited.body.data.icon, FAVICON);

    const bookmark = await create('bookmarks', { name: 'Mark', url: 'steam://run/1', icon: '' });
    const moved = await authed('put', `/api/bookmarks/${bookmark.body.data.id}`).send({
      url: siteUrl(),
    });
    assert.match(moved.body.data.icon, FAVICON);
  });
});
