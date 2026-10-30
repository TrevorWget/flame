// Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const { join } = require('path');

test.mock.method(console, 'log', () => {});

const {
  INDEX_TTL_MS,
  ICON_TTL_MS,
  normalizeIndex,
  getIndex,
  searchIcons,
  suggestIcon,
  defaultFormat,
  iconFilename,
  storeSelfhstIcon,
  getPreview,
  configureSelfhst,
} = require('../utils/selfhst');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9, 9]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x10, 0, 0, 0]),
  Buffer.from('WEBPVP8 '),
  Buffer.from([1, 2, 3, 4]),
]);
const svg = (fill) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)">` +
  `<script>alert(2)</script><circle cx="5" cy="5" r="4" fill="${fill}"/></svg>`;

const entry = (Name, Reference, flags = {}) => ({
  Name,
  Reference,
  SVG: 'Yes',
  PNG: 'Yes',
  WebP: 'Yes',
  Light: 'Yes',
  Dark: 'Yes',
  Category: 'Self-Hosted',
  Tags: '',
  CreatedAt: '2024-08-16 00:27:23+00:00',
  ...flags,
});

const INDEX = [
  entry('Jellyfin', 'jellyfin', { Tags: 'Streaming' }),
  entry('Jellyseerr', 'jellyseerr'),
  entry('Home Assistant', 'home-assistant'),
  entry('Plex', 'plex'),
  entry('Plexamp', 'plexamp'),
  entry('Tautulli', 'tautulli', { Tags: 'Plex, Monitoring' }),
  entry('Ghost', 'ghost', { SVG: 'No', Dark: 'No' }),
  entry('Steam', 'steam', { SVG: 'No', Light: 'No', Dark: 'No' }),
];

const workDir = fs.mkdtempSync(join(os.tmpdir(), 'flame-selfhst-test-'));
const uploadsDir = join(workDir, 'uploads');
const indexFile = join(workDir, 'selfhst-index.json');

/**
 * Stands in for jsDelivr: serves /index.json and /<format>/<file>, counting
 * requests per path. `routes` overrides single paths.
 */
const createCdn = async (routes = {}) => {
  const hits = {};
  const server = http.createServer((req, res) => {
    hits[req.url] = (hits[req.url] || 0) + 1;

    const route = routes[req.url];
    if (typeof route === 'function') return route(req, res);

    if (req.url === '/index.json') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(INDEX));
    }

    const match = /^\/(svg|png|webp)\/([a-z0-9-]+?)(-light|-dark)?\.\1$/.exec(req.url);
    if (!match || !INDEX.some((icon) => icon.Reference === match[2])) {
      res.statusCode = 404;
      return res.end('Not found');
    }

    const [, format, , variant] = match;
    res.setHeader('Content-Type', `image/${format}`);
    if (format === 'svg') return res.end(svg(variant === '-light' ? '#fff' : '#123'));
    res.end(format === 'png' ? PNG : WEBP);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    base: `http://127.0.0.1:${server.address().port}`,
    hits,
    close: () => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    },
  };
};

// Nothing listens here, like being offline
const OFFLINE = 'http://127.0.0.1:1';

let cdn;

const useCdn = (base = cdn.base, overrides = {}) =>
  configureSelfhst({
    indexSources: [`${base}/index.json`],
    cdnBase: base,
    indexFile,
    uploadsDir,
    allowPrivate: true,
    ...overrides,
  });

const reset = () => {
  fs.rmSync(indexFile, { force: true });
  fs.rmSync(uploadsDir, { recursive: true, force: true });
  for (const key of Object.keys(cdn.hits)) delete cdn.hits[key];
};

