// Run with: node --test
// Upgrading a database created by upstream Flame v2.4.0 (pawelmalak), which has no
// app categories, must keep every app visible.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const { join } = require('path');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const Umzug = require('umzug');
const { Sequelize, QueryTypes } = require('sequelize');

process.env.NODE_ENV = 'test';
process.env.PASSWORD = 'ci-test-password-71be';
process.env.SECRET = crypto.randomBytes(32).toString('hex');
process.env.VERSION = '2.5.0';

const repoRoot = join(__dirname, '..');
const workDir = fs.mkdtempSync(join(os.tmpdir(), 'flame-legacy-test-'));

fs.mkdirSync(join(workDir, 'data/db_backups'), { recursive: true });
fs.writeFileSync(
  join(workDir, 'data/config.json'),
  JSON.stringify({
    ...require('../utils/init/initialConfig.json'),
    useOrdering: 'name',
  })
);
fs.writeFileSync(
  join(workDir, 'data/customQueries.json'),
  JSON.stringify({
    queries: [
      {
        name: 'Brave',
        prefix: 'b',
        template: 'https://search.brave.com/search?q=',
      },
    ],
  })
);
// Left behind by upstream; the fork used to skip its own backup because this name was taken
fs.writeFileSync(
  join(workDir, 'data/db_backups/db-240-backup.sqlite'),
  'old backup'
);
process.chdir(workDir);

test.mock.method(console, 'log', () => {});

const { connectDB, sequelize } = require('../db');
const associateModels = require('../models/associateModels');
const api = require('../api');
const { getPasswordFingerprint } = require('../utils/password');
const { getTokenVersion } = require('../utils/tokenVersion');
const defaultAppCategories = require('../db/migrations/07_default-app-categories');

// Migrations shipped by upstream v2.4.0
const UPSTREAM_MIGRATIONS = /^(0[0-4]_.+|05_app-description)\.js$/;

const CATEGORIES = [
  'Media',
  'Downloads',
  'Servers',
  'Dev',
  'News',
  'Shopping',
  'Social',
  'Tools',
  'Food',
];
const UNPINNED_APPS = ['Whisparr', 'Miniflux', 'Stash', 'Soularr'];
const PRIVATE_APPS = ['Paperless', 'Soularr'];
const APP_COUNT = 33;
const BOOKMARK_COUNT = 47;

const appNames = [
  ...UNPINNED_APPS,
  'Paperless',
  ...Array.from(
    { length: APP_COUNT - UNPINNED_APPS.length - 1 },
    (_, i) => `App ${i + 1}`
  ),
];

const rows = (sql) => sequelize.query(sql, { type: QueryTypes.SELECT });

const snapshot = async () => ({
  apps: await rows(
    'SELECT id, name, url, icon, isPinned, isPublic, orderId, description, createdAt FROM apps ORDER BY id'
  ),
  bookmarks: await rows(
    'SELECT id, name, url, categoryId, icon, isPublic, orderId, createdAt, updatedAt FROM bookmarks ORDER BY id'
  ),
  categories: await rows(
    'SELECT id, name, isPinned, orderId, isPublic, createdAt FROM categories ORDER BY id'
  ),
});

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
      `INSERT INTO ${table} (${keys.join(
        ', '
      )}, createdAt, updatedAt) VALUES (${keys
        .map((k) => `:${k}`)
        .join(', ')}, :now, :now)`,
      { replacements: { ...values, now } }
    );
  };

  for (const [i, name] of CATEGORIES.entries()) {
    await insert('categories', {
      name,
      isPinned: 1,
      orderId: i + 1,
      isPublic: 1,
    });
  }

  // Every category but the last ("Food") gets bookmarks
  for (let i = 0; i < BOOKMARK_COUNT; i++) {
    await insert('bookmarks', {
      name: `Bookmark ${i + 1}`,
      url: `https://bookmark-${i + 1}.example.com`,
      categoryId: (i % (CATEGORIES.length - 1)) + 1,
      icon: 'bookmark',
      isPublic: i === 0 ? 0 : 1,
      orderId: null,
    });
  }

  for (const [i, name] of appNames.entries()) {
    await insert('apps', {
      name,
      url:
        i % 2
          ? `orbit.local:${9000 + i}`
          : `https://${name.toLowerCase().replace(' ', '-')}.example.com`,
      icon: 'docker',
      isPinned: UNPINNED_APPS.includes(name) ? 0 : 1,
      orderId: i % 3 ? i : null,
      isPublic: PRIVATE_APPS.includes(name) ? 0 : 1,
      description: i === 5 ? 'NAS' : '',
    });
  }
};

let before;
let token;

test.before(async () => {
  await buildUpstreamDB();
  before = await snapshot();
  await connectDB();
  associateModels();

  token = jwt.sign(
    { app: 'flame', pwd: getPasswordFingerprint(), ver: getTokenVersion() },
    process.env.SECRET,
    { expiresIn: '1h', algorithm: 'HS256' }
  );
});

test.after(async () => {
  await sequelize.close();
  process.chdir(repoRoot);
  fs.rmSync(workDir, { recursive: true, force: true });
});

const backups = () => fs.readdirSync('data/db_backups').sort();

const getCategories = async (auth) => {
  const req = request(api).get('/api/categories');
  if (auth) req.set('Authorization-Flame', `Bearer ${token}`);
  const res = await req;
  assert.strictEqual(res.status, 200);
  return res.body.data;
};

