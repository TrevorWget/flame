// Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('node:http');
const os = require('os');
const { join } = require('path');
const jwt = require('jsonwebtoken');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.PASSWORD = 'ci-test-password-5a7c';
process.env.SECRET = crypto.randomBytes(32).toString('hex');
// Names the database backup that connectDB takes before migrating
process.env.VERSION = '0.0.0';

// The database and config live in data/ relative to the working directory
const repoRoot = join(__dirname, '..');
const workDir = fs.mkdtempSync(join(os.tmpdir(), 'flame-status-test-'));
const configPath = join(workDir, 'data/config.json');

fs.mkdirSync(join(workDir, 'data'));
process.chdir(workDir);

test.mock.method(console, 'log', () => {});

const { connectDB, sequelize } = require('../db');
const associateModels = require('../models/associateModels');
const Category = require('../models/Category');
const App = require('../models/App');
const api = require('../api');
const {
  runStatusChecks,
  getStatuses,
  checkHttp,
  containerStatus,
  containersByAppName,
} = require('../utils/statusChecks');
const { getPasswordFingerprint } = require('../utils/password');
const { getTokenVersion } = require('../utils/tokenVersion');

const listen = async (handler) => {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    host: `127.0.0.1:${server.address().port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
};

// Answers with the status code in the path, /hang never answers
const appServer = (req, res) => {
  if (req.url === '/hang') return;

  const code = Number(req.url.slice(1)) || 200;

  if (code === 302) {
    res.setHeader('Location', '/500');
  }

  res.statusCode = code;
  res.end('body that is never read');
};

const container = (name, State, Status) => ({
  Id: name,
  State,
  Status,
  Labels: { 'flame.type': 'application', 'flame.name': name },
});

let site;
let docker;
let dockerRequests = [];
let token;
let apps;

const writeConfig = (overrides) =>
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      ...require('../utils/init/initialConfig.json'),
      dockerApps: true,
      dockerHost: `tcp://${docker.host}`,
      statusCheckTimeout: 1,
      ...overrides,
    })
  );

test.before(async () => {
  site = await listen(appServer);
  docker = await listen((req, res) => {
    dockerRequests.push(new URL(req.url, 'http://docker'));
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify([
        container('Sonarr', 'running', 'Up 2 hours (healthy)'),
        container('Radarr', 'exited', 'Exited (0) 3 minutes ago'),
        container('Lidarr', 'running', 'Up 5 minutes (unhealthy)'),
      ])
    );
  });

  writeConfig({ statusChecks: true, statusCheckDocker: true });

  await connectDB();
  associateModels();

  token = jwt.sign(
    { app: 'flame', pwd: getPasswordFingerprint(), ver: getTokenVersion() },
    process.env.SECRET,
    { expiresIn: '1h', algorithm: 'HS256' }
  );

  const media = await Category.create({ name: 'Media', type: 'apps' });
  const hidden = await Category.create({
    name: 'Hidden',
    type: 'apps',
    isPublic: 0,
  });

  const url = (path) => `http://${site.host}${path}`;
  const created = await App.bulkCreate([
    { name: 'Up', url: url('/200'), categoryId: media.id },
    { name: 'Redirect', url: url('/302'), categoryId: media.id },
    { name: 'Login', url: url('/401'), categoryId: media.id },
    { name: 'Broken', url: url('/503'), categoryId: media.id },
    // Scheme-less, like the app form allows
    { name: 'NoScheme', url: `${site.host}/204`, categoryId: media.id },
    {
      name: 'CustomUrl',
      url: url('/503'),
      statusUrl: url('/200'),
      categoryId: media.id,
    },
    { name: 'OptedOut', url: url('/200'), statusCheck: false, categoryId: media.id },
    { name: 'Ssh', url: 'ssh://nas.local', categoryId: media.id },
    { name: 'Private', url: url('/200'), isPublic: 0, categoryId: media.id },
    { name: 'InHidden', url: url('/200'), categoryId: hidden.id },
    { name: 'Sonarr', url: url('/503'), source: 'docker', categoryId: media.id },
    { name: 'Radarr', url: url('/200'), source: 'docker', categoryId: media.id },
    { name: 'Lidarr', url: url('/200'), source: 'docker', categoryId: media.id },
    { name: 'Gone', url: url('/200'), source: 'docker', categoryId: media.id },
    {
      name: 'DockerCustomUrl',
      url: url('/200'),
      statusUrl: url('/503'),
      source: 'docker',
      categoryId: media.id,
    },
  ]);

  apps = Object.fromEntries(created.map((app) => [app.name, app.id]));
});

