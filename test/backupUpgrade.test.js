// Run with: node --test
// A backup of an instance upgraded from upstream Flame v2.4.0 must restore into
// a fresh install, and backups that leave out fields added later must restore
// with the defaults.
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
process.env.PASSWORD = 'ci-backup-upgrade-password-0d4e';
process.env.SECRET = crypto.randomBytes(32).toString('hex');
process.env.VERSION = '2.5.0';

const repoRoot = join(__dirname, '..');
const workDir = fs.mkdtempSync(join(os.tmpdir(), 'flame-backup-upgrade-test-'));
const initialConfig = require('../utils/init/initialConfig.json');
const { template: initialThemes } =
  require('../utils/init/initialFiles.json').files.find(
    (f) => f.name === 'themes.json'
  );

// Settings upstream v2.4.0 did not have
const NEWER_KEYS = [
  'weatherProvider',
  'extraUrlSchemes',
  'backupSchedule',
  'backupRetention',
  'autoFetchIcons',
  'iconFetchAllowPrivate',
  'statusChecks',
  'statusCheckInterval',
  'statusCheckTimeout',
  'statusCheckSlow',
  'statusCheckDocker',
  'statusColorUp',
  'statusColorUnhealthy',
  'statusColorDown',
];
const upstreamConfig = Object.fromEntries(
  Object.entries({
    ...initialConfig,
    customTitle: 'Upstream Flame',
    useOrdering: 'orderId',
    WEATHER_API_KEY: 'upstream-weather-key',
  }).filter(([key]) => !NEWER_KEYS.includes(key))
);

const writeJson = (path, value) =>
  fs.writeFileSync(path, JSON.stringify(value));
const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf-8'));

fs.mkdirSync(join(workDir, 'data'));
writeJson(join(workDir, 'data/config.json'), upstreamConfig);
writeJson(join(workDir, 'data/themes.json'), initialThemes);
writeJson(join(workDir, 'data/customQueries.json'), {
  queries: [
    {
      name: 'Brave',
      prefix: 'b',
      template: 'https://search.brave.com/search?q=',
    },
  ],
});
process.chdir(workDir);

test.mock.method(console, 'log', () => {});

const api = require('../api');
const { connectDB, sequelize, umzug } = require('../db');
const associateModels = require('../models/associateModels');
const App = require('../models/App');
const Bookmark = require('../models/Bookmark');
const Category = require('../models/Category');
const { getPasswordFingerprint } = require('../utils/password');
const { getTokenVersion } = require('../utils/tokenVersion');
const { buildBackup } = require('./zipFixture');

// Migrations shipped by upstream v2.4.0
const UPSTREAM_MIGRATIONS = /^(0[0-4]_.+|05_app-description)\.js$/;

const token = jwt.sign(
  { app: 'flame', pwd: getPasswordFingerprint(), ver: getTokenVersion() },
  process.env.SECRET,
  { expiresIn: '1h', algorithm: 'HS256' }
);

const authed = (req) => req.set('Authorization-Flame', `Bearer ${token}`);
const rows = (sql) => sequelize.query(sql, { type: QueryTypes.SELECT });

const tables = async () => ({
  categories: await rows('SELECT * FROM categories ORDER BY id'),
  apps: await rows('SELECT * FROM apps ORDER BY id'),
  bookmarks: await rows('SELECT * FROM bookmarks ORDER BY id'),
});

// 07_default-app-categories stores its timestamps with the local UTC offset,
// which Sequelize reads as UTC. Restored rows are stored in UTC, so compare the
// timestamps as Flame reads them.
const asRead = async () => {
  const result = {};

  for (const model of [Category, App, Bookmark]) {
    result[model.tableName] = (
      await model.findAll({ order: [['id', 'ASC']] })
    ).map((row) => row.get({ plain: true }));
  }

  return result;
};

