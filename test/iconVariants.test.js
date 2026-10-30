// Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const { join } = require('path');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const Umzug = require('umzug');
const { QueryTypes } = require('sequelize');

process.env.NODE_ENV = 'test';
process.env.PASSWORD = 'ci-icon-variants-password-7e1b';
process.env.SECRET = crypto.randomBytes(32).toString('hex');
// Names the database backup that connectDB takes before migrating
process.env.VERSION = '0.0.0';

const repoRoot = join(__dirname, '..');
const workDir = fs.mkdtempSync(join(os.tmpdir(), 'flame-icon-variants-test-'));

fs.mkdirSync(join(workDir, 'data'));
fs.writeFileSync(
  join(workDir, 'data/config.json'),
  JSON.stringify(require('../utils/init/initialConfig.json'))
);
process.chdir(workDir);

test.mock.method(console, 'log', () => {});

const { connectDB, sequelize } = require('../db');
const associateModels = require('../models/associateModels');
const App = require('../models/App');
const Bookmark = require('../models/Bookmark');
const api = require('../api');
const applyIntegrationApps = require('../controllers/apps/docker/applyIntegrationApps');
const variantsMigration = require('../db/migrations/14_icon-theme-variants');
const { UPLOADS_DIR } = require('../utils/favicon');
const { getPasswordFingerprint } = require('../utils/password');
const { getTokenVersion } = require('../utils/tokenVersion');

// Migrations that ran before this feature
const EARLIER_MIGRATIONS = /^(0\d|1[0-3])_.+\.js$/;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7, 7, 7]);

const AUTO = {
  icon: 'selfhst-jellyfin.svg',
  iconOnDark: 'selfhst-jellyfin_light.svg',
  iconOnLight: 'selfhst-jellyfin_dark.svg',
};
const NONE = { iconOnDark: null, iconOnLight: null };

const rows = (sql) => sequelize.query(sql, { type: QueryTypes.SELECT });
const variants = ({ icon, iconOnDark, iconOnLight }) => ({ icon, iconOnDark, iconOnLight });

const APP_COLUMNS = 'id, name, url, categoryId, icon, isPinned, isPublic, description, source';
const BOOKMARK_COLUMNS = 'id, name, url, categoryId, icon, isPublic';

let before;
let token;
let categoryIds = {};
const uploaded = [];

test.before(async () => {
  await new Umzug({
    migrations: {
      path: join(repoRoot, 'db/migrations'),
      pattern: EARLIER_MIGRATIONS,
      params: [sequelize.getQueryInterface()],
    },
    storage: 'sequelize',
    storageOptions: { sequelize },
  }).up();

  const now = '2026-01-02 03:04:05.000 +00:00';

  for (const type of ['apps', 'bookmarks']) {
    await sequelize.query(
      `INSERT INTO categories (name, type, isPinned, orderId, isPublic, createdAt, updatedAt)
       VALUES (:type, :type, 1, 1, 1, :now, :now)`,
      { replacements: { type, now } }
    );
    [{ id: categoryIds[type] }] = await rows(
      `SELECT id FROM categories WHERE type = '${type}'`
    );
  }

  // Picked from selfh.st before icons could follow the theme
  await sequelize.query(
    `INSERT INTO apps (name, url, categoryId, icon, isPinned, isPublic, description, source, createdAt, updatedAt)
     VALUES ('Jellyfin', 'http://192.168.1.2:8096', :categoryId, 'selfhst-jellyfin_light.svg', 1, 1, '', NULL, :now, :now)`,
    { replacements: { categoryId: categoryIds.apps, now } }
  );
  await sequelize.query(
    `INSERT INTO bookmarks (name, url, categoryId, icon, isPublic, createdAt, updatedAt)
     VALUES ('Docs', 'https://docs.example.com', :categoryId, 'book', 1, :now, :now)`,
    { replacements: { categoryId: categoryIds.bookmarks, now } }
  );

  before = {
    apps: await rows(`SELECT ${APP_COLUMNS} FROM apps ORDER BY id`),
    bookmarks: await rows(`SELECT ${BOOKMARK_COLUMNS} FROM bookmarks ORDER BY id`),
  };

  await connectDB();
  associateModels();

  token = jwt.sign(
    { app: 'flame', pwd: getPasswordFingerprint(), ver: getTokenVersion() },
    process.env.SECRET,
    { expiresIn: '1h', algorithm: 'HS256' }
  );
});