test('fixture matches the shape of an upstream v2.4.0 database', () => {
  assert.strictEqual(before.apps.length, APP_COUNT);
  assert.strictEqual(before.apps.filter((a) => a.isPinned).length, 29);
  assert.strictEqual(before.apps.filter((a) => !a.isPublic).length, 2);
  assert.strictEqual(before.bookmarks.length, BOOKMARK_COUNT);
  assert.strictEqual(before.categories.length, CATEGORIES.length);
});

test('takes a new, timestamped backup of the pre-migration database', async () => {
  const taken = backups().filter((f) =>
    /^db-250-\d{8}T\d{9}Z-backup\.sqlite$/.test(f)
  );
  assert.strictEqual(taken.length, 1, backups().join(', '));
  assert.ok(backups().includes('db-240-backup.sqlite'));

  const backup = new Sequelize({
    dialect: 'sqlite',
    storage: join('data/db_backups', taken[0]),
    logging: false,
  });

  try {
    const meta = await backup.query('SELECT name FROM SequelizeMeta', {
      type: QueryTypes.SELECT,
    });
    assert.deepStrictEqual(
      meta.map((m) => m.name).filter((n) => !UPSTREAM_MIGRATIONS.test(n)),
      []
    );
    const [{ count }] = await backup.query(
      'SELECT COUNT(*) AS count FROM apps',
      {
        type: QueryTypes.SELECT,
      }
    );
    assert.strictEqual(count, APP_COUNT);
  } finally {
    await backup.close();
  }
});

test('keeps every app, bookmark and category', async () => {
  const after = await snapshot();

  assert.deepStrictEqual(after.apps, before.apps);
  assert.deepStrictEqual(after.bookmarks, before.bookmarks);
  assert.deepStrictEqual(
    after.categories.slice(0, CATEGORIES.length),
    before.categories
  );

  const types = await rows('SELECT id, type FROM categories ORDER BY id');
  assert.ok(
    types.slice(0, CATEGORIES.length).every((c) => c.type === 'bookmarks')
  );
});

test('puts pinned apps in "Applications" and the rest in "Other apps"', async () => {
  const appCategories = await rows(
    `SELECT c.name, c.isPinned, c.isPublic, COUNT(a.id) AS apps, SUM(a.isPinned) AS pinnedApps
     FROM categories c LEFT JOIN apps a ON a.categoryId = c.id
     WHERE c.type = 'apps' GROUP BY c.id ORDER BY c.id`
  );

  assert.deepStrictEqual(appCategories, [
    {
      name: 'Applications',
      isPinned: 1,
      isPublic: 1,
      apps: 29,
      pinnedApps: 29,
    },
    { name: 'Other apps', isPinned: 0, isPublic: 1, apps: 4, pinnedApps: 0 },
  ]);

  const orphans = await rows(
    `SELECT id FROM apps WHERE categoryId IS NULL
     OR categoryId NOT IN (SELECT id FROM categories WHERE type = 'apps')`
  );
  assert.deepStrictEqual(orphans, []);
});

test('the API shows every app to a logged-in user and only public apps otherwise', async () => {
  const appsIn = (categories) =>
    categories
      .filter((c) => c.type === 'apps')
      .flatMap((c) => c.apps.map((a) => a.name));

  const all = await getCategories(true);
  assert.deepStrictEqual(appsIn(all).sort(), [...appNames].sort());
  assert.strictEqual(
    all.filter((c) => c.type === 'bookmarks').flatMap((c) => c.bookmarks)
      .length,
    BOOKMARK_COUNT
  );

  const publicOnly = await getCategories(false);
  assert.deepStrictEqual(
    appsIn(publicOnly).sort(),
    appNames.filter((n) => !PRIVATE_APPS.includes(n)).sort()
  );

  // The home page lists pinned categories only: the same apps upstream pinned
  const home = publicOnly.filter((c) => c.type === 'apps' && c.isPinned);
  assert.deepStrictEqual(
    appsIn(home).sort(),
    appNames
      .filter((n) => !UNPINNED_APPS.includes(n) && !PRIVATE_APPS.includes(n))
      .sort()
  );
});

test('keeps the custom search provider', async () => {
  const res = await request(api).get('/api/queries');
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(
    res.body.data.map((q) => [q.name, q.prefix]),
    [['Brave', 'b']]
  );
});

test('running the migration or connectDB again changes nothing', async () => {
  const after = await rows('SELECT * FROM apps ORDER BY id');
  const categories = await rows('SELECT * FROM categories ORDER BY id');
  const backupsBefore = backups();

  await defaultAppCategories.up(sequelize.getQueryInterface());
  await connectDB();

  assert.deepStrictEqual(await rows('SELECT * FROM apps ORDER BY id'), after);
  assert.deepStrictEqual(
    await rows('SELECT * FROM categories ORDER BY id'),
    categories
  );
  assert.deepStrictEqual(backups(), backupsBefore);
});

test('later uncategorized apps reuse the default categories', async () => {
  await sequelize.query(
    `INSERT INTO apps (name, url, icon, isPinned, isPublic, categoryId, description, createdAt, updatedAt)
     VALUES ('Late', 'https://late.example.com', 'cancel', 1, 1, -1, '', :now, :now)`,
    { replacements: { now: new Date() } }
  );
  const categoryCount = (await rows('SELECT id FROM categories')).length;

  await defaultAppCategories.up(sequelize.getQueryInterface());

  const [late] = await rows(
    `SELECT c.name FROM apps a JOIN categories c ON c.id = a.categoryId WHERE a.name = 'Late'`
  );
  assert.strictEqual(late.name, 'Applications');
  assert.strictEqual(
    (await rows('SELECT id FROM categories')).length,
    categoryCount
  );
});