const withoutTimestamps = (snapshot) =>
  Object.fromEntries(
    Object.entries(snapshot).map(([table, items]) => [
      table,
      items.map(({ createdAt, updatedAt, ...row }) => row),
    ])
  );

const buildUpstreamDB = async () => {
  await new Umzug({
    migrations: {
      path: join(repoRoot, 'db/migrations'),
      pattern: UPSTREAM_MIGRATIONS,
      params: [sequelize.getQueryInterface()],
    },
    storage: 'sequelize',
    storageOptions: { sequelize },
  }).up();

  const now = '2025-06-07 10:00:00.000 +00:00';
  const insert = (table, values) => {
    const keys = Object.keys(values);
    return sequelize.query(
      `INSERT INTO ${table} (${keys.join(', ')}, createdAt, updatedAt)
       VALUES (${keys.map((k) => `:${k}`).join(', ')}, :now, :now)`,
      { replacements: { ...values, now } }
    );
  };

  for (const [i, name] of ['News', 'Tools'].entries()) {
    await insert('categories', {
      name,
      isPinned: 1,
      orderId: i + 1,
      isPublic: 1,
    });
  }

  for (let i = 0; i < 6; i++) {
    await insert('bookmarks', {
      name: `Bookmark ${i + 1}`,
      url: `https://bookmark-${i + 1}.example.com`,
      categoryId: (i % 2) + 1,
      icon: 'bookmark',
      isPublic: i === 0 ? 0 : 1,
      orderId: null,
    });
  }

  for (let i = 0; i < 5; i++) {
    await insert('apps', {
      name: `App ${i + 1}`,
      url:
        i % 2 ? `orbit.local:${9000 + i}` : `https://app-${i + 1}.example.com`,
      icon: 'docker',
      isPinned: i === 4 ? 0 : 1,
      orderId: i,
      isPublic: i === 3 ? 0 : 1,
      description: i === 2 ? 'NAS' : '',
    });
  }
};

const exportBackup = async () => {
  const res = await authed(request(api).get('/api/backup/export'))
    .buffer(true)
    .parse((res, cb) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });

  assert.strictEqual(res.status, 200);
  return res.body;
};

const upload = (path, archive) =>
  authed(request(api).post(path)).attach('backup', archive, 'backup.zip');

// What a new install starts with: every migration, the default files, no data
const freshInstall = async () => {
  await sequelize.getQueryInterface().dropAllTables();
  fs.rmSync('data/db_backups', { recursive: true, force: true });
  fs.rmSync('data/backups', { recursive: true, force: true });
  writeJson('data/config.json', initialConfig);
  writeJson('data/themes.json', initialThemes);
  writeJson('data/customQueries.json', { queries: [] });
  await umzug.up();
};

test.before(async () => {
  await buildUpstreamDB();
  await connectDB();
  associateModels();
});

test.after(async () => {
  await require('node-schedule').gracefulShutdown();
  await sequelize.close();
  process.chdir(repoRoot);
  fs.rmSync(workDir, { recursive: true, force: true });
});