test.after(async () => {
  for (const name of uploaded) {
    fs.rmSync(join(UPLOADS_DIR, name), { force: true });
  }

  await require('node-schedule').gracefulShutdown();
  await sequelize.close();
  process.chdir(repoRoot);
  fs.rmSync(workDir, { recursive: true, force: true });
});

const authed = (method, path) =>
  request(api)[method](path).set('Authorization-Flame', `Bearer ${token}`);

test.describe('migration 14_icon-theme-variants', () => {
  test('keeps existing apps and bookmarks on their current icon', async () => {
    assert.deepStrictEqual(await rows(`SELECT ${APP_COLUMNS} FROM apps ORDER BY id`), before.apps);
    assert.deepStrictEqual(
      await rows(`SELECT ${BOOKMARK_COLUMNS} FROM bookmarks ORDER BY id`),
      before.bookmarks
    );

    for (const table of ['apps', 'bookmarks']) {
      assert.deepStrictEqual(
        await rows(`SELECT iconOnDark, iconOnLight FROM ${table}`),
        [NONE],
        table
      );
    }
  });

  test('can be reverted and applied again', async () => {
    const query = sequelize.getQueryInterface();

    await variantsMigration.down(query);
    for (const table of ['apps', 'bookmarks']) {
      const columns = await query.describeTable(table);
      assert.ok(!('iconOnDark' in columns) && !('iconOnLight' in columns), table);
    }
    assert.deepStrictEqual(await rows(`SELECT ${APP_COLUMNS} FROM apps ORDER BY id`), before.apps);

    await variantsMigration.up(query);
    for (const table of ['apps', 'bookmarks']) {
      const columns = await query.describeTable(table);
      assert.strictEqual(columns.iconOnDark.allowNull, true, table);
      assert.strictEqual(columns.iconOnLight.allowNull, true, table);
    }
  });

  test('the API returns the new fields for existing items', async () => {
    const apps = await authed('get', '/api/apps');
    const jellyfin = apps.body.data.find((a) => a.name === 'Jellyfin');
    assert.deepStrictEqual(variants(jellyfin), { icon: 'selfhst-jellyfin_light.svg', ...NONE });

    const bookmarks = await authed('get', '/api/bookmarks');
    assert.deepStrictEqual(variants(bookmarks.body.data[0]), { icon: 'book', ...NONE });
  });
});

