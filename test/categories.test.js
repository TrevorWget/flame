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
process.env.PASSWORD = 'ci-test-password-3c7a';
process.env.SECRET = crypto.randomBytes(32).toString('hex');
// Names the database backup that connectDB takes before migrating
process.env.VERSION = '0.0.0';

// The database and config live in data/ relative to the working directory
const repoRoot = join(__dirname, '..');
const workDir = fs.mkdtempSync(join(os.tmpdir(), 'flame-categories-test-'));

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
const Bookmark = require('../models/Bookmark');
const api = require('../api');
const { getPasswordFingerprint } = require('../utils/password');
const { getTokenVersion } = require('../utils/tokenVersion');

let token;

test.before(async () => {
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

const updateCategory = (id, body) =>
  request(api)
    .put(`/api/categories/${id}`)
    .set('Authorization-Flame', `Bearer ${token}`)
    .send(body);

test.describe('category updates', () => {
  test('the response includes the apps and bookmarks', async () => {
    const category = await Category.create({ name: 'Media', type: 'apps' });
    await App.bulkCreate([
      { name: 'Plex', url: 'plex', categoryId: category.id, orderId: 2 },
      { name: 'Jellyfin', url: 'jf', categoryId: category.id, orderId: 1 },
    ]);
    await Bookmark.create({
      name: 'Docs',
      url: 'docs',
      categoryId: category.id,
    });

    for (const change of [
      { isPinned: true },
      { isPublic: 0 },
      { name: 'Movies' },
    ]) {
      const res = await updateCategory(category.id, change);

      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(
        { ...res.body.data, ...change },
        res.body.data,
        `change applied: ${JSON.stringify(change)}`
      );
      assert.deepStrictEqual(
        res.body.data.apps.map((a) => a.name),
        ['Jellyfin', 'Plex']
      );
      assert.deepStrictEqual(
        res.body.data.bookmarks.map((b) => b.name),
        ['Docs']
      );
    }
  });

  test('an empty category comes back with empty lists', async () => {
    const category = await Category.create({
      name: 'Empty',
      type: 'bookmarks',
    });

    const res = await updateCategory(category.id, { isPinned: true });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.isPinned, true);
    assert.deepStrictEqual(res.body.data.apps, []);
    assert.deepStrictEqual(res.body.data.bookmarks, []);
  });

  test('unknown categories still return 404', async () => {
    const res = await updateCategory(999999, { isPinned: true });

    assert.strictEqual(res.status, 404);
  });
});
