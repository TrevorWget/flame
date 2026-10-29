// Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const {
  listRunningContainers,
  streamContainerEvents,
} = require('../controllers/apps/docker/dockerApi');

const withServer = async (handler, fn) => {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    return await fn(`127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
};

test('lists running containers with a valid filters query', async () => {
  let requested;

  const containers = await withServer(
    (req, res) => {
      requested = new URL(req.url, 'http://docker');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify([{ Id: 'abc', Labels: {} }]));
    },
    (host) => listRunningContainers(host)
  );

  assert.strictEqual(requested.pathname, '/containers/json');
  assert.deepStrictEqual(JSON.parse(requested.searchParams.get('filters')), {
    status: ['running'],
  });
  assert.deepStrictEqual(containers, [{ Id: 'abc', Labels: {} }]);
});

test('streams container lifecycle events until aborted', async () => {
  let requested;

  await withServer(
    (req, res) => {
      requested = new URL(req.url, 'http://docker');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write(JSON.stringify({ Type: 'container', Action: 'start' }) + '\n');
    },
    async (host) => {
      const controller = new AbortController();
      const stream = await streamContainerEvents(host, controller.signal);
      const chunk = await new Promise((resolve) => stream.once('data', resolve));

      assert.match(chunk.toString(), /"Action":"start"/);

      const closed = new Promise((resolve) => stream.once('close', resolve));
      stream.on('error', () => {});
      controller.abort();
      await closed;
    }
  );

  assert.strictEqual(requested.pathname, '/events');
  const filters = JSON.parse(requested.searchParams.get('filters'));
  assert.deepStrictEqual(filters.type, ['container']);
  assert.ok(filters.event.includes('start') && filters.event.includes('die'));
});