for (const type of ['apps', 'bookmarks']) {
  test.describe(`${type}: icon theme versions`, () => {
    const create = (body) =>
      authed('post', `/api/${type}`).send({
        name: 'Jellyfin',
        url: 'https://jellyfin.example.com',
        categoryId: categoryIds[type],
        ...body,
      });
    const update = (id, body) => authed('put', `/api/${type}/${id}`).send(body);

    test('are stored on create, and empty means none', async () => {
      const auto = await create(AUTO);
      assert.strictEqual(auto.status, 201, JSON.stringify(auto.body));
      assert.deepStrictEqual(variants(auto.body.data), AUTO);

      const empty = await create({ icon: 'movie', iconOnDark: '', iconOnLight: null });
      assert.strictEqual(empty.status, 201, JSON.stringify(empty.body));
      assert.deepStrictEqual(variants(empty.body.data), { icon: 'movie', ...NONE });

      const plain = await create({ icon: 'movie' });
      assert.deepStrictEqual(variants(plain.body.data), { icon: 'movie', ...NONE });
    });

    test('are validated like the icon', async () => {
      for (const body of [
        { iconOnDark: 42 },
        { iconOnLight: ['a.svg'] },
        { iconOnDark: 'x'.repeat(2049) },
      ]) {
        const res = await create({ icon: 'movie', ...body });
        assert.strictEqual(res.status, 400, JSON.stringify(body));
        assert.match(res.body.error, /^iconOn(Dark|Light): /);
      }
    });

    test('are kept until the icon changes', async () => {
      const { body } = await create(AUTO);
      const { id } = body.data;

      const renamed = await update(id, { name: 'Jellyfin 2' });
      assert.deepStrictEqual(variants(renamed.body.data), AUTO);

      // The edit form sends back everything it loaded
      const resaved = await update(id, renamed.body.data);
      assert.strictEqual(resaved.status, 200, JSON.stringify(resaved.body));
      assert.deepStrictEqual(variants(resaved.body.data), AUTO);

      const sameIcon = await update(id, { icon: AUTO.icon });
      assert.deepStrictEqual(variants(sameIcon.body.data), AUTO);

      const changed = await update(id, { icon: 'movie' });
      assert.deepStrictEqual(variants(changed.body.data), { icon: 'movie', ...NONE });

      const repicked = await update(id, AUTO);
      assert.deepStrictEqual(variants(repicked.body.data), AUTO);

      const standard = await update(id, { icon: 'selfhst-jellyfin.webp', ...NONE });
      assert.deepStrictEqual(variants(standard.body.data), {
        icon: 'selfhst-jellyfin.webp',
        ...NONE,
      });
    });

    test('are cleared by an uploaded icon', async () => {
      const { body } = await create(AUTO);

      const res = await authed('put', `/api/${type}/${body.data.id}`)
        .field('name', 'Jellyfin')
        .attach('icon', PNG, 'icon.png');
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      uploaded.push(res.body.data.icon);

      assert.match(res.body.data.icon, /^[0-9a-f-]{36}\.png$/);
      assert.deepStrictEqual(variants(res.body.data), { icon: res.body.data.icon, ...NONE });
    });
  });
}

test.describe('integration sync', () => {
  test('a new icon from a label clears the theme versions, a kept one keeps them', async () => {
    const app = await App.create({
      name: 'Sonarr',
      url: 'http://sonarr.lan:8989',
      categoryId: categoryIds.apps,
      ...AUTO,
    });

    await applyIntegrationApps('docker', [{ name: 'Sonarr', url: 'http://sonarr.lan', icon: 'docker' }], {
      defaultIcon: 'docker',
    });
    await app.reload();
    assert.deepStrictEqual(variants(app), AUTO);

    await applyIntegrationApps('docker', [{ name: 'Sonarr', url: 'http://sonarr.lan', icon: 'custom' }], {
      defaultIcon: 'docker',
    });
    await app.reload();
    assert.deepStrictEqual(variants(app), AUTO);

    await applyIntegrationApps('docker', [{ name: 'Sonarr', url: 'http://sonarr.lan', icon: 'television' }], {
      defaultIcon: 'docker',
    });
    await app.reload();
    assert.deepStrictEqual(variants(app), { icon: 'television', ...NONE });
  });

  test('new apps have none', async () => {
    const item = { name: 'Radarr', url: 'http://radarr.lan', icon: 'movie', categoryId: categoryIds.apps };
    await applyIntegrationApps('docker', [item], {
      defaultIcon: 'docker',
    });
    const app = await App.findOne({ where: { name: 'Radarr' } });
    assert.deepStrictEqual(variants(app), { icon: 'movie', ...NONE });
  });
});

test('Bookmark and App models list the columns', () => {
  for (const model of [App, Bookmark]) {
    assert.strictEqual(model.rawAttributes.iconOnDark.allowNull, true);
    assert.strictEqual(model.rawAttributes.iconOnLight.allowNull, true);
  }
});
