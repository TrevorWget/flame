// Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const zlib = require('zlib');
const {
  classifyAddress,
  resolveTarget,
  safeFetch,
} = require('../utils/safeFetch');

const withServer = async (handler, fn) => {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    await fn(server.address().port);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
};

const rejectsWith = (promise, code) =>
  assert.rejects(promise, (err) => {
    assert.strictEqual(err.name, 'FetchError', err.stack);
    assert.strictEqual(err.code, code, err.message);
    return true;
  });

test('addresses are classified as public, private or forbidden', () => {
  const cases = {
    public: [
      '1.1.1.1',
      '8.8.8.8',
      '172.32.0.1',
      '100.128.0.1',
      '2606:4700:4700::1111',
      '[2a00:1450:4001::200e]',
      '::ffff:8.8.8.8',
      '2002:0808:0808::1',
    ],
    private: [
      '127.0.0.1',
      '127.255.255.254',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '10.0.0.2',
      '169.254.169.254',
      '100.64.0.1',
      '198.18.0.1',
      '::1',
      'fe80::1%eth0',
      'fd00::1',
      'fc12:3456::1',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '::ffff:10.0.0.2',
      '::127.0.0.1',
      '64:ff9b::a9fe:a9fe',
      '2002:0a00:0002::1',
    ],
    forbidden: [
      '0.0.0.0',
      '0.1.2.3',
      '224.0.0.1',
      '239.255.255.250',
      '255.255.255.255',
      '240.0.0.1',
      '::',
      'ff02::1',
      '::ffff:0.0.0.0',
      'localhost',
      'not-an-ip',
      '',
    ],
  };

  for (const [expected, addresses] of Object.entries(cases)) {
    for (const address of addresses) {
      assert.strictEqual(classifyAddress(address), expected, address);
    }
  }
});

test('hosts resolving only to private addresses need the private setting', async () => {
  const lookup = async () => [
    { address: '10.0.0.2', family: 4 },
    { address: 'fe80::1', family: 6 },
  ];

  await rejectsWith(
    resolveTarget('nas.local', { allowPrivate: false, lookup }),
    'BLOCKED'
  );
  await assert.rejects(
    resolveTarget('nas.local', { allowPrivate: false, lookup }),
    /private network address/
  );

  assert.deepStrictEqual(
    await resolveTarget('nas.local', { allowPrivate: true, lookup }),
    { address: '10.0.0.2', family: 4, isPrivate: true }
  );
});

test('forbidden addresses are blocked even with private hosts allowed', async () => {
  const lookup = async () => [
    { address: '0.0.0.0', family: 4 },
    { address: '224.0.0.251', family: 4 },
  ];

  await rejectsWith(
    resolveTarget('weird.test', { allowPrivate: true, lookup }),
    'BLOCKED'
  );
  await rejectsWith(
    resolveTarget('[::]', { allowPrivate: true }),
    'BLOCKED'
  );
});

test('only allowed addresses of a host are used', async () => {
  const lookup = async () => [
    { address: '10.0.0.5', family: 4 },
    { address: '93.184.215.14', family: 4 },
  ];

  assert.deepStrictEqual(
    await resolveTarget('mixed.test', { allowPrivate: false, lookup }),
    { address: '93.184.215.14', family: 4, isPrivate: false }
  );
});

test('unresolvable hosts fail with a DNS error', async () => {
  const lookup = async () => {
    throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
  };

  await rejectsWith(
    resolveTarget('missing.test', { allowPrivate: true, lookup }),
    'DNS'
  );
});

test('loopback URLs are blocked by default', async () => {
  let hits = 0;

  await withServer(
    (req, res) => {
      hits++;
      res.end('secret');
    },
    async (port) => {
      await rejectsWith(safeFetch(`http://127.0.0.1:${port}/`), 'BLOCKED');
      await rejectsWith(safeFetch(`http://localhost:${port}/`), 'BLOCKED');
      await rejectsWith(safeFetch(`http://[::ffff:127.0.0.1]:${port}/`), 'BLOCKED');
    }
  );

  assert.strictEqual(hits, 0);
});

test('only http and https URLs without credentials are fetched', async () => {
  for (const url of [
    'file:///etc/passwd',
    'ftp://example.com/x',
    'gopher://127.0.0.1:6379/_INFO',
    'javascript:alert(1)',
  ]) {
    await rejectsWith(safeFetch(url, { allowPrivate: true }), 'SCHEME');
  }

  await rejectsWith(safeFetch('http://user:pw@example.com/'), 'URL');
  await rejectsWith(safeFetch('not a url'), 'URL');
});

