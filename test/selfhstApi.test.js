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
process.env.PASSWORD = 'ci-selfhst-password-3c9a';
process.env.SECRET = crypto.randomBytes(32).toString('hex');
process.env.VERSION = '0.0.0';

const repoRoot = join(__dirname, '..');
const workDir = fs.mkdtempSync(join(os.tmpdir(), 'flame-selfhst-api-test-'));
const uploadsDir = join(workDir, 'selfhst-uploads');
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
const { configureSelfhst } = require('../utils/selfhst');
const { PUBLIC_KEYS } = require('../utils/sanitizeConfig');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 5, 1, 5, 1]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x10, 0, 0, 0]),
  Buffer.from('WEBPVP8 '),
  Buffer.from([4, 3, 2, 1]),
]);
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';
const FAVICON = /^favicon-[0-9a-f]{32}\.png$/;

const INDEX = [
  { Name: 'Jellyfin', Reference: 'jellyfin', SVG: 'Yes', PNG: 'Yes', WebP: 'Yes', Light: 'Yes', Dark: 'Yes', Category: 'Self-Hosted', Tags: 'Streaming' },
  { Name: 'Home Assistant', Reference: 'home-assistant', SVG: 'Yes', PNG: 'Yes', WebP: 'Yes', Light: 'No', Dark: 'No', Category: 'Self-Hosted', Tags: '' },
  { Name: 'Steam', Reference: 'steam', SVG: 'No', PNG: 'Yes', WebP: 'Yes', Light: 'No', Dark: 'No', Category: 'Gaming', Tags: '' },
  // Listed with a dark version that the CDN doesn't have
  { Name: 'Ghost', Reference: 'ghost', SVG: 'Yes', PNG: 'No', WebP: 'No', Light: 'Yes', Dark: 'Yes', Category: 'Self-Hosted', Tags: '' },
];
const LIGHT_SVG = SVG.replace('<circle', '<circle fill="#fff"');
const DARK_SVG = SVG.replace('<circle', '<circle fill="#000"');

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

// Serves the index and icon files like jsDelivr, and a favicon for the apps
let cdn;
let cdnHits = {};
let categoryIds = {};

const cdnUrl = () => `http://127.0.0.1:${cdn.address().port}`;

const useCdn = (indexUrl = `${cdnUrl()}/index.json`) =>
  configureSelfhst({
    indexSources: [indexUrl],
    cdnBase: cdnUrl(),
    indexFile: join(workDir, 'data/selfhst-index.json'),
    uploadsDir,
    allowPrivate: true,
  });

test.before(async () => {
  await connectDB();
  associateModels();

  cdn = http.createServer((req, res) => {
    cdnHits[req.url] = (cdnHits[req.url] || 0) + 1;

    const files = {
      '/index.json': ['application/json', JSON.stringify(INDEX)],
      '/svg/jellyfin.svg': ['image/svg+xml', SVG],
      '/svg/jellyfin-light.svg': ['image/svg+xml', LIGHT_SVG],
      '/svg/jellyfin-dark.svg': ['image/svg+xml', DARK_SVG],
      '/svg/ghost.svg': ['image/svg+xml', SVG],
      '/svg/ghost-light.svg': ['image/svg+xml', LIGHT_SVG],
      '/svg/home-assistant.svg': ['image/svg+xml', SVG],
      '/webp/jellyfin.webp': ['image/webp', WEBP],
      '/webp/jellyfin-light.webp': ['image/webp', WEBP],
      '/webp/steam.webp': ['image/webp', WEBP],
      '/favicon.ico': ['image/png', PNG],
    };
    const file = files[req.url];

    if (!file) {
      res.statusCode = req.url === '/' ? 200 : 404;
      return res.end('<html><head></head></html>');
    }

    res.setHeader('Content-Type', file[0]);
    res.end(file[1]);
  });
  await new Promise((resolve) => cdn.listen(0, '127.0.0.1', resolve));

  useCdn();

  for (const type of ['apps', 'bookmarks']) {
    const res = await authed('post', '/api/categories').send({ name: type, type });
    categoryIds[type] = res.body.data.id;
  }
});

