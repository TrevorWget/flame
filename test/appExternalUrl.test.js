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
process.env.PASSWORD = 'ci-external-url-password-5d2a';
process.env.SECRET = crypto.randomBytes(32).toString('hex');
// Names the database backup that connectDB takes before migrating
process.env.VERSION = '0.0.0';

const repoRoot = join(__dirname, '..');
const workDir = fs.mkdtempSync(join(os.tmpdir(), 'flame-external-url-test-'));

fs.mkdirSync(join(workDir, 'data'));
fs.writeFileSync(
  join(workDir, 'data/config.json'),
  JSON.stringify(require('../utils/init/initialConfig.json'))
);
process.chdir(workDir);

test.mock.method(console, 'log', () => {});

// useDocker picks up listRunningContainers when it is required
const dockerApi = require('../controllers/apps/docker/dockerApi');
let containers = [];
test.mock.method(dockerApi, 'listRunningContainers', async () => containers);

const { connectDB, sequelize } = require('../db');
const associateModels = require('../models/associateModels');
const App = require('../models/App');
const api = require('../api');
const useDocker = require('../controllers/apps/docker/useDocker');
const { parseIngressApps } = require('../controllers/apps/docker/kubernetesAnnotations');
const externalUrlMigration = require('../db/migrations/13_app-external-url');
const { getPasswordFingerprint } = require('../utils/password');
const { getTokenVersion } = require('../utils/tokenVersion');

// Migrations that ran before this feature
const EARLIER_MIGRATIONS = /^0[0-7]_.+\.js$/;

const rows = (sql) => sequelize.query(sql, { type: QueryTypes.SELECT });

const LEGACY_COLUMNS =
  'id, name, url, categoryId, icon, isPinned, orderId, isPublic, description, source, createdAt, updatedAt';

let before;
let token;
let categoryId;

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
  await sequelize.query(
    `INSERT INTO categories (name, type, isPinned, orderId, isPublic, createdAt, updatedAt)
     VALUES ('Media', 'apps', 1, 1, 1, :now, :now)`,
    { replacements: { now } }
  );
  [{ id: categoryId }] = await rows("SELECT id FROM categories WHERE name = 'Media'");

  for (const [name, url, source] of [
    ['Jellyfin', 'http://192.0.2.10:8096', null],
    ['Sonarr', 'sonarr.lan:8989', 'docker'],
  ]) {
    await sequelize.query(
      `INSERT INTO apps (name, url, categoryId, icon, isPinned, isPublic, description, source, createdAt, updatedAt)
       VALUES (:name, :url, :categoryId, 'docker', 1, 1, '', :source, :now, :now)`,
      { replacements: { name, url, categoryId, source, now } }
    );
  }

  before = await rows(`SELECT ${LEGACY_COLUMNS} FROM apps ORDER BY id`);

  await connectDB();
  associateModels();

  token = jwt.sign(
    { app: 'flame', pwd: getPasswordFingerprint(), ver: getTokenVersion() },
    process.env.SECRET,
    { expiresIn: '1h', algorithm: 'HS256' }
  );
});

test.after(async () => {
  await require('node-schedule').gracefulShutdown();
  await sequelize.close();
  process.chdir(repoRoot);
  fs.rmSync(workDir, { recursive: true, force: true });
});

const authed = (method, path) =>
  request(api)[method](path).set('Authorization-Flame', `Bearer ${token}`);

const assertRejected = (res, pattern) => {
  assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  assert.match(res.body.error, pattern);
};

