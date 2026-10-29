// Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const http = require('http');
const { join } = require('path');
const {
  UPLOADS_DIR,
  findIconLinks,
  fetchIcon,
  storeIcon,
  fetchAndStoreIcon,
  clearIconCache,
} = require('../utils/favicon');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const ICO = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x10, 0x10]);
const EVIL_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)">' +
  '<script>alert(2)</script><circle cx="5" cy="5" r="4"/>' +
  '<a href="javascript:alert(3)"><rect width="1" height="1"/></a></svg>';

const createdFiles = new Set();

test.after(() => {
  for (const file of createdFiles) {
    fs.rmSync(join(UPLOADS_DIR, file), { force: true });
  }
});

/**
 * Serves `routes` ({ path: [contentType, body] | (req, res) => void }) and
 * counts requests per path
 */
const withSite = async (routes, fn) => {
  const hits = {};
  const server = http.createServer((req, res) => {
    hits[req.url] = (hits[req.url] || 0) + 1;
    const route = routes[req.url];

    if (typeof route === 'function') return route(req, res);
    if (!route) {
      res.statusCode = 404;
      return res.end('<html>not found</html>');
    }

    res.setHeader('Content-Type', route[0]);
    res.end(route[1]);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    await fn(`http://127.0.0.1:${server.address().port}`, hits);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
};

const LAN = { allowPrivate: true };

test('icon links are ranked: scalable, then sharp and small, then largest', () => {
  const html = `<!doctype html><html><head>
    <base href="/static/">
    <link rel="stylesheet" href="/style.css">
    <link rel="icon" href="16.png" sizes="16x16">
    <link rel="shortcut icon" href="/favicon.ico">
    <link rel="apple-touch-icon" href="touch.png">
    <link rel="icon" href="64.png" sizes="64x64">
    <link rel="icon" href="512.png" sizes="512x512">
    <link rel="mask-icon" href="mask.svg">
    <link rel="icon" type="image/svg+xml" href="logo.svg?v=2">
    <link rel="icon" href="64.png" sizes="64x64">
  </head></html>`;

  const links = findIconLinks(html, 'https://site.test/app/');

  assert.deepStrictEqual(
    links.map((link) => link.href),
    [
      'https://site.test/static/logo.svg?v=2',
      'https://site.test/static/64.png',
      'https://site.test/static/touch.png',
      'https://site.test/static/512.png',
      'https://site.test/favicon.ico',
      'https://site.test/static/16.png',
    ]
  );
});

test('a page without icon links falls back to /favicon.ico', async () => {
  await withSite(
    {
      '/app/': ['text/html', '<html><head><title>x</title></head></html>'],
      '/favicon.ico': ['image/x-icon', ICO],
    },
    async (base) => {
      const icon = await fetchIcon(`${base}/app/`, LAN);

      assert.strictEqual(icon.ext, 'ico');
      assert.deepStrictEqual(icon.data, ICO);
      assert.strictEqual(icon.source, `${base}/favicon.ico`);
    }
  );
});

test('pages behind a login still get their /favicon.ico', async () => {
  await withSite(
    {
      '/': (req, res) => {
        res.statusCode = 401;
        res.end('login required');
      },
      '/favicon.ico': ['image/x-icon', ICO],
    },
    async (base) => {
      assert.strictEqual((await fetchIcon(`${base}/`, LAN)).ext, 'ico');
    }
  );
});

test('candidates that are not images are skipped', async () => {
  await withSite(
    {
      '/': [
        'text/html',
        '<link rel="icon" href="/broken.svg"><link rel="icon" href="/fake.png" sizes="64x64"><link rel="icon" href="/real.png">',
      ],
      '/broken.svg': ['image/svg+xml', '<html><body>not svg</body></html>'],
      '/fake.png': ['image/png', '<html>error page</html>'],
      '/real.png': ['image/png', PNG],
    },
    async (base, hits) => {
      const icon = await fetchIcon(`${base}/`, LAN);

      assert.strictEqual(icon.ext, 'png');
      assert.strictEqual(icon.source, `${base}/real.png`);
      assert.strictEqual(hits['/fake.png'], 1);
      assert.strictEqual(hits['/favicon.ico'], undefined);
    }
  );
});

test('SVG icons are sanitized', async () => {
  await withSite(
    {
      '/': ['text/html', '<link rel="icon" href="/icon.svg">'],
      '/icon.svg': ['image/svg+xml', EVIL_SVG],
    },
    async (base) => {
      const icon = await fetchIcon(`${base}/`, LAN);
      const svg = icon.data.toString();

      assert.strictEqual(icon.ext, 'svg');
      assert.match(svg, /<circle/);
      assert.doesNotMatch(svg, /script|onload|javascript/i);
    }
  );
});

test('an image URL is used as is, and data: icons are decoded', async () => {
  await withSite(
    {
      '/logo.png': ['image/png', PNG],
      '/inline': [
        'text/html',
        `<link rel="icon" href="data:image/png;base64,${PNG.toString('base64')}">`,
      ],
    },
    async (base) => {
      const direct = await fetchIcon(`${base}/logo.png`, LAN);
      assert.deepStrictEqual(direct.data, PNG);

      const inline = await fetchIcon(`${base}/inline`, LAN);
      assert.deepStrictEqual(inline.data, PNG);
      assert.strictEqual(inline.source, `${base}/inline`);
    }
  );
});

test('oversized icons are rejected', async () => {
  const huge = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);

  await withSite(
    {
      '/': ['text/html', '<link rel="icon" href="/huge.png">'],
      '/huge.png': ['image/png', huge],
    },
    async (base) => {
      await assert.rejects(fetchIcon(`${base}/`, LAN), { code: 'NOT_FOUND' });
      await assert.rejects(fetchIcon(`${base}/huge.png`, LAN), { code: 'NOT_FOUND' });
    }
  );
});

test('LAN sites are blocked unless private hosts are allowed', async () => {
  await withSite({ '/favicon.ico': ['image/x-icon', ICO] }, async (base, hits) => {
    await assert.rejects(fetchIcon(`${base}/`), { code: 'BLOCKED' });
    assert.deepStrictEqual(hits, {});
  });
});

test('icon links go through the same address and scheme checks', async () => {
  await withSite(
    {
      '/': [
        'text/html',
        '<link rel="icon" href="http://0.0.0.0/a.png">' +
          '<link rel="icon" href="file:///etc/passwd">' +
          '<link rel="icon" href="javascript:alert(1)">',
      ],
    },
    async (base, hits) => {
      await assert.rejects(fetchIcon(`${base}/`, LAN), { code: 'NOT_FOUND' });
      assert.deepStrictEqual(hits, { '/': 1, '/favicon.ico': 1 });
    }
  );
});

test('stored icons are named by content and shared', async () => {
  const first = await storeIcon({ ext: 'png', data: PNG });
  const second = await storeIcon({ ext: 'png', data: PNG });
  createdFiles.add(first);

  assert.match(first, /^favicon-[0-9a-f]{32}\.png$/);
  assert.strictEqual(first, second);
  assert.deepStrictEqual(fs.readFileSync(join(UPLOADS_DIR, first)), PNG);
});

test('results are cached per URL unless refreshed', async () => {
  clearIconCache();

  await withSite({ '/favicon.ico': ['image/x-icon', ICO] }, async (base, hits) => {
    const url = `${base}/`;
    const icon = await fetchAndStoreIcon(url, LAN);
    createdFiles.add(icon);

    assert.match(icon, /^favicon-[0-9a-f]{32}\.ico$/);
    assert.strictEqual(await fetchAndStoreIcon(url, LAN), icon);
    assert.strictEqual(hits['/favicon.ico'], 1);

    assert.strictEqual(await fetchAndStoreIcon(url, { ...LAN, refresh: true }), icon);
    assert.strictEqual(hits['/favicon.ico'], 2);

    // A deleted file is fetched again
    fs.rmSync(join(UPLOADS_DIR, icon));
    assert.strictEqual(await fetchAndStoreIcon(url, LAN), icon);
    assert.strictEqual(hits['/favicon.ico'], 3);

    // The private-hosts setting is part of the cache key
    await assert.rejects(fetchAndStoreIcon(url), { code: 'BLOCKED' });
  });
});

test('failures are remembered briefly', async () => {
  clearIconCache();

  await withSite({}, async (base, hits) => {
    const url = `${base}/`;

    await assert.rejects(fetchAndStoreIcon(url, LAN), { code: 'NOT_FOUND' });
    await assert.rejects(fetchAndStoreIcon(url, LAN), { code: 'NOT_FOUND' });
    assert.strictEqual(hits['/favicon.ico'], 1);

    await assert.rejects(fetchAndStoreIcon(url, { ...LAN, refresh: true }), { code: 'NOT_FOUND' });
    assert.strictEqual(hits['/favicon.ico'], 2);
  });
});
