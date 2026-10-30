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
process.env.PASSWORD = 'ci-validation-password-3c1e';
process.env.SECRET = crypto.randomBytes(32).toString('hex');
// Names the database backup that connectDB makes
process.env.VERSION = '0.0.0';

// Config, the queries/themes files and the database live in data/ relative to
// the working directory, so each run gets its own copy
const repoRoot = join(__dirname, '..');
const workDir = fs.mkdtempSync(join(os.tmpdir(), 'flame-validation-test-'));
const configPath = join(workDir, 'data/config.json');
const initialFiles = require('../utils/init/initialFiles.json').files;
const initialConfig = require('../utils/init/initialConfig.json');

const LEGACY_KEY = 'someRemovedSetting';

fs.mkdirSync(join(workDir, 'data'));
fs.writeFileSync(
  configPath,
  JSON.stringify({ ...initialConfig, [LEGACY_KEY]: 'kept as is' })
);

for (const file of initialFiles.filter((f) => f.isJSON)) {
  fs.writeFileSync(
    join(workDir, 'data', file.name),
    JSON.stringify(file.template)
  );
}

process.chdir(workDir);

// The error handler and migrations log every request
test.mock.method(console, 'log', () => {});

const api = require('../api');
const { connectDB, sequelize } = require('../db');
const associateModels = require('../models/associateModels');
const { getPasswordFingerprint } = require('../utils/password');
const { getTokenVersion } = require('../utils/tokenVersion');
const { SETTINGS } = require('../validation/config');

const UPLOADS_DIR = join(repoRoot, 'data/uploads');
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);

const token = jwt.sign(
  { app: 'flame', pwd: getPasswordFingerprint(), ver: getTokenVersion() },
  process.env.SECRET,
  { expiresIn: '1h', algorithm: 'HS256' }
);

const authed = (method, path) =>
  request(api)[method](path).set('Authorization-Flame', `Bearer ${token}`);

const assertRejected = (res, pattern) => {
  assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(typeof res.body.error, 'string');

  if (pattern) {
    assert.match(res.body.error, pattern);
  }
};

const listUploads = () =>
  new Set(fs.existsSync(UPLOADS_DIR) ? fs.readdirSync(UPLOADS_DIR) : []);