test.describe('migration 13_app-external-url', () => {
  test('keeps every existing app and opens its current URL', async () => {
    assert.deepStrictEqual(
      await rows(`SELECT ${LEGACY_COLUMNS} FROM apps ORDER BY id`),
      before
    );
    assert.deepStrictEqual(
      await rows('SELECT name, url, externalUrl, preferredUrl FROM apps ORDER BY id'),
      [
        { name: 'Jellyfin', url: 'http://192.0.2.10:8096', externalUrl: '', preferredUrl: 'internal' },
        { name: 'Sonarr', url: 'sonarr.lan:8989', externalUrl: '', preferredUrl: 'internal' },
      ]
    );
  });

  test('can be reverted and applied again', async () => {
    const query = sequelize.getQueryInterface();

    await externalUrlMigration.down(query);
    assert.ok(!('externalUrl' in (await query.describeTable('apps'))));
    assert.deepStrictEqual(
      await rows(`SELECT ${LEGACY_COLUMNS} FROM apps ORDER BY id`),
      before
    );

    await externalUrlMigration.up(query);
    const columns = await query.describeTable('apps');
    assert.strictEqual(columns.externalUrl.allowNull, false);
    assert.strictEqual(columns.preferredUrl.allowNull, false);
  });

  test('the API returns the new fields for existing apps', async () => {
    const res = await authed('get', '/api/apps');
    assert.strictEqual(res.status, 200);

    const jellyfin = res.body.data.find((a) => a.name === 'Jellyfin');
    assert.strictEqual(jellyfin.url, 'http://192.0.2.10:8096');
    assert.strictEqual(jellyfin.externalUrl, '');
    assert.strictEqual(jellyfin.preferredUrl, 'internal');
  });
});

test.describe('external URL validation', () => {
  test('create stores both URLs and defaults to the internal one', async () => {
    const plain = await authed('post', '/api/apps').send({
      name: 'Plain',
      url: 'plain.lan',
      categoryId,
    });
    assert.strictEqual(plain.status, 201, JSON.stringify(plain.body));
    assert.strictEqual(plain.body.data.externalUrl, '');
    assert.strictEqual(plain.body.data.preferredUrl, 'internal');

    const json = await authed('post', '/api/apps').send({
      name: 'Radarr',
      url: 'http://192.0.2.10:7878',
      externalUrl: 'https://radarr.example.com',
      preferredUrl: 'external',
      categoryId,
    });
    assert.strictEqual(json.status, 201, JSON.stringify(json.body));
    assert.strictEqual(json.body.data.url, 'http://192.0.2.10:7878');
    assert.strictEqual(json.body.data.externalUrl, 'https://radarr.example.com');
    assert.strictEqual(json.body.data.preferredUrl, 'external');

    // The form sends multipart when an icon is uploaded
    const multipart = await authed('post', '/api/apps')
      .field('name', 'Lidarr')
      .field('url', 'lidarr.lan')
      .field('externalUrl', '')
      .field('preferredUrl', 'external')
      .field('categoryId', `${categoryId}`);
    assert.strictEqual(multipart.status, 201, JSON.stringify(multipart.body));
    assert.strictEqual(multipart.body.data.externalUrl, '');
    assert.strictEqual(multipart.body.data.preferredUrl, 'external');
  });

  test('the external URL goes through the URL scheme allow-list', async () => {
    const base = { name: 'x', url: 'https://x.lan', categoryId };

    for (const externalUrl of [
      'javascript:alert(1)',
      'data:text/html,x',
      '   ',
      'obsidian://open',
      `https://${'a'.repeat(2048)}.com`,
    ]) {
      assertRejected(
        await authed('post', '/api/apps').send({ ...base, externalUrl }),
        /^externalUrl: /
      );
    }

    assertRejected(
      await authed('post', '/api/apps').send({
        ...base,
        externalUrl: 'javascript:alert(1)',
      }),
      /^externalUrl: URL is invalid or its scheme is not allowed$/
    );
    assertRejected(
      await authed('post', '/api/apps').send({ ...base, externalUrl: 42 }),
      /^externalUrl: /
    );
    assertRejected(
      await authed('post', '/api/apps').send({ ...base, preferredUrl: 'both' }),
      /^preferredUrl: /
    );
  });

  test('update switches the URL and clears the external one', async () => {
    const app = await App.findOne({ where: { name: 'Jellyfin' } });

    const switched = await authed('put', `/api/apps/${app.id}`).send({
      ...app.toJSON(),
      externalUrl: 'https://jellyfin.example.com',
      preferredUrl: 'external',
    });
    assert.strictEqual(switched.status, 200, JSON.stringify(switched.body));
    assert.strictEqual(switched.body.data.url, 'http://192.0.2.10:8096');
    assert.strictEqual(switched.body.data.externalUrl, 'https://jellyfin.example.com');
    assert.strictEqual(switched.body.data.preferredUrl, 'external');

    const cleared = await authed('put', `/api/apps/${app.id}`).send({
      externalUrl: '',
    });
    assert.strictEqual(cleared.status, 200);
    assert.strictEqual(cleared.body.data.externalUrl, '');
    assert.strictEqual(cleared.body.data.preferredUrl, 'external');

    assertRejected(
      await authed('put', `/api/apps/${app.id}`).send({
        externalUrl: 'vbscript:msgbox(1)',
      }),
      /^externalUrl: /
    );
  });
});