test('the connection is pinned to the checked address', async () => {
  let host;
  const lookup = async () => [{ address: '127.0.0.1', family: 4 }];

  await withServer(
    (req, res) => {
      host = req.headers.host;
      res.setHeader('Content-Type', 'text/plain');
      res.end('pinned');
    },
    async (port) => {
      const res = await safeFetch(`http://rebind.test:${port}/`, {
        allowPrivate: true,
        lookup,
      });

      assert.strictEqual(res.body.toString(), 'pinned');
      assert.strictEqual(res.contentType, 'text/plain');
      assert.strictEqual(host, `rebind.test:${port}`);

      await rejectsWith(
        safeFetch(`http://rebind.test:${port}/`, { lookup }),
        'BLOCKED'
      );
    }
  );
});

test('every redirect is checked again', async () => {
  await withServer(
    (req, res) => {
      const port = req.socket.localPort;
      const redirects = {
        '/to-ok': `http://127.0.0.1:${port}/ok`,
        '/to-forbidden': `http://0.0.0.0:${port}/ok`,
        '/to-file': 'file:///etc/passwd',
        '/loop': '/loop',
      };

      if (redirects[req.url]) {
        res.writeHead(302, { Location: redirects[req.url] });
        return res.end();
      }

      res.end(req.url === '/ok' ? 'ok' : 'unexpected');
    },
    async (port) => {
      const base = `http://127.0.0.1:${port}`;
      const ok = await safeFetch(`${base}/to-ok`, { allowPrivate: true });

      assert.strictEqual(ok.body.toString(), 'ok');
      assert.strictEqual(ok.url, `${base}/ok`);

      await rejectsWith(safeFetch(`${base}/to-forbidden`, { allowPrivate: true }), 'BLOCKED');
      await rejectsWith(safeFetch(`${base}/to-file`, { allowPrivate: true }), 'SCHEME');
      await rejectsWith(safeFetch(`${base}/loop`, { allowPrivate: true }), 'REDIRECTS');
    }
  );
});

test('responses are size limited, including after decompression', async () => {
  const big = Buffer.alloc(64 * 1024, 'a');

  await withServer(
    (req, res) => {
      if (req.url === '/declared') {
        res.setHeader('Content-Length', big.length);
        return res.end(big);
      }

      if (req.url === '/chunked') {
        res.write(big.subarray(0, 32 * 1024));
        return res.end(big.subarray(32 * 1024));
      }

      if (req.url === '/gzip') {
        res.setHeader('Content-Encoding', 'gzip');
        return res.end(zlib.gzipSync(Buffer.alloc(10 * 1024 * 1024)));
      }

      if (req.url === '/small-gzip') {
        res.setHeader('Content-Encoding', 'gzip');
        return res.end(zlib.gzipSync('hello'));
      }

      res.statusCode = 404;
      res.end();
    },
    async (port) => {
      const base = `http://127.0.0.1:${port}`;
      const options = { allowPrivate: true, maxBytes: 16 * 1024 };

      await rejectsWith(safeFetch(`${base}/declared`, options), 'TOO_LARGE');
      await rejectsWith(safeFetch(`${base}/chunked`, options), 'TOO_LARGE');
      await rejectsWith(safeFetch(`${base}/gzip`, options), 'TOO_LARGE');

      const truncated = await safeFetch(`${base}/chunked`, { ...options, truncate: true });
      assert.strictEqual(truncated.body.length, 16 * 1024);
      assert.strictEqual(truncated.truncated, true);

      const small = await safeFetch(`${base}/small-gzip`, options);
      assert.strictEqual(small.body.toString(), 'hello');
      assert.strictEqual(small.truncated, false);

      await rejectsWith(safeFetch(`${base}/missing`, options), 'HTTP');
    }
  );
});

test('slow servers time out', async () => {
  await withServer(
    (req, res) => {
      if (req.url === '/slow-body') {
        res.write('partial');
      }
      // Never finishes
    },
    async (port) => {
      const base = `http://127.0.0.1:${port}`;
      const options = { allowPrivate: true, timeoutMs: 200 };

      await rejectsWith(safeFetch(`${base}/silent`, options), 'TIMEOUT');
      await rejectsWith(safeFetch(`${base}/slow-body`, options), 'TIMEOUT');
    }
  );
});