test('a backup of an upgraded upstream instance restores into a fresh install', async () => {
  const upgraded = await tables();
  const upgradedAsRead = await asRead();
  // 07_default-app-categories moved the apps into "Applications" and "Other apps"
  assert.strictEqual(upgraded.categories.length, 4);
  assert.strictEqual(upgraded.apps.length, 5);

  const archive = await exportBackup();

  await freshInstall();
  assert.deepStrictEqual(await tables(), {
    categories: [],
    apps: [],
    bookmarks: [],
  });
  assert.deepStrictEqual(await umzug.pending(), []);

  const preview = await upload('/api/backup/restore/preview', archive);
  assert.strictEqual(preview.status, 200, preview.text);
  assert.deepStrictEqual(
    {
      categories: preview.body.data.backup.categories,
      apps: preview.body.data.backup.apps,
      bookmarks: preview.body.data.backup.bookmarks,
      queries: preview.body.data.backup.queries,
    },
    { categories: 4, apps: 5, bookmarks: 6, queries: 1 }
  );
  assert.strictEqual(preview.body.data.current.apps, 0);

  const res = await upload('/api/backup/restore', archive);
  assert.strictEqual(res.status, 200, res.text);

  assert.deepStrictEqual(
    withoutTimestamps(await tables()),
    withoutTimestamps(upgraded)
  );
  assert.deepStrictEqual(await asRead(), upgradedAsRead);
  assert.deepStrictEqual(
    readJson('data/customQueries.json').queries.map((q) => q.prefix),
    ['b']
  );

  const config = readJson('data/config.json');
  for (const [key, value] of Object.entries(upstreamConfig)) {
    if (key !== 'WEATHER_API_KEY')
      assert.deepStrictEqual(config[key], value, key);
  }
  // Settings upstream didn't have keep the fresh install's defaults
  for (const key of NEWER_KEYS) {
    assert.deepStrictEqual(config[key], initialConfig[key], key);
  }
  assert.strictEqual(config.WEATHER_API_KEY, '');

  const categories = await authed(request(api).get('/api/categories'));
  assert.strictEqual(categories.status, 200);
  assert.deepStrictEqual(
    categories.body.data
      .filter((c) => c.type === 'apps')
      .flatMap((c) => c.apps.map((a) => a.name))
      .sort(),
    ['App 1', 'App 2', 'App 3', 'App 4', 'App 5']
  );
});

test("a backup with only the first format's required fields restores with defaults", async () => {
  await freshInstall();
  const themes = readJson('data/themes.json');

  const archive = buildBackup({
    manifest: { flameVersion: undefined, createdAt: undefined },
    data: {
      categories: [
        { id: 1, name: 'Home', type: 'apps' },
        { id: 2, name: 'Reading', type: 'bookmarks' },
      ],
      apps: [{ id: 1, name: 'Router', url: '192.168.1.1', categoryId: 1 }],
      bookmarks: [
        { id: 1, name: 'News', url: 'https://news.example.com', categoryId: 2 },
      ],
    },
  });

  const before = Date.now();
  const res = await upload('/api/backup/restore', archive);
  assert.strictEqual(res.status, 200, res.text);

  const { categories, apps, bookmarks } = await tables();
  const recent = (value) =>
    Math.abs(new Date(value).getTime() - before) < 60000;

  assert.ok(
    categories.every((c) => recent(c.createdAt) && recent(c.updatedAt))
  );
  assert.deepStrictEqual(
    categories.map(({ name, type, isPinned, isPublic, orderId }) => ({
      name,
      type,
      isPinned,
      isPublic,
      orderId,
    })),
    [
      { name: 'Home', type: 'apps', isPinned: 0, isPublic: 1, orderId: null },
      {
        name: 'Reading',
        type: 'bookmarks',
        isPinned: 0,
        isPublic: 1,
        orderId: null,
      },
    ]
  );

  const [app] = apps;
  assert.deepStrictEqual(
    {
      icon: app.icon,
      isPinned: app.isPinned,
      isPublic: app.isPublic,
      description: app.description,
      source: app.source,
      orderId: app.orderId,
      externalUrl: app.externalUrl,
      preferredUrl: app.preferredUrl,
      statusCheck: app.statusCheck,
      statusUrl: app.statusUrl,
    },
    {
      icon: 'cancel',
      isPinned: 0,
      isPublic: 1,
      description: '',
      source: null,
      orderId: null,
      externalUrl: '',
      preferredUrl: 'internal',
      statusCheck: 1,
      statusUrl: null,
    }
  );
  assert.strictEqual(bookmarks[0].icon, '');
  assert.strictEqual(bookmarks[0].isPublic, 1);

  // Sections the backup doesn't have are left as they are
  assert.deepStrictEqual(readJson('data/themes.json'), themes);
  assert.deepStrictEqual(readJson('data/config.json'), initialConfig);
});