const waitFor = async (check) => {
  for (let i = 0; i < 100 && !(await check()); i++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

test.before(async () => {
  cdn = await createCdn();
});

test.after(async () => {
  configureSelfhst();
  await cdn.close();
  fs.rmSync(workDir, { recursive: true, force: true });
});

test.beforeEach(() => reset());

test.describe('index', () => {
  test('entries are validated and normalized', () => {
    const icons = normalizeIndex([
      entry('Jellyfin', 'jellyfin', { Tags: 'Streaming, Media ,' }),
      entry('Duplicate', 'jellyfin'),
      entry('Traversal', '../etc/passwd'),
      entry('Spaces', 'a b'),
      entry('Upper', 'Upper'),
      entry('Underscore', 'a_b'),
      entry('No files', 'nothing', { SVG: 'No', PNG: 'No', WebP: 'No' }),
      { Reference: 'bare' },
      null,
      'text',
    ]);

    assert.deepStrictEqual(icons, [
      {
        name: 'Jellyfin',
        reference: 'jellyfin',
        svg: true,
        png: true,
        webp: true,
        light: true,
        dark: true,
        category: 'Self-Hosted',
        tags: ['Streaming', 'Media'],
      },
    ]);
    assert.strictEqual(normalizeIndex({ a: entry('A', 'a') })[0].reference, 'a');
    assert.deepStrictEqual(normalizeIndex('nope'), []);
  });

  test('is downloaded once and cached on disk', async () => {
    useCdn();

    const index = await getIndex();
    assert.strictEqual(index.icons.length, INDEX.length);
    assert.strictEqual(index.stale, false);
    assert.ok(Date.parse(index.updatedAt) <= Date.now());

    await getIndex();
    assert.strictEqual(cdn.hits['/index.json'], 1);

    const saved = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
    assert.strictEqual(saved.icons.length, INDEX.length);
    assert.strictEqual(saved.fetchedAt, index.updatedAt);
  });

  test('keeps working offline from the cached copy', async () => {
    useCdn();
    await getIndex();

    // A restart without network
    useCdn(OFFLINE);
    const index = await getIndex();

    assert.strictEqual(index.icons.length, INDEX.length);
    assert.strictEqual(index.stale, false);
    assert.strictEqual(suggestIcon(index, 'Jellyfin').reference, 'jellyfin');
  });

  test('a stale copy is served at once and refreshed in the background', async () => {
    const old = new Date(Date.now() - INDEX_TTL_MS - 1000).toISOString();
    fs.mkdirSync(workDir, { recursive: true });
    fs.writeFileSync(
      indexFile,
      JSON.stringify({ fetchedAt: old, icons: normalizeIndex(INDEX.slice(0, 2)) })
    );

    useCdn(OFFLINE);
    const offline = await getIndex();
    assert.strictEqual(offline.icons.length, 2);
    assert.strictEqual(offline.stale, true);
    assert.strictEqual(offline.updatedAt, old);

    useCdn();
    const stale = await getIndex();
    assert.strictEqual(stale.icons.length, 2);
    assert.strictEqual(stale.stale, true);

    await waitFor(async () => (await getIndex()).icons.length === INDEX.length);
    const fresh = await getIndex();
    assert.strictEqual(fresh.icons.length, INDEX.length);
    assert.strictEqual(fresh.stale, false);
    assert.strictEqual(cdn.hits['/index.json'], 1);
  });

  test('falls back to the second source', async () => {
    const broken = await createCdn({
      '/index.json': (req, res) => {
        res.statusCode = 500;
        res.end();
      },
    });

    try {
      useCdn(cdn.base, {
        indexSources: [`${broken.base}/index.json`, `${cdn.base}/index.json`],
      });
      const index = await getIndex();
      assert.strictEqual(index.icons.length, INDEX.length);
      assert.strictEqual(broken.hits['/index.json'], 1);
    } finally {
      await broken.close();
    }
  });

  test('rejects a source that is not an icon list', async () => {
    const bad = await createCdn({
      '/index.json': (req, res) => res.end('{"Name": "not a list"'),
    });

    try {
      useCdn(bad.base);
      await assert.rejects(getIndex(), { code: 'UNAVAILABLE', message: /not valid JSON/ });
      assert.ok(!fs.existsSync(indexFile));
    } finally {
      await bad.close();
    }
  });

  test('fails clearly with no copy and no network', async () => {
    useCdn(OFFLINE);
    await assert.rejects(getIndex(), {
      code: 'UNAVAILABLE',
      message: /The selfh.st icon list could not be downloaded/,
    });
    assert.strictEqual(await getIndex({ wait: false }), null);
  });

  test('is only downloaded from public addresses by default', async () => {
    useCdn(cdn.base, { allowPrivate: false });
    await assert.rejects(getIndex(), { code: 'UNAVAILABLE', message: /private network/ });
    assert.strictEqual(cdn.hits['/index.json'], undefined);
  });
});

test.describe('search and suggestions', () => {
  const names = (result) => result.icons.map((icon) => icon.name);
  let index;

  test.beforeEach(async () => {
    useCdn();
    index = await getIndex();
  });

  test('ranks exact names, prefixes, words, substrings, then tags', () => {
    assert.deepStrictEqual(names(searchIcons(index, 'plex')), ['Plex', 'Plexamp', 'Tautulli']);
    assert.deepStrictEqual(names(searchIcons(index, 'JELLY')), ['Jellyfin', 'Jellyseerr']);
    assert.deepStrictEqual(names(searchIcons(index, 'assist')), ['Home Assistant']);
    assert.deepStrictEqual(names(searchIcons(index, 'home assistant')), ['Home Assistant']);
    assert.deepStrictEqual(names(searchIcons(index, 'ssist')), ['Home Assistant']);
    assert.deepStrictEqual(names(searchIcons(index, 'streaming')), ['Jellyfin']);
    assert.deepStrictEqual(names(searchIcons(index, 'zzz')), []);
  });

  test('an empty search lists everything, limited', () => {
    const result = searchIcons(index, '  ', 3);
    assert.strictEqual(result.total, INDEX.length);
    assert.deepStrictEqual(names(result), ['Ghost', 'Home Assistant', 'Jellyfin']);
  });

  test('suggests the icon named like the app only', () => {
    assert.strictEqual(suggestIcon(index, 'Home Assistant').reference, 'home-assistant');
    assert.strictEqual(suggestIcon(index, 'home-assistant').reference, 'home-assistant');
    assert.strictEqual(suggestIcon(index, ' PLEX ').reference, 'plex');
    assert.strictEqual(suggestIcon(index, 'Jelly'), null);
    assert.strictEqual(suggestIcon(index, 'My Plex server'), null);
    assert.strictEqual(suggestIcon(index, ''), null);
  });

  test('prefers SVG, then WebP', () => {
    assert.strictEqual(defaultFormat(index.byReference.get('plex')), 'svg');
    assert.strictEqual(defaultFormat(index.byReference.get('ghost')), 'webp');
  });
});

test.describe('storing icons', () => {
  test.beforeEach(async () => {
    useCdn();
    await getIndex();
  });

  test('downloads, sanitizes and reuses the icon', async () => {
    const icon = await storeSelfhstIcon('jellyfin');
    assert.strictEqual(icon, 'selfhst-jellyfin.svg');

    const stored = fs.readFileSync(join(uploadsDir, icon), 'utf-8');
    assert.match(stored, /<circle/);
    assert.doesNotMatch(stored, /script|onload/);

    assert.strictEqual(await storeSelfhstIcon('jellyfin'), icon);
    assert.strictEqual(cdn.hits['/svg/jellyfin.svg'], 1);
  });

  test('stores each format and variant under its own name', async () => {
    const cases = [
      [{ format: 'svg', variant: 'light' }, 'selfhst-jellyfin_light.svg', '/svg/jellyfin-light.svg'],
      [{ format: 'svg', variant: 'dark' }, 'selfhst-jellyfin_dark.svg', '/svg/jellyfin-dark.svg'],
      [{ format: 'png' }, 'selfhst-jellyfin.png', '/png/jellyfin.png'],
      [{ format: 'webp', variant: 'light' }, 'selfhst-jellyfin_light.webp', '/webp/jellyfin-light.webp'],
    ];

    for (const [options, filename, path] of cases) {
      assert.strictEqual(await storeSelfhstIcon('jellyfin', options), filename);
      assert.strictEqual(cdn.hits[path], 1, path);
      assert.strictEqual(iconFilename('jellyfin', options.format, options.variant || 'standard'), filename);
    }

    assert.ok(fs.readFileSync(join(uploadsDir, 'selfhst-jellyfin.png')).equals(PNG));
    assert.match(fs.readFileSync(join(uploadsDir, 'selfhst-jellyfin_light.svg'), 'utf-8'), /#fff/);
  });

  test('refuses formats and variants the icon does not have', async () => {
    await assert.rejects(storeSelfhstIcon('ghost', { format: 'svg' }), {
      code: 'UNAVAILABLE_VARIANT',
      message: 'Ghost is not available as SVG on selfh.st',
    });
    await assert.rejects(storeSelfhstIcon('ghost', { format: 'webp', variant: 'dark' }), {
      code: 'UNAVAILABLE_VARIANT',
      message: 'Ghost has no dark version on selfh.st',
    });
    await assert.rejects(storeSelfhstIcon('unknown-app'), { code: 'NOT_FOUND' });
    assert.strictEqual(Object.keys(cdn.hits).filter((p) => p !== '/index.json').length, 0);
  });

  test('refuses references and options that could reach other URLs or files', async () => {
    for (const reference of ['../index', 'a/b', 'a_b', 'A', '', '-x', 'x?y', 'x'.repeat(101)]) {
      await assert.rejects(storeSelfhstIcon(reference), { code: 'INVALID' }, reference);
    }
    await assert.rejects(storeSelfhstIcon('plex', { format: 'avif' }), { code: 'INVALID' });
    await assert.rejects(storeSelfhstIcon('plex', { format: 'svg', variant: '../x' }), {
      code: 'INVALID',
    });
    assert.ok(!fs.existsSync(uploadsDir) || fs.readdirSync(uploadsDir).length === 0);
  });

  test('rejects files that are not the requested image type', async () => {
    const fake = await createCdn({
      '/png/plex.png': (req, res) => res.end('<html><script>alert(1)</script></html>'),
      '/svg/plex.svg': (req, res) => res.end(PNG),
    });

    try {
      useCdn(fake.base);
      await assert.rejects(storeSelfhstIcon('plex', { format: 'png' }), {
        code: 'INVALID_IMAGE',
      });
      await assert.rejects(storeSelfhstIcon('plex', { format: 'svg' }), {
        code: 'INVALID_IMAGE',
      });
      assert.ok(!fs.existsSync(join(uploadsDir, 'selfhst-plex.png')));
    } finally {
      await fake.close();
    }
  });

  test('old copies are refreshed, and kept when the CDN is unreachable', async () => {
    const icon = await storeSelfhstIcon('plex');
    const path = join(uploadsDir, icon);
    const old = new Date(Date.now() - ICON_TTL_MS - 1000);

    fs.writeFileSync(path, 'outdated');
    fs.utimesSync(path, old, old);

    useCdn(OFFLINE);
    assert.strictEqual(await storeSelfhstIcon('plex'), icon);
    assert.strictEqual(fs.readFileSync(path, 'utf-8'), 'outdated');

    useCdn();
    assert.strictEqual(await storeSelfhstIcon('plex'), icon);
    assert.match(fs.readFileSync(path, 'utf-8'), /<svg/);
    assert.strictEqual(cdn.hits['/svg/plex.svg'], 2);
  });

  test('works without the index, and reports missing files', async () => {
    fs.rmSync(indexFile);
    useCdn(cdn.base, { indexSources: [`${OFFLINE}/index.json`] });

    assert.strictEqual(await storeSelfhstIcon('plex'), 'selfhst-plex.svg');
    await assert.rejects(storeSelfhstIcon('no-such-app'), {
      code: 'NOT_FOUND',
      message: 'selfh.st has no svg file for no-such-app',
    });
  });

  test('downloads only from public addresses by default', async () => {
    useCdn(cdn.base, { allowPrivate: false, indexSources: [] });
    await assert.rejects(storeSelfhstIcon('plex'), { code: 'BLOCKED' });
    assert.strictEqual(cdn.hits['/svg/plex.svg'], undefined);
  });
});

test.describe('previews', () => {
  test.beforeEach(async () => {
    useCdn();
    await getIndex();
  });

  test('are WebP files kept in memory', async () => {
    const preview = await getPreview('jellyfin');
    assert.strictEqual(preview.contentType, 'image/webp');
    assert.ok(preview.body.equals(WEBP));

    await getPreview('jellyfin');
    assert.strictEqual(cdn.hits['/webp/jellyfin.webp'], 1);

    await getPreview('jellyfin', 'light');
    assert.strictEqual(cdn.hits['/webp/jellyfin-light.webp'], 1);
    assert.ok(!fs.existsSync(uploadsDir));
  });

  test('check the variant and remember failures briefly', async () => {
    await assert.rejects(getPreview('steam', 'dark'), { code: 'UNAVAILABLE_VARIANT' });
    await assert.rejects(getPreview('../x'), { code: 'INVALID' });

    fs.rmSync(indexFile);
    useCdn(cdn.base, { indexSources: [`${OFFLINE}/index.json`] });
    await assert.rejects(getPreview('no-such-app'), { code: 'NOT_FOUND' });
    await assert.rejects(getPreview('no-such-app'), { code: 'NOT_FOUND' });
    assert.strictEqual(cdn.hits['/webp/no-such-app.webp'], 1);
  });
});