test.after(async () => {
  writeConfig({ statusChecks: false });
  await runStatusChecks();
  await sequelize.close();
  await site.close();
  await docker.close();
  process.chdir(repoRoot);
  fs.rmSync(workDir, { recursive: true, force: true });
});

const getStatus = (asAdmin) => {
  const req = request(api).get('/api/apps/status');

  return asAdmin ? req.set('Authorization-Flame', `Bearer ${token}`) : req;
};

const summary = (statuses) =>
  Object.fromEntries(
    Object.entries(apps)
      .filter(([, id]) => id in statuses)
      .map(([name, id]) => [name, `${statuses[id].status}: ${statuses[id].detail}`])
  );

test.describe('HTTP checks', () => {
  test('any answer below 500 is up, redirects are not followed', async () => {
    const url = (path) => `http://${site.host}${path}`;

    assert.deepStrictEqual(await checkHttp(url('/200'), 1), {
      status: 'up',
      detail: 'HTTP 200',
    });
    assert.deepStrictEqual(await checkHttp(url('/302'), 1), {
      status: 'up',
      detail: 'HTTP 302',
    });
    assert.deepStrictEqual(await checkHttp(url('/404'), 1), {
      status: 'up',
      detail: 'HTTP 404',
    });
    assert.deepStrictEqual(await checkHttp(url('/502'), 1), {
      status: 'down',
      detail: 'HTTP 502',
    });
  });

  test('timeouts and refused connections are down, without the error message', async () => {
    const started = Date.now();
    assert.deepStrictEqual(await checkHttp(`http://${site.host}/hang`, 1), {
      status: 'down',
      detail: 'Timed out after 1 s',
    });
    assert.ok(Date.now() - started < 3000);

    const closed = await listen(() => {});
    await closed.close();
    assert.deepStrictEqual(await checkHttp(`http://${closed.host}/`, 1), {
      status: 'down',
      detail: 'Connection refused',
    });
  });
});

test.describe('container states', () => {
  test('running and not unhealthy is up', () => {
    assert.strictEqual(containerStatus(container('a', 'running', 'Up 1 hour')).status, 'up');
    assert.strictEqual(
      containerStatus(container('a', 'running', 'Up 1 hour (health: starting)')).status,
      'up'
    );
    assert.deepStrictEqual(containerStatus(container('a', 'running', 'Up (unhealthy)')), {
      status: 'down',
      detail: 'Container unhealthy',
    });
    assert.deepStrictEqual(containerStatus(container('a', 'paused', 'Up (Paused)')), {
      status: 'down',
      detail: 'Container paused',
    });
    assert.deepStrictEqual(containerStatus(undefined), {
      status: 'down',
      detail: 'Container not found',
    });
  });

  test('apps are matched by flame.name and running containers win', () => {
    const multi = {
      State: 'running',
      Labels: { 'flame.name': 'Plex;Tautulli' },
    };
    const stopped = { State: 'exited', Labels: { 'flame.name': 'Plex' } };
    const byName = containersByAppName([
      stopped,
      multi,
      { State: 'running', Labels: {} },
      { State: 'running' },
    ]);

    assert.strictEqual(byName.get('Plex'), multi);
    assert.strictEqual(byName.get('Tautulli'), multi);
    assert.strictEqual(byName.size, 2);
  });
});