test.describe('integration labels', () => {
  const container = (labels) => ({
    Labels: { 'flame.type': 'app', ...labels },
  });

  test('Docker sets the external URL from flame.url.external', async () => {
    containers = [
      container({
        'flame.name': 'Bazarr;Prowlarr',
        'flame.url': 'http://bazarr.lan;http://prowlarr.lan',
        'flame.url.external': 'https://bazarr.example.com;https://prowlarr.example.com',
      }),
      container({
        'flame.name': 'Unsafe',
        'flame.url': 'http://unsafe.lan',
        'flame.url.external': 'javascript:alert(1)',
      }),
    ];
    await useDocker();

    const urls = async (name) => {
      const app = await App.findOne({ where: { name } });
      return [app.url, app.externalUrl, app.preferredUrl];
    };

    assert.deepStrictEqual(await urls('Bazarr'), [
      'http://bazarr.lan',
      'https://bazarr.example.com',
      'internal',
    ]);
    assert.deepStrictEqual(await urls('Prowlarr'), [
      'http://prowlarr.lan',
      'https://prowlarr.example.com',
      'internal',
    ]);
    // An unsafe external URL is dropped, the app itself is kept
    assert.deepStrictEqual(await urls('Unsafe'), ['http://unsafe.lan', '', 'internal']);
  });

  test('without the label, the external URL and choice set in the UI are kept', async () => {
    const sonarr = await App.findOne({ where: { name: 'Sonarr' } });
    await sonarr.update({
      externalUrl: 'https://sonarr.example.com',
      preferredUrl: 'external',
    });

    containers = [
      container({ 'flame.name': 'Sonarr', 'flame.url': 'http://sonarr.lan:8989' }),
    ];
    await useDocker();

    await sonarr.reload();
    assert.strictEqual(sonarr.url, 'http://sonarr.lan:8989');
    assert.strictEqual(sonarr.externalUrl, 'https://sonarr.example.com');
    assert.strictEqual(sonarr.preferredUrl, 'external');
  });

  test('Kubernetes reads the url.external annotation', () => {
    const apps = parseIngressApps([
      {
        metadata: {
          annotations: {
            'flame.pawelmalak/type': 'app',
            'flame.pawelmalak/name': 'Grafana;Prometheus',
            'flame.pawelmalak/url': 'http://grafana.lan;http://prometheus.lan',
            'flame.pawelmalak/url.external': 'https://grafana.example.com',
          },
        },
      },
      {
        metadata: {
          annotations: {
            'flame.pawelmalak/type': 'app',
            'flame.pawelmalak/name': 'Loki',
            'flame.pawelmalak/url': 'http://loki.lan',
          },
        },
      },
    ]);

    assert.deepStrictEqual(
      apps.map(({ name, url, externalUrl }) => ({ name, url, externalUrl })),
      [
        { name: 'Grafana', url: 'http://grafana.lan', externalUrl: 'https://grafana.example.com' },
        { name: 'Prometheus', url: 'http://prometheus.lan', externalUrl: 'https://grafana.example.com' },
        { name: 'Loki', url: 'http://loki.lan', externalUrl: undefined },
      ]
    );
    assert.ok(!('externalUrl' in apps[2]));
  });
});