const waitFor = async (check) => {
  for (let i = 0; i < 50 && !check(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

const createdUploads = [];

test.before(async () => {
  await connectDB();
  associateModels();
});

test.after(async () => {
  await require('node-schedule').gracefulShutdown();
  await sequelize.close();

  for (const file of createdUploads) {
    fs.rmSync(join(UPLOADS_DIR, file), { force: true });
  }

  process.chdir(repoRoot);
  fs.rmSync(workDir, { recursive: true, force: true });
});

test('validation runs after authentication', async () => {
  const res = await request(api).post('/api/apps').send({ bogus: true });
  assert.strictEqual(res.status, 401);
});

test.describe('categories', () => {
  test('create accepts the client form and rejects bad input', async () => {
    const res = await authed('post', '/api/categories').send({
      name: 'Media',
      type: 'apps',
      isPublic: true,
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.data.isPublic, 1);

    assertRejected(
      await authed('post', '/api/categories').send({
        name: 'x',
        type: 'other',
      }),
      /^type: /
    );
    assertRejected(
      await authed('post', '/api/categories').send({
        name: '   ',
        type: 'apps',
      }),
      /^name: /
    );
    assertRejected(
      await authed('post', '/api/categories').send({
        name: 'x',
        type: 'apps',
        isAdmin: true,
      }),
      /Unrecognized key: "isAdmin"/
    );
  });

  test('update accepts the loaded category sent back but not its id', async () => {
    const created = await authed('post', '/api/categories').send({
      name: 'Tools',
      type: 'bookmarks',
    });
    const category = { ...created.body.data, apps: [], bookmarks: [] };

    const res = await authed('put', `/api/categories/${category.id}`).send({
      ...category,
      id: 999,
      createdAt: '2000-01-01T00:00:00.000Z',
      isPublic: !category.isPublic,
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.id, category.id);
    assert.strictEqual(res.body.data.isPublic, 0);
    assert.notStrictEqual(res.body.data.createdAt, '2000-01-01T00:00:00.000Z');

    const pinned = await authed('put', `/api/categories/${category.id}`).send({
      isPinned: false,
    });
    assert.strictEqual(pinned.status, 200);
    assert.strictEqual(pinned.body.data.isPinned, false);

    assertRejected(
      await authed('put', `/api/categories/${category.id}`).send({
        isPinned: 'yes',
      }),
      /^isPinned: /
    );
    assertRejected(
      await authed('put', '/api/categories/abc').send({}),
      /^id: /
    );
    assertRejected(await authed('delete', '/api/categories/-1'), /^id: /);
  });

  test('reorder only accepts a list of ids and positions', async () => {
    const ok = await authed('put', '/api/categories/0/reorder').send({
      categories: [{ id: 1, orderId: 1 }],
    });
    assert.strictEqual(ok.status, 200);

    assertRejected(
      await authed('put', '/api/categories/0/reorder').send({
        categories: 'all',
      }),
      /^categories: /
    );
    assertRejected(
      await authed('put', '/api/categories/0/reorder').send({
        categories: [{ id: 1, orderId: 1, name: 'renamed' }],
      }),
      /^categories\.0: Unrecognized key/
    );
    assertRejected(
      await authed('put', '/api/categories/0/reorder').send({
        categories: [{ id: '1', orderId: 1.5 }],
      })
    );
  });
});

test.describe('apps', () => {
  let categoryId;

  test.before(async () => {
    const res = await authed('post', '/api/categories').send({
      name: 'Apps',
      type: 'apps',
    });
    categoryId = res.body.data.id;
  });

  test('create accepts JSON and multipart forms', async () => {
    const json = await authed('post', '/api/apps').send({
      name: ' Plex ',
      url: 'plex.local:32400',
      categoryId,
      icon: 'plex',
      isPublic: true,
      description: '',
    });
    assert.strictEqual(json.status, 201);
    assert.strictEqual(json.body.data.name, 'Plex');
    assert.strictEqual(json.body.data.categoryId, categoryId);

    const multipart = await authed('post', '/api/apps')
      .field('name', 'Sonarr')
      .field('description', 'TV')
      .field('url', 'https://sonarr.local')
      .field('categoryId', `${categoryId}`)
      .field('isPublic', '0')
      .attach('icon', PNG, 'icon.png');
    assert.strictEqual(multipart.status, 201, JSON.stringify(multipart.body));
    assert.strictEqual(multipart.body.data.categoryId, categoryId);
    assert.strictEqual(multipart.body.data.isPublic, 0);
    assert.match(multipart.body.data.icon, /^[0-9a-f-]{36}\.png$/);
    createdUploads.push(multipart.body.data.icon);
  });

  test('create rejects unsafe URLs, wrong types and unknown fields', async () => {
    const base = { name: 'x', url: 'https://x.local', categoryId };

    assertRejected(
      await authed('post', '/api/apps').send({
        ...base,
        url: 'javascript://%0aalert(document.cookie)',
      }),
      /^url: URL is invalid or its scheme is not allowed$/
    );
    assertRejected(
      await authed('post', '/api/apps').send({ ...base, categoryId: 'abc' }),
      /^categoryId: /
    );
    assertRejected(
      await authed('post', '/api/apps').send({
        ...base,
        name: 'n'.repeat(256),
      }),
      /^name: /
    );
    assertRejected(
      await authed('post', '/api/apps').send({ ...base, isPublic: 'maybe' }),
      /^isPublic: /
    );
    assertRejected(
      await authed('post', '/api/apps').send({ url: base.url, categoryId }),
      /^name: /
    );
    assertRejected(
      await authed('post', '/api/apps').send({ ...base, extra: 1 }),
      /Unrecognized key: "extra"/
    );
  });

  test('rejected multipart requests leave no uploaded icon behind', async () => {
    const before = listUploads();

    const res = await authed('post', '/api/apps')
      .field('name', 'Bad')
      .field('url', 'javascript:alert(1)')
      .field('categoryId', `${categoryId}`)
      .attach('icon', PNG, 'icon.png');
    assertRejected(res, /^url: /);

    await waitFor(() => listUploads().size === before.size);
    assert.deepStrictEqual(listUploads(), before);
  });

  test('update accepts the client edit and pin requests', async () => {
    const created = await authed('post', '/api/apps').send({
      name: 'Radarr',
      url: 'radarr.local',
      categoryId,
    });
    const app = created.body.data;

    // AppsTable toggles visibility by sending the whole app back
    const toggled = await authed('put', `/api/apps/${app.id}`).send({
      ...app,
      isPublic: !app.isPublic,
      source: 'docker',
      orderId: 42,
    });
    assert.strictEqual(toggled.status, 200, JSON.stringify(toggled.body));
    assert.strictEqual(toggled.body.data.isPublic, 0);
    assert.strictEqual(toggled.body.data.source, null);
    assert.strictEqual(toggled.body.data.orderId, null);

    const pinned = await authed('put', `/api/apps/${app.id}`).send({
      isPinned: !app.isPinned,
    });
    assert.strictEqual(pinned.status, 200);
    assert.strictEqual(pinned.body.data.isPinned, !app.isPinned);

    const multipart = await authed('put', `/api/apps/${app.id}`)
      .field('name', 'Radarr 2')
      .field('description', '')
      .field('url', 'https://radarr.local')
      .field('categoryId', `${categoryId}`)
      .field('isPublic', '1')
      .attach('icon', PNG, 'icon.png');
    assert.strictEqual(multipart.status, 200, JSON.stringify(multipart.body));
    assert.strictEqual(multipart.body.data.name, 'Radarr 2');
    createdUploads.push(multipart.body.data.icon);

    assertRejected(
      await authed('put', `/api/apps/${app.id}`).send({
        url: 'data:text/html,x',
      }),
      /^url: /
    );
    assertRejected(
      await authed('put', `/api/apps/${app.id}`).send({ isPinned: 'true' }),
      /^isPinned: /
    );
    assertRejected(await authed('put', '/api/apps/1.5').send({}), /^id: /);

    assert.strictEqual(
      (await authed('put', '/api/apps/99999').send({ name: 'x' })).status,
      404
    );
  });

  test('delete and reorder', async () => {
    const created = await authed('post', '/api/apps').send({
      name: 'Temp',
      url: 'temp.local',
      categoryId,
    });

    const reorder = await authed('put', '/api/apps/0/reorder').send({
      apps: [{ id: created.body.data.id, orderId: 1 }],
    });
    assert.strictEqual(reorder.status, 200);
    assertRejected(
      await authed('put', '/api/apps/0/reorder').send({}),
      /^apps: /
    );

    assertRejected(await authed('delete', '/api/apps/abc'), /^id: /);
    assertRejected(
      await authed('delete', `/api/apps/${created.body.data.id}`).send({
        cascade: true,
      }),
      /Unrecognized key/
    );
    assert.strictEqual(
      (await authed('delete', `/api/apps/${created.body.data.id}`)).status,
      200
    );
  });
});

test.describe('bookmarks', () => {
  let categoryId;

  test.before(async () => {
    const res = await authed('post', '/api/categories').send({
      name: 'Links',
      type: 'bookmarks',
    });
    categoryId = res.body.data.id;
  });

  test('create, update, reorder and delete', async () => {
    const created = await authed('post', '/api/bookmarks').send({
      name: 'Docs',
      url: 'https://docs.local',
      categoryId,
      icon: '',
      isPublic: true,
    });
    assert.strictEqual(created.status, 201);
    const bookmark = created.body.data;

    const multipart = await authed('post', '/api/bookmarks')
      .field('name', 'Wiki')
      .field('url', 'wiki.local')
      .field('categoryId', `${categoryId}`)
      .field('isPublic', '1')
      .attach('icon', PNG, 'icon.png');
    assert.strictEqual(multipart.status, 201, JSON.stringify(multipart.body));
    createdUploads.push(multipart.body.data.icon);

    const toggled = await authed('put', `/api/bookmarks/${bookmark.id}`).send({
      ...bookmark,
      isPublic: false,
    });
    assert.strictEqual(toggled.status, 200, JSON.stringify(toggled.body));
    assert.strictEqual(toggled.body.data.isPublic, 0);
    assert.strictEqual(toggled.body.data.categoryId, categoryId);

    // categoryId is no longer forced through parseInt when it is omitted
    const renamed = await authed('put', `/api/bookmarks/${bookmark.id}`).send({
      name: 'Docs 2',
    });
    assert.strictEqual(renamed.status, 200);
    assert.strictEqual(renamed.body.data.categoryId, categoryId);

    assertRejected(
      await authed('post', '/api/bookmarks').send({
        name: 'x',
        url: 'vbscript:msgbox(1)',
        categoryId,
      }),
      /^url: /
    );
    assertRejected(
      await authed('put', `/api/bookmarks/${bookmark.id}`).send({
        description: 'x',
      }),
      /Unrecognized key: "description"/
    );
    assertRejected(
      await authed('put', '/api/bookmarks/0/reorder').send({
        bookmarks: [{ id: 0, orderId: 1 }],
      }),
      /^bookmarks\.0\.id: /
    );

    const reorder = await authed('put', '/api/bookmarks/0/reorder').send({
      bookmarks: [{ id: bookmark.id, orderId: 1 }],
    });
    assert.strictEqual(reorder.status, 200);

    assert.strictEqual(
      (await authed('delete', `/api/bookmarks/${bookmark.id}`)).status,
      200
    );
  });
});

test.describe('config', () => {
  const readStored = () => JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  test('every stored setting has a schema', () => {
    for (const key of Object.keys(initialConfig)) {
      assert.ok(key in SETTINGS, `missing schema for ${key}`);
    }
  });

  test('the whole admin config can be sent back with a change', async () => {
    const admin = await authed('get', '/api/config/admin');
    assert.strictEqual(admin.status, 200);
    assert.ok(LEGACY_KEY in admin.body.data);
    assert.ok('hasWeatherKey' in admin.body.data);

    const res = await authed('put', '/api/config').send({
      ...admin.body.data,
      customTitle: 'Validated',
      hideApps: true,
      lat: null,
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const stored = readStored();
    assert.strictEqual(stored.customTitle, 'Validated');
    assert.strictEqual(stored.hideApps, true);
    assert.strictEqual(stored.lat, null);
    assert.strictEqual(stored[LEGACY_KEY], 'kept as is');
    assert.ok(!('hasWeatherKey' in stored));
    assert.ok(!('weatherEnabled' in stored));
  });

  test('changed values must match their schema', async () => {
    const before = fs.readFileSync(configPath, 'utf-8');
    const cases = [
      [{ hideApps: 'yes' }, /^hideApps: /],
      [{ lat: 91 }, /^lat: /],
      [{ long: '0' }, /^long: /],
      [{ useOrdering: 'random' }, /^useOrdering: /],
      [
        { weatherProvider: 'acme' },
        /^weatherProvider: Unknown weather provider$/,
      ],
      [{ dockerHost: 'ftp://docker:21' }, /^dockerHost: Invalid Docker host: /],
      [{ WEATHER_API_KEY: 42 }, /^WEATHER_API_KEY: /],
      [{ customTitle: 't'.repeat(256) }, /^customTitle: /],
      [{ statusCheckSlow: -1 }, /^statusCheckSlow: /],
      [{ statusColorUp: 'red' }, /^statusColorUp: Must be empty or a hex color/],
      [{ statusColorDown: '#fff;}body{' }, /^statusColorDown: /],
      [{ isAdmin: true }, /Unrecognized key: "isAdmin"/],
      [{ [LEGACY_KEY]: 'changed' }, /Unrecognized key/],
    ];

    for (const [body, pattern] of cases) {
      assertRejected(await authed('put', '/api/config').send(body), pattern);
    }

    assert.strictEqual(fs.readFileSync(configPath, 'utf-8'), before);
  });

  test('valid weather and docker settings are saved', async () => {
    const res = await authed('put', '/api/config').send({
      weatherProvider: 'open-meteo',
      lat: 51.5,
      long: -0.12,
      isCelsius: false,
      weatherData: 'humidity',
      dockerHost: 'tcp://10.0.0.2:2375',
      dockerApps: false,
      WEATHER_API_KEY: '',
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(readStored().dockerHost, 'tcp://10.0.0.2:2375');
  });

  test('status colors are hex colors or empty', async () => {
    const res = await authed('put', '/api/config').send({
      statusCheckSlow: 1.5,
      statusColorUp: '#3FB950',
      statusColorUnhealthy: '',
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(readStored().statusCheckSlow, 1.5);
    assert.strictEqual(readStored().statusColorUp, '#3FB950');
    assert.strictEqual(readStored().statusColorUnhealthy, '');
  });

  test('custom CSS must be a string', async () => {
    assertRejected(
      await authed('put', '/api/config/0/css').send({ styles: 42 }),
      /^styles: /
    );
    assertRejected(
      await authed('put', '/api/config/0/css').send({ styles: '', path: 'x' }),
      /Unrecognized key/
    );
  });
});

test.describe('search queries', () => {
  const query = {
    name: 'Kagi',
    prefix: 'kg',
    template: 'https://kagi.com/search?q=',
  };

  test('add, update and delete', async () => {
    const added = await authed('post', '/api/queries').send(query);
    assert.strictEqual(added.status, 201);
    assert.deepStrictEqual(added.body.data, query);

    const updated = await authed('put', '/api/queries/kg').send({
      ...query,
      name: 'Kagi Search',
    });
    assert.strictEqual(updated.status, 200);
    assert.strictEqual(updated.body.data[0].name, 'Kagi Search');

    const deleted = await authed('delete', '/api/queries/kg');
    assert.strictEqual(deleted.status, 200);
    assert.deepStrictEqual(deleted.body.data, []);
  });

  test('rejects bad prefixes, templates and extra fields', async () => {
    assertRejected(
      await authed('post', '/api/queries').send({ ...query, prefix: 'k1' }),
      /^prefix: /
    );
    assertRejected(
      await authed('post', '/api/queries').send({
        ...query,
        template: 'javascript:alert(1)//',
      }),
      /^template: URL is invalid/
    );
    assertRejected(
      await authed('post', '/api/queries').send({ name: 'x', prefix: 'x' }),
      /^template: /
    );
    assertRejected(
      await authed('put', '/api/queries/kg').send({
        ...query,
        isDefault: true,
      }),
      /Unrecognized key/
    );
  });
});

test.describe('themes', () => {
  const theme = {
    name: 'my_theme',
    colors: { background: '#1a1a1a', primary: '#FFFDEA', accent: '#5c5c5c' },
    isCustom: true,
  };

  test('add, update and delete', async () => {
    const added = await authed('post', '/api/themes').send(theme);
    assert.strictEqual(added.status, 201);

    const updated = await authed('put', '/api/themes/my_theme').send({
      ...theme,
      colors: { ...theme.colors, accent: '#fff' },
    });
    assert.strictEqual(updated.status, 200);
    assert.strictEqual(updated.body.data[0].colors.accent, '#fff');

    const deleted = await authed('delete', '/api/themes/my_theme');
    assert.strictEqual(deleted.status, 200);
  });

  test('rejects non-hex colors, unsafe names and extra fields', async () => {
    assertRejected(
      await authed('post', '/api/themes').send({
        ...theme,
        colors: { ...theme.colors, primary: 'red; background: url(//evil)' },
      }),
      /^colors\.primary: /
    );
    assertRejected(
      await authed('post', '/api/themes').send({ ...theme, name: '../x' }),
      /^name: /
    );
    assertRejected(
      await authed('post', '/api/themes').send({ ...theme, isCustom: 'yes' }),
      /^isCustom: /
    );
    assertRejected(
      await authed('post', '/api/themes').send({
        ...theme,
        colors: { ...theme.colors, extra: '#000' },
      }),
      /^colors: Unrecognized key/
    );
  });
});

test.describe('auth body shape', () => {
  const CSRF = { 'X-Flame-CSRF': '1' };

  test('login and token validation reject malformed bodies', async () => {
    assertRejected(
      await request(api)
        .post('/api/auth')
        .set(CSRF)
        .send({ password: 'x', duration: '1h', admin: true }),
      /Unrecognized key: "admin"/
    );
    assertRejected(
      await request(api)
        .post('/api/auth')
        .set(CSRF)
        .send({ password: ['x'], duration: '1h' }),
      /^password: /
    );
    assertRejected(
      await request(api)
        .post('/api/auth/validate')
        .send({ token: { $ne: 1 } }),
      /^token: /
    );
    assertRejected(
      await request(api).post('/api/auth/validate').send({}),
      /^token: /
    );

    const ok = await request(api).post('/api/auth/validate').send({ token });
    assert.strictEqual(ok.status, 200);
  });

  test('session, logout and logout-all take no body', async () => {
    assertRejected(
      await request(api).get('/api/auth').send({ token }),
      /Unrecognized key: "token"/
    );
    assertRejected(
      await request(api).post('/api/auth/logout').set(CSRF).send({ all: true }),
      /Unrecognized key: "all"/
    );
    assertRejected(
      await authed('post', '/api/auth/logout-all').send({ keep: 'this' }),
      /Unrecognized key: "keep"/
    );

    // Unauthenticated requests are refused before the body is looked at
    const anonymous = await request(api)
      .post('/api/auth/logout-all')
      .set(CSRF)
      .send({ keep: 'this' });
    assert.strictEqual(anonymous.status, 401);

    const session = await authed('get', '/api/auth');
    assert.strictEqual(session.status, 200);
    assert.strictEqual(session.body.data.isAuthenticated, true);

    const logout = await request(api)
      .post('/api/auth/logout')
      .set(CSRF)
      .send({});
    assert.strictEqual(logout.status, 200);
  });
});