test.describe('GET /api/apps/status', () => {
  test('admins get every checked app', async () => {
    await runStatusChecks();

    const res = await getStatus(true);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.enabled, true);
    assert.deepStrictEqual(summary(res.body.data.statuses), {
      Up: 'up: HTTP 200',
      Redirect: 'up: HTTP 302',
      Login: 'up: HTTP 401',
      Broken: 'down: HTTP 503',
      NoScheme: 'up: HTTP 204',
      CustomUrl: 'up: HTTP 200',
      Private: 'up: HTTP 200',
      InHidden: 'up: HTTP 200',
      Sonarr: 'up: Container running (healthy)',
      Radarr: 'down: Container exited',
      Lidarr: 'down: Container unhealthy',
      Gone: 'down: Container not found',
      DockerCustomUrl: 'down: HTTP 503',
    });

    // Stopped containers are only visible with all=1
    assert.strictEqual(dockerRequests.at(-1).pathname, '/containers/json');
    assert.strictEqual(dockerRequests.at(-1).searchParams.get('all'), '1');
  });

  test('guests only get public apps of public categories', async () => {
    const res = await getStatus(false);
    const names = Object.keys(summary(res.body.data.statuses));

    assert.ok(names.includes('Up'));
    assert.ok(!names.includes('Private'));
    assert.ok(!names.includes('InHidden'));
  });

  test('unchanged results revalidate to a 304', async () => {
    const first = await getStatus(false);
    assert.match(first.headers['cache-control'], /no-cache/);
    assert.ok(first.headers.etag);

    await runStatusChecks();

    const second = await getStatus(false).set('If-None-Match', first.headers.etag);
    assert.strictEqual(second.status, 304);
  });

  test('a status change resets since, an unchanged one keeps it', async () => {
    const before = new Map(getStatuses());

    await App.update(
      { url: `http://${site.host}/500` },
      { where: { id: apps.Up } }
    );
    await runStatusChecks();

    const after = getStatuses();
    assert.strictEqual(after.get(apps.Up).status, 'down');
    assert.notStrictEqual(after.get(apps.Up).since, before.get(apps.Up).since);
    assert.strictEqual(after.get(apps.Broken).since, before.get(apps.Broken).since);
  });

  test('an unreachable Docker API leaves Docker apps unknown', async () => {
    writeConfig({
      statusChecks: true,
      statusCheckDocker: true,
      dockerHost: 'tcp://127.0.0.1:1',
    });
    await runStatusChecks();

    const names = Object.keys(summary((await getStatus(true)).body.data.statuses));
    assert.ok(names.includes('Up'));
    assert.ok(names.includes('DockerCustomUrl'));
    for (const name of ['Sonarr', 'Radarr', 'Lidarr', 'Gone']) {
      assert.ok(!names.includes(name), name);
    }
  });

  test('without container states Docker apps get an HTTP check', async () => {
    writeConfig({ statusChecks: true, statusCheckDocker: false });
    await runStatusChecks();

    const statuses = summary((await getStatus(true)).body.data.statuses);
    assert.strictEqual(statuses.Sonarr, 'down: HTTP 503');
    assert.strictEqual(statuses.Radarr, 'up: HTTP 200');
  });

  test('disabling the checks clears the results', async () => {
    writeConfig({ statusChecks: false });
    await runStatusChecks();

    const res = await getStatus(true);
    assert.deepStrictEqual(res.body.data, { enabled: false, statuses: {} });
    assert.strictEqual(getStatuses().size, 0);
  });
});

test.describe('app fields', () => {
  const auth = (req) => req.set('Authorization-Flame', `Bearer ${token}`);

  test('status check settings are validated and stored', async () => {
    const id = apps.Login;

    const custom = await auth(request(api).put(`/api/apps/${id}`)).send({
      statusCheck: false,
      statusUrl: ' nas.local:5000/health ',
    });
    assert.strictEqual(custom.status, 200);
    assert.strictEqual(custom.body.data.statusCheck, false);
    assert.strictEqual(custom.body.data.statusUrl, 'nas.local:5000/health');

    const cleared = await auth(request(api).put(`/api/apps/${id}`))
      .field('statusCheck', '1')
      .field('statusUrl', '');
    assert.strictEqual(cleared.status, 200);
    assert.strictEqual(cleared.body.data.statusCheck, true);
    assert.strictEqual(cleared.body.data.statusUrl, null);

    for (const statusUrl of ['ssh://nas.local', 'javascript:alert(1)']) {
      const res = await auth(request(api).put(`/api/apps/${id}`)).send({ statusUrl });
      assert.strictEqual(res.status, 400);
      assert.match(res.body.error, /^statusUrl: /);
    }
  });

  test('new apps are checked by default', async () => {
    const res = await auth(request(api).post('/api/apps')).send({
      name: 'Fresh',
      url: 'fresh.local',
      categoryId: (await Category.findOne()).id,
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.data.statusCheck, true);
    assert.strictEqual(res.body.data.statusUrl, null);
  });
});
