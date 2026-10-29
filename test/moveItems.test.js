// Run with: node --test
// The drag and drop editor on /applications and /bookmarks moves an item with
// PUT /:id { categoryId } and then PUT /0/reorder. These pin that contract.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const { join } = require('path');
const jwt = require('jsonwebtoken');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.PASSWORD = 'ci-test-password-5e1b';
process.env.SECRET = crypto.randomBytes(32).toString('hex');
// Names the database backup that connectDB takes before migrating
process.env.VERSION = '0.0.0';

// The database and config live in data/ relative to the working directory
const repoRoot = join(__dirname, '..');
const workDir = fs.mkdtempSync(join(os.tmpdir(), 'flame-move-test-'));

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

const put = (path, body, auth = true) => {
  const req = request(api).put(path);
  return (auth ? req.set('Authorization-Flame', `Bearer ${token}`) : req).send(
    body
  );
};

const namesIn = async (categoryId, key) => {
  const res = await request(api)
    .get('/api/categories')
    .set('Authorization-Flame', `Bearer ${token}`);

  assert.strictEqual(res.status, 200);
  const category = res.body.data.find((c) => c.id === categoryId);
  return category[key].map((item) => item.name);
};

test.describe('moving items between categories', () => {
  test('an app keeps its new category and position after a reload', async () => {
    const [media, tools] = await Category.bulkCreate([
      { name: 'Media', type: 'apps' },
      { name: 'Tools', type: 'apps' },
    ]);
    const [, sonarr] = await App.bulkCreate([
      { name: 'Plex', url: 'plex', categoryId: media.id, orderId: 1 },
      { name: 'Sonarr', url: 'sonarr', categoryId: media.id, orderId: 2 },
      { name: 'Grafana', url: 'grafana', categoryId: tools.id, orderId: 1 },
      { name: 'Portainer', url: 'portainer', categoryId: tools.id, orderId: 2 },
    ]);
    const [grafana, portainer] = await App.findAll({
      where: { categoryId: tools.id },
      order: [['orderId', 'ASC']],
    });

    let res = await put(`/api/apps/${sonarr.id}`, { categoryId: tools.id });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.categoryId, tools.id);

    res = await put('/api/apps/0/reorder', {
      apps: [
        { id: grafana.id, orderId: 1 },
        { id: sonarr.id, orderId: 2 },
        { id: portainer.id, orderId: 3 },
      ],
    });
    assert.strictEqual(res.status, 200);

    assert.deepStrictEqual(await namesIn(media.id, 'apps'), ['Plex']);
    assert.deepStrictEqual(await namesIn(tools.id, 'apps'), [
      'Grafana',
      'Sonarr',
      'Portainer',
    ]);
  });

  test('a bookmark can move into an empty category', async () => {
    const [docs, empty] = await Category.bulkCreate([
      { name: 'Docs', type: 'bookmarks' },
      { name: 'Later', type: 'bookmarks' },
    ]);
    const bookmark = await Bookmark.create({
      name: 'MDN',
      url: 'mdn',
      categoryId: docs.id,
    });

    let res = await put(`/api/bookmarks/${bookmark.id}`, {
      categoryId: empty.id,
    });
    assert.strictEqual(res.status, 200);

    res = await put('/api/bookmarks/0/reorder', {
      bookmarks: [{ id: bookmark.id, orderId: 1 }],
    });
    assert.strictEqual(res.status, 200);

    assert.deepStrictEqual(await namesIn(docs.id, 'bookmarks'), []);
    assert.deepStrictEqual(await namesIn(empty.id, 'bookmarks'), ['MDN']);
  });

  test('guests cannot move anything', async () => {
    const [from, to] = await Category.bulkCreate([
      { name: 'Guest', type: 'apps' },
      { name: 'Elsewhere', type: 'apps' },
    ]);
    const app = await App.create({
      name: 'Home',
      url: 'home',
      categoryId: from.id,
      orderId: 1,
    });

    for (const [path, body] of [
      [`/api/apps/${app.id}`, { categoryId: to.id }],
      ['/api/apps/0/reorder', { apps: [{ id: app.id, orderId: 5 }] }],
      ['/api/bookmarks/0/reorder', { bookmarks: [] }],
    ]) {
      const res = await put(path, body, false);
      assert.strictEqual(res.status, 401, path);
    }

    await app.reload();
    assert.strictEqual(app.categoryId, from.id);
    assert.strictEqual(app.orderId, 1);
  });
});