test.after(async () => {
  configureSelfhst();
  cdn.closeAllConnections();
  cdn.close();
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

test.describe('selfh.st routes', () => {
  test('require authentication', async () => {
    for (const [method, path] of [
      ['get', '/api/icons/selfhst/search?q=jelly'],
      ['get', '/api/icons/selfhst/suggest?name=Jellyfin'],
      ['get', '/api/icons/selfhst/preview/jellyfin'],
      ['post', '/api/icons/selfhst'],
    ]) {
      const res = await request(api)[method](path).send({ reference: 'jellyfin', format: 'svg' });
      assert.strictEqual(res.status, 401, path);
    }
    assert.deepStrictEqual(cdnHits, {});
  });

  test('validate their input', async () => {
    for (const path of [
      '/api/icons/selfhst/search?limit=0',
      '/api/icons/selfhst/search?limit=1000',
      '/api/icons/selfhst/search?q=a&extra=1',
      `/api/icons/selfhst/search?q=${'a'.repeat(101)}`,
      '/api/icons/selfhst/suggest',
      '/api/icons/selfhst/preview/..%2Findex',
      '/api/icons/selfhst/preview/Jellyfin',
      '/api/icons/selfhst/preview/jellyfin?variant=inverted',
    ]) {
      const res = await authed('get', path);
      assert.strictEqual(res.status, 400, path);
    }

    for (const body of [
      {},
      { reference: 'jellyfin' },
      { reference: 'jellyfin', format: 'avif' },
      { reference: '../../config', format: 'svg' },
      { reference: 'jellyfin', format: 'svg', variant: 'neon' },
      { reference: 'jellyfin', format: 'svg', url: 'http://127.0.0.1/' },
    ]) {
      const res = await authed('post', '/api/icons/selfhst').send(body);
      assert.strictEqual(res.status, 400, JSON.stringify(body));
    }
  });

  test('search the index', async () => {
    const res = await authed('get', '/api/icons/selfhst/search?q=jelly');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.deepStrictEqual(res.body.data.icons, [
      {
        name: 'Jellyfin',
        reference: 'jellyfin',
        svg: true,
        png: true,
        webp: true,
        light: true,
        dark: true,
        category: 'Self-Hosted',
      },
    ]);
    assert.strictEqual(res.body.data.total, 1);
    assert.strictEqual(res.body.data.stale, false);
    assert.ok(res.body.data.updatedAt);

    const all = await authed('get', '/api/icons/selfhst/search?limit=2');
    assert.strictEqual(all.body.data.total, INDEX.length);
    assert.strictEqual(all.body.data.icons.length, 2);
  });

  test('suggest the icon named like the app', async () => {
    const res = await authed('get', '/api/icons/selfhst/suggest?name=home%20assistant');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.reference, 'home-assistant');

    const none = await authed('get', '/api/icons/selfhst/suggest?name=Sonarr');
    assert.strictEqual(none.status, 200);
    assert.strictEqual(none.body.data, null);
  });

  test('serve previews through the server', async () => {
    const res = await authed('get', '/api/icons/selfhst/preview/jellyfin?variant=light');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers['content-type'], 'image/webp');
    assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
    assert.match(res.headers['content-security-policy'], /sandbox/);
    assert.match(res.headers['cache-control'], /^private/);
    assert.deepStrictEqual(res.body, WEBP);

    const missing = await authed('get', '/api/icons/selfhst/preview/home-assistant?variant=dark');
    assert.strictEqual(missing.status, 400);
    assert.strictEqual(missing.body.error, 'Home Assistant has no dark version on selfh.st');
  });

  test('store the picked icon locally', async () => {
    const res = await authed('post', '/api/icons/selfhst').send({
      reference: 'jellyfin',
      format: 'svg',
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.deepStrictEqual(res.body.data, {
      icon: 'selfhst-jellyfin.svg',
      iconOnDark: null,
      iconOnLight: null,
    });
    assert.match(fs.readFileSync(join(uploadsDir, 'selfhst-jellyfin.svg'), 'utf-8'), /<circle/);

    const unavailable = await authed('post', '/api/icons/selfhst').send({
      reference: 'steam',
      format: 'svg',
    });
    assert.strictEqual(unavailable.status, 400);
    assert.strictEqual(unavailable.body.error, 'Steam is not available as SVG on selfh.st');

    const unknown = await authed('post', '/api/icons/selfhst').send({
      reference: 'not-an-app',
      format: 'png',
    });
    assert.strictEqual(unknown.status, 404);
  });

  test('store an icon that follows the theme', async () => {
    const store = (body) => authed('post', '/api/icons/selfhst').send({ variant: 'auto', ...body });
    const read = (name) => fs.readFileSync(join(uploadsDir, name), 'utf-8');

    const res = await store({ reference: 'jellyfin', format: 'svg' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    // The white "light" version goes on dark themes, the black "dark" one on light themes
    assert.deepStrictEqual(res.body.data, {
      icon: 'selfhst-jellyfin.svg',
      iconOnDark: 'selfhst-jellyfin_light.svg',
      iconOnLight: 'selfhst-jellyfin_dark.svg',
    });
    assert.match(read('selfhst-jellyfin_light.svg'), /#fff/);
    assert.match(read('selfhst-jellyfin_dark.svg'), /#000/);

    // A version selfh.st lists but can't serve falls back to the standard icon
    const ghost = await store({ reference: 'ghost', format: 'svg' });
    assert.strictEqual(ghost.status, 200, JSON.stringify(ghost.body));
    assert.deepStrictEqual(ghost.body.data, {
      icon: 'selfhst-ghost.svg',
      iconOnDark: 'selfhst-ghost_light.svg',
      iconOnLight: null,
    });

    // Without light and dark versions, only the standard icon is downloaded
    const steam = await store({ reference: 'steam', format: 'webp' });
    assert.deepStrictEqual(steam.body.data, {
      icon: 'selfhst-steam.webp',
      iconOnDark: null,
      iconOnLight: null,
    });
    assert.ok(!cdnHits['/webp/steam-light.webp'] && !cdnHits['/webp/steam-dark.webp']);

    const unavailable = await store({ reference: 'steam', format: 'svg' });
    assert.strictEqual(unavailable.status, 400);
  });

  test('reuse light and dark files that are already stored', async () => {
    const hits = { ...cdnHits };

    // Picked as a separate version before Automatic existed
    fs.writeFileSync(join(uploadsDir, 'selfhst-ghost_dark.svg'), DARK_SVG);

    const res = await authed('post', '/api/icons/selfhst').send({
      reference: 'ghost',
      format: 'svg',
      variant: 'auto',
    });
    assert.deepStrictEqual(res.body.data, {
      icon: 'selfhst-ghost.svg',
      iconOnDark: 'selfhst-ghost_light.svg',
      iconOnLight: 'selfhst-ghost_dark.svg',
    });

    const again = await authed('post', '/api/icons/selfhst').send({
      reference: 'jellyfin',
      format: 'svg',
      variant: 'auto',
    });
    assert.strictEqual(again.body.data.iconOnLight, 'selfhst-jellyfin_dark.svg');
    assert.deepStrictEqual(cdnHits, hits);
  });

  test('report an unreachable index', async () => {
    useCdn('http://127.0.0.1:1/index.json');
    fs.rmSync(join(workDir, 'data/selfhst-index.json'), { force: true });

    try {
      const res = await authed('get', '/api/icons/selfhst/search?q=jelly');
      assert.strictEqual(res.status, 503);
      assert.strictEqual(res.body.error, 'Service Unavailable');

      const suggestion = await authed('get', '/api/icons/selfhst/suggest?name=Jellyfin');
      assert.strictEqual(suggestion.status, 200);
      assert.strictEqual(suggestion.body.data, null);
    } finally {
      useCdn();
    }
  });
});

test.describe('preferSelfhstIcons', () => {
  const create = (type, body) =>
    authed('post', `/api/${type}`).send({ categoryId: categoryIds[type], ...body });

  test('defaults to off and is admin-only', async () => {
    assert.strictEqual(initialConfig.preferSelfhstIcons, false);
    assert.ok(!PUBLIC_KEYS.includes('preferSelfhstIcons'));

    const res = await authed('put', '/api/config').send({ preferSelfhstIcons: 'yes' });
    assert.strictEqual(res.status, 400);
  });

  test('uses the selfh.st icon named like the item, then the favicon', async () => {
    await setConfig({
      autoFetchIcons: true,
      iconFetchAllowPrivate: true,
      preferSelfhstIcons: true,
    });

    const app = await create('apps', { name: 'Jellyfin', url: `${cdnUrl()}/`, icon: '' });
    assert.strictEqual(app.status, 201, JSON.stringify(app.body));
    assert.strictEqual(app.body.data.icon, 'selfhst-jellyfin.svg');
    assert.strictEqual(app.body.data.iconOnDark, 'selfhst-jellyfin_light.svg');
    assert.strictEqual(app.body.data.iconOnLight, 'selfhst-jellyfin_dark.svg');

    const ghost = await create('bookmarks', { name: 'Ghost', url: 'https://ghost.lan', icon: '' });
    assert.strictEqual(ghost.body.data.iconOnDark, 'selfhst-ghost_light.svg');

    // No SVG, and the URL has no favicon to fetch
    const bookmark = await create('bookmarks', { name: 'Steam', url: 'steam://run/570', icon: '' });
    assert.strictEqual(bookmark.status, 201);
    assert.strictEqual(bookmark.body.data.icon, 'selfhst-steam.webp');
    assert.strictEqual(bookmark.body.data.iconOnDark, null);
    assert.strictEqual(bookmark.body.data.iconOnLight, null);

    const other = await create('apps', { name: 'Sonarr', url: `${cdnUrl()}/`, icon: '' });
    assert.match(other.body.data.icon, FAVICON);
    assert.strictEqual(other.body.data.iconOnDark, null);

    // Clearing the icon of an app that follows the theme fetches the favicon instead
    const cleared = await authed('put', `/api/apps/${app.body.data.id}`).send({
      name: 'Sonarr',
      icon: '',
    });
    assert.strictEqual(cleared.status, 200, JSON.stringify(cleared.body));
    assert.match(cleared.body.data.icon, FAVICON);
    assert.strictEqual(cleared.body.data.iconOnDark, null);
    assert.strictEqual(cleared.body.data.iconOnLight, null);

    const chosen = await create('apps', { name: 'Jellyfin', url: `${cdnUrl()}/`, icon: 'movie' });
    assert.strictEqual(chosen.body.data.icon, 'movie');
  });

  test('is ignored while auto-fetch is off, and off uses the favicon', async () => {
    await setConfig({ autoFetchIcons: false, preferSelfhstIcons: true });
    const off = await create('apps', { name: 'Jellyfin', url: `${cdnUrl()}/`, icon: '' });
    assert.strictEqual(off.body.data.icon, '');

    await setConfig({
      autoFetchIcons: true,
      iconFetchAllowPrivate: true,
      preferSelfhstIcons: false,
    });
    const favicon = await create('apps', { name: 'Jellyfin', url: `${cdnUrl()}/`, icon: '' });
    assert.match(favicon.body.data.icon, FAVICON);
  });
});
