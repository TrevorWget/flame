// Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const { join } = require('path');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { QueryTypes } = require('sequelize');

const PASSWORD = 'ci-backup-password-5a9d';
const WEATHER_API_KEY = 'ci-backup-weather-key-never-exported';

process.env.NODE_ENV = 'test';
process.env.PASSWORD = PASSWORD;
process.env.SECRET = crypto.randomBytes(32).toString('hex');
process.env.VERSION = '2.5.0';
process.env.BACKUP_MAX_SIZE_MB = '1';

// Config, the JSON files, uploads and the database live in data/ relative to
// the working directory, so each run gets its own copy
const repoRoot = join(__dirname, '..');
const workDir = fs.mkdtempSync(join(os.tmpdir(), 'flame-backup-restore-test-'));
const initialConfig = require('../utils/init/initialConfig.json');
const { template: initialThemes } =
  require('../utils/init/initialFiles.json').files.find(
    (f) => f.name === 'themes.json'
  );

fs.mkdirSync(join(workDir, 'data/uploads'), { recursive: true });
fs.mkdirSync(join(workDir, 'public'));
// Migrations read the config
fs.writeFileSync(
  join(workDir, 'data/config.json'),
  JSON.stringify(initialConfig)
);
process.chdir(workDir);

// The error handler and migrations log every request
test.mock.method(console, 'log', () => {});

const schedule = require('node-schedule');
const api = require('../api');
const { connectDB, sequelize } = require('../db');
const associateModels = require('../models/associateModels');
const App = require('../models/App');
const Bookmark = require('../models/Bookmark');
const Category = require('../models/Category');
const { sanitizeSvg } = require('../utils/icons');
const { saveBackup, listBackupFiles } = require('../utils/backup');
const { dataSchema } = require('../utils/backup/schema');
const { runScheduledBackup } = require('../utils/backupJobs');
const { runStatusChecks } = require('../utils/statusChecks');
const { getPasswordFingerprint } = require('../utils/password');
const { getTokenVersion } = require('../utils/tokenVersion');
const { buildZip, buildBackup, unzip } = require('./zipFixture');

const token = jwt.sign(
  { app: 'flame', pwd: getPasswordFingerprint(), ver: getTokenVersion() },
  process.env.SECRET,
  { expiresIn: '1h', algorithm: 'HS256' }
);

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG = Buffer.concat([PNG_MAGIC, crypto.randomBytes(64)]);
const PNG_NAME = `${crypto.randomUUID()}.png`;
// Older versions kept the uploaded file name
const SVG_NAME = '1700000000000--legacy icon.svg';
const SVG = sanitizeSvg(
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>'
  )
);
// Icons fetched from a site are cached as favicon-<hash>.<ext>
const FAVICON_PNG_NAME = `favicon-${crypto.randomBytes(8).toString('hex')}.png`;
const FAVICON_ICO_NAME = `favicon-${crypto.randomBytes(8).toString('hex')}.ico`;
const FAVICON_ICO = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]),
  crypto.randomBytes(32),
]);

// None of them the defaults, so a restore that drops one is caught
const LAYOUT_SETTINGS = {
  appTileStyle: 'tiles',
  appDensity: 'roomy',
  appIconScale: 140,
  homeAppColumns: 6,
  appsPageColumns: 3,
  hideAppUrls: true,
  hideAppDescriptions: true,
  hideStatusDots: true,
};

// Answers the status checks of the restored apps
const statusServer = http.createServer((req, res) => res.end('ok'));
let statusUrl;

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf-8'));
const writeJson = (path, value) =>
  fs.writeFileSync(path, JSON.stringify(value));
const rows = (sql) => sequelize.query(sql, { type: QueryTypes.SELECT });

const authed = (req) => req.set('Authorization-Flame', `Bearer ${token}`);

const binary = (req) =>
  req.buffer(true).parse((res, cb) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

const exportBackup = async () => {
  const res = await binary(authed(request(api).get('/api/backup/export')));
  assert.strictEqual(res.status, 200);
  return res;
};

const upload = (path, archive) =>
  authed(request(api).post(path)).attach('backup', archive, 'backup.zip');

const restore = (archive) => upload('/api/backup/restore', archive);
const preview = (archive) => upload('/api/backup/restore/preview', archive);

const writeFiles = ({ config, themes, queries, css, uploads }) => {
  writeJson('data/config.json', config);
  writeJson('data/themes.json', themes);
  writeJson('data/customQueries.json', queries);
  fs.writeFileSync('data/flame.css', css);
  fs.writeFileSync('public/flame.css', css);
  fs.rmSync('data/uploads', { recursive: true, force: true });
  fs.mkdirSync('data/uploads');

  for (const [name, data] of Object.entries(uploads)) {
    fs.writeFileSync(join('data/uploads', name), data);
  }
};

const clearTables = async () => {
  for (const table of ['apps', 'bookmarks', 'categories']) {
    await sequelize.query(`DELETE FROM ${table}`);
  }
};

const seed = async () => {
  writeFiles({
    config: {
      ...initialConfig,
      customTitle: 'Backup Flame',
      WEATHER_API_KEY,
      dockerHost: 'tcp://10.0.0.5:2375',
      lat: 51.5,
      long: -0.12,
      extraUrlSchemes: 'obsidian',
      backupRetention: 3,
      defaultTheme: '#EFFBFF;#6EE2FF;#242B33',
      statusChecks: true,
      statusCheckInterval: 120,
      statusCheckTimeout: 3,
      statusCheckSlow: 1.5,
      statusCheckDocker: true,
      statusColorUp: '#3fb950',
      statusColorUnhealthy: '',
      statusColorDown: '#f85149',
      autoFetchIcons: true,
      iconFetchAllowPrivate: true,
      ...LAYOUT_SETTINGS,
    },
    themes: {
      themes: [
        ...initialThemes.themes,
        {
          name: 'Custom',
          colors: {
            background: '#101010',
            primary: '#fafafa',
            accent: '#ff0066',
          },
          isCustom: true,
        },
      ],
    },
    queries: {
      queries: [
        {
          name: 'Brave',
          prefix: 'b',
          template: 'https://search.brave.com/search?q=',
        },
      ],
    },
    css: 'body { letter-spacing: 0.01em; }\n',
    uploads: {
      [PNG_NAME]: PNG,
      [SVG_NAME]: SVG,
      [FAVICON_PNG_NAME]: PNG,
      [FAVICON_ICO_NAME]: FAVICON_ICO,
    },
  });

  await clearTables();

  const media = await Category.create({
    name: 'Media',
    type: 'apps',
    isPinned: true,
    orderId: 2,
  });
  const tools = await Category.create({
    name: 'Tools',
    type: 'apps',
    isPinned: false,
    isPublic: 0,
  });
  const links = await Category.create({
    name: 'Links',
    type: 'bookmarks',
    isPinned: true,
  });

  await App.create({
    name: 'Jellyfin',
    url: 'http://192.168.1.2:8096',
    externalUrl: 'https://jellyfin.example.com',
    preferredUrl: 'external',
    categoryId: media.id,
    icon: FAVICON_PNG_NAME,
    isPinned: true,
    orderId: 1,
    description: 'Movies',
    statusCheck: false,
  });
  await App.create({
    name: 'Sonarr',
    url: 'orbit.local:8989',
    categoryId: media.id,
    icon: SVG_NAME,
    isPublic: 0,
    source: 'docker',
    statusUrl,
  });
  await App.create({
    name: 'Notes',
    url: 'obsidian://open?vault=notes',
    externalUrl: 'https://notes.example.com',
    categoryId: tools.id,
    icon: PNG_NAME,
    isPinned: false,
  });
  await Bookmark.create({
    name: 'Docs',
    url: 'https://docs.example.com',
    categoryId: links.id,
    icon: FAVICON_ICO_NAME,
  });
  await Bookmark.create({
    name: 'Private',
    url: 'https://private.example.com',
    categoryId: links.id,
    isPublic: 0,
    orderId: 3,
  });
};

const wipe = async () => {
  writeFiles({
    config: { ...initialConfig, WEATHER_API_KEY: 'key-set-after-the-backup' },
    themes: initialThemes,
    queries: { queries: [] },
    css: '',
    uploads: {},
  });

  await clearTables();

  const other = await Category.create({ name: 'Unrelated', type: 'apps' });
  await App.create({
    name: 'Stray',
    url: 'https://stray.example.com',
    categoryId: other.id,
  });
};

// Everything a backup covers. The weather API key is never part of a backup,
// so it is compared separately.
const snapshot = async () => {
  const { WEATHER_API_KEY: weatherKey, ...config } =
    readJson('data/config.json');

  return {
    categories: await rows('SELECT * FROM categories ORDER BY id'),
    apps: await rows('SELECT * FROM apps ORDER BY id'),
    bookmarks: await rows('SELECT * FROM bookmarks ORDER BY id'),
    config,
    weatherKey,
    themes: readJson('data/themes.json'),
    queries: readJson('data/customQueries.json'),
    css: fs.readFileSync('data/flame.css', 'utf-8'),
    publicCss: fs.readFileSync('public/flame.css', 'utf-8'),
    uploads: Object.fromEntries(
      fs
        .readdirSync('data/uploads')
        .sort()
        .map((name) => [
          name,
          fs.readFileSync(join('data/uploads', name)).toString('base64'),
        ])
    ),
  };
};

const withoutWeatherKey = ({ weatherKey, ...rest }) => rest;

let seeded;
let archive;
let exported;

test.before(async () => {
  await new Promise((resolve) => statusServer.listen(0, '127.0.0.1', resolve));
  statusUrl = `http://127.0.0.1:${statusServer.address().port}/health`;

  await connectDB();
  associateModels();
  await seed();
  seeded = await snapshot();
  archive = (await exportBackup()).body;
  exported = JSON.parse((await unzip(archive)).get('data.json'));
});

test.after(async () => {
  await schedule.gracefulShutdown();
  // Lets a status check run started by the last restore finish first
  await runStatusChecks();
  statusServer.closeAllConnections();
  await new Promise((resolve) => statusServer.close(resolve));
  await sequelize.close();
  process.chdir(repoRoot);
  fs.rmSync(workDir, { recursive: true, force: true });
});

test.describe('access', () => {
  test('every backup endpoint requires login', async () => {
    for (const [method, path] of [
      ['get', '/api/backup/export'],
      ['get', '/api/backup/files'],
      ['get', '/api/backup/files/flame-backup-20261029T120000000Z.zip'],
      ['post', '/api/backup/restore/preview'],
      ['post', '/api/backup/restore'],
    ]) {
      const res = await request(api)[method](path).set('X-Flame-CSRF', '1');
      assert.strictEqual(res.status, 401, `${method} ${path}`);
    }
  });

  test('a restore with the session cookie needs the CSRF header', async () => {
    const res = await request(api)
      .post('/api/backup/restore')
      .set('Cookie', `flame_token=${token}`)
      .attach('backup', archive, 'backup.zip');

    assert.strictEqual(res.status, 403);
  });
});

test.describe('export', () => {
  test('downloads a zip named after the time it was made', async () => {
    const res = await exportBackup();

    assert.match(
      res.headers['content-disposition'],
      /^attachment; filename="flame-backup-\d{8}T\d{9}Z\.zip"$/
    );
    assert.strictEqual(res.headers['content-type'], 'application/zip');
    assert.strictEqual(res.headers['cache-control'], 'no-store');
  });

  test('contains the database, settings, themes, search providers, CSS and icons', async () => {
    const files = await unzip(archive);

    assert.deepStrictEqual(
      [...files.keys()].sort(),
      [
        'data.json',
        'flame.css',
        'manifest.json',
        `uploads/${SVG_NAME}`,
        `uploads/${PNG_NAME}`,
        `uploads/${FAVICON_PNG_NAME}`,
        `uploads/${FAVICON_ICO_NAME}`,
      ].sort()
    );

    const manifest = JSON.parse(files.get('manifest.json'));
    assert.strictEqual(manifest.format, 'flame-backup');
    assert.strictEqual(manifest.schemaVersion, 1);
    assert.strictEqual(manifest.flameVersion, '2.5.0');

    assert.strictEqual(exported.categories.length, 3);
    assert.strictEqual(exported.apps.length, 3);
    assert.strictEqual(exported.bookmarks.length, 2);
    assert.strictEqual(exported.themes.length, initialThemes.themes.length + 1);
    assert.deepStrictEqual(exported.queries, seeded.queries.queries);
    assert.strictEqual(exported.settings.customTitle, 'Backup Flame');
    assert.strictEqual(exported.settings.dockerHost, 'tcp://10.0.0.5:2375');
    assert.strictEqual(files.get('flame.css').toString(), seeded.css);
    assert.ok(files.get(`uploads/${PNG_NAME}`).equals(PNG));
    assert.ok(files.get(`uploads/${FAVICON_ICO_NAME}`).equals(FAVICON_ICO));
  });

  test('contains the external URLs, status checks and their settings', () => {
    const byName = Object.fromEntries(exported.apps.map((a) => [a.name, a]));

    assert.deepStrictEqual(
      Object.values(byName).map(
        ({ name, externalUrl, preferredUrl, statusCheck, statusUrl }) => ({
          name,
          externalUrl,
          preferredUrl,
          statusCheck,
          statusUrl,
        })
      ),
      [
        {
          name: 'Jellyfin',
          externalUrl: 'https://jellyfin.example.com',
          preferredUrl: 'external',
          statusCheck: false,
          statusUrl: null,
        },
        {
          name: 'Sonarr',
          externalUrl: '',
          preferredUrl: 'internal',
          statusCheck: true,
          statusUrl,
        },
        {
          name: 'Notes',
          externalUrl: 'https://notes.example.com',
          preferredUrl: 'internal',
          statusCheck: true,
          statusUrl: null,
        },
      ]
    );
    assert.strictEqual(byName.Jellyfin.icon, FAVICON_PNG_NAME);
    assert.strictEqual(exported.bookmarks[0].icon, FAVICON_ICO_NAME);

    assert.deepStrictEqual(
      {
        statusChecks: exported.settings.statusChecks,
        statusCheckInterval: exported.settings.statusCheckInterval,
        statusCheckTimeout: exported.settings.statusCheckTimeout,
        statusCheckSlow: exported.settings.statusCheckSlow,
        statusCheckDocker: exported.settings.statusCheckDocker,
        statusColorUp: exported.settings.statusColorUp,
        statusColorUnhealthy: exported.settings.statusColorUnhealthy,
        statusColorDown: exported.settings.statusColorDown,
        autoFetchIcons: exported.settings.autoFetchIcons,
        iconFetchAllowPrivate: exported.settings.iconFetchAllowPrivate,
      },
      {
        statusChecks: true,
        statusCheckInterval: 120,
        statusCheckTimeout: 3,
        statusCheckSlow: 1.5,
        statusCheckDocker: true,
        statusColorUp: '#3fb950',
        statusColorUnhealthy: '',
        statusColorDown: '#f85149',
        autoFetchIcons: true,
        iconFetchAllowPrivate: true,
      }
    );
  });

  test('never contains the weather API key, the password or the JWT secret', async () => {
    assert.ok(!('WEATHER_API_KEY' in exported.settings));

    for (const content of (await unzip(archive)).values()) {
      const text = content.toString('latin1');

      for (const secret of [WEATHER_API_KEY, PASSWORD, process.env.SECRET]) {
        assert.ok(!text.includes(secret));
      }
    }
  });

  test('skips uploaded files that are not icons', async () => {
    fs.writeFileSync('data/uploads/page.html', '<script>alert(1)</script>');
    fs.writeFileSync('data/uploads/fake.png', '<html></html>');

    try {
      const files = await unzip((await exportBackup()).body);
      assert.ok(!files.has('uploads/page.html'));
      assert.ok(!files.has('uploads/fake.png'));
      assert.ok(files.has(`uploads/${PNG_NAME}`));
    } finally {
      fs.rmSync('data/uploads/page.html');
      fs.rmSync('data/uploads/fake.png');
    }
  });
});

test.describe('restore', () => {
  test('export, wipe, restore brings back an identical state', async () => {
    await wipe();
    const wiped = await snapshot();

    const previewRes = await preview(archive);
    assert.strictEqual(previewRes.status, 200);
    assert.deepStrictEqual(previewRes.body.data.backup, {
      categories: 3,
      apps: 3,
      bookmarks: 2,
      themes: initialThemes.themes.length + 1,
      queries: 1,
      settings: Object.keys(exported.settings).length,
      css: true,
      uploads: 4,
    });
    assert.deepStrictEqual(previewRes.body.data.current, {
      categories: 1,
      apps: 1,
      bookmarks: 0,
      themes: initialThemes.themes.length,
      queries: 0,
      uploads: 0,
    });
    assert.strictEqual(previewRes.body.data.manifest.flameVersion, '2.5.0');
    // A preview changes nothing
    assert.deepStrictEqual(await snapshot(), wiped);

    const res = await restore(archive);
    assert.strictEqual(res.status, 200, res.text);
    assert.match(
      res.body.data.preRestoreBackup,
      /^pre-restore-\d{8}T\d{9}Z\.zip$/
    );

    const restored = await snapshot();
    assert.deepStrictEqual(
      withoutWeatherKey(restored),
      withoutWeatherKey(seeded)
    );
    // Secrets are not in the backup, so the current ones are kept
    assert.strictEqual(restored.weatherKey, 'key-set-after-the-backup');

    // The restored settings turned status checks on, and they run right away
    const sonarr = restored.apps.find((a) => a.name === 'Sonarr');
    const statusOf = async () =>
      (await authed(request(api).get('/api/apps/status'))).body.data;

    for (let i = 0; i < 100; i++) {
      if ((await statusOf()).statuses[sonarr.id]) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const { enabled, statuses } = await statusOf();
    assert.strictEqual(enabled, true);
    assert.deepStrictEqual(Object.keys(statuses), [String(sonarr.id)]);
    assert.strictEqual(statuses[sonarr.id].status, 'up');

    const categories = await authed(request(api).get('/api/categories'));
    assert.deepStrictEqual(
      categories.body.data.map((c) => [
        c.name,
        c.apps.length,
        c.bookmarks.length,
      ]),
      [
        ['Media', 2, 0],
        ['Tools', 1, 0],
        ['Links', 0, 2],
      ]
    );

    // The pre-restore backup holds the wiped state and restores it
    const saved = await binary(
      authed(
        request(api).get(`/api/backup/files/${res.body.data.preRestoreBackup}`)
      )
    );
    assert.strictEqual(saved.status, 200);

    const undo = await restore(saved.body);
    assert.strictEqual(undo.status, 200, undo.text);
    assert.deepStrictEqual(withoutWeatherKey(await snapshot()), {
      ...withoutWeatherKey(wiped),
      // Restores add icons; they never delete the ones already there
      uploads: seeded.uploads,
    });

    assert.strictEqual((await restore(archive)).status, 200);
  });

  test('keeps the current settings, themes and search providers when the backup has none', async () => {
    const before = await snapshot();
    const { categories, apps, bookmarks } = exported;

    const res = await restore(
      buildBackup({ data: { categories, apps, bookmarks } })
    );
    assert.strictEqual(res.status, 200, res.text);

    const after = await snapshot();
    assert.deepStrictEqual(
      {
        config: after.config,
        themes: after.themes,
        queries: after.queries,
        css: after.css,
      },
      {
        config: before.config,
        themes: before.themes,
        queries: before.queries,
        css: before.css,
      }
    );
  });

  test('layout settings survive an export, wipe and restore', async () => {
    const pick = (settings) =>
      Object.fromEntries(
        Object.keys(LAYOUT_SETTINGS).map((key) => [key, settings[key]])
      );

    assert.deepStrictEqual(pick(exported.settings), LAYOUT_SETTINGS);

    await wipe();
    assert.notDeepStrictEqual(
      pick(readJson('data/config.json')),
      LAYOUT_SETTINGS
    );

    const res = await restore(archive);
    assert.strictEqual(res.status, 200, res.text);
    assert.deepStrictEqual(pick(readJson('data/config.json')), LAYOUT_SETTINGS);

    const publicConfig = await request(api).get('/api/config');
    assert.deepStrictEqual(pick(publicConfig.body.data), LAYOUT_SETTINGS);
  });

  test('a backup cannot set the weather API key', async () => {
    const data = structuredClone(exported);
    data.settings.WEATHER_API_KEY = 'from-a-backup';

    assert.strictEqual((await restore(buildBackup({ data }))).status, 200);
    assert.strictEqual(
      readJson('data/config.json').WEATHER_API_KEY,
      'key-set-after-the-backup'
    );
  });

  test('sanitizes restored SVG icons', async () => {
    const evil =
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)"><circle r="4"/></a></svg>';

    const res = await restore(
      buildBackup({
        data: exported,
        extra: [{ name: 'uploads/evil.svg', data: evil }],
      })
    );
    assert.strictEqual(res.status, 200, res.text);

    const stored = fs.readFileSync('data/uploads/evil.svg', 'utf-8');
    assert.match(stored, /<circle/);
    assert.doesNotMatch(stored, /script|onload|javascript/i);
    fs.rmSync('data/uploads/evil.svg');
  });

  test('rolls the database and every file back when applying fails', async (t) => {
    await wipe();
    const before = await snapshot();
    const rename = fs.promises.rename;

    // The icons are written last, after the database and the JSON files
    t.mock.method(fs.promises, 'rename', async (from, to) => {
      if (to.includes(SVG_NAME)) throw new Error('disk full');
      return rename(from, to);
    });

    const res = await restore(archive);
    t.mock.restoreAll();

    assert.strictEqual(res.status, 500);
    assert.deepStrictEqual(await snapshot(), before);
    for (const dir of ['data', 'data/uploads']) {
      assert.deepStrictEqual(
        fs.readdirSync(dir).filter((name) => name.endsWith('.tmp')),
        [],
        dir
      );
    }

    assert.strictEqual((await restore(archive)).status, 200);
  });
});

test.describe('invalid archives', () => {
  const withData = (change) => {
    const data = structuredClone(exported);
    change(data);
    return buildBackup({ data });
  };

  const icon = (name, data = PNG) =>
    buildBackup({ data: exported, extra: [{ name, data }] });

  const cases = () => [
    [
      'not a zip',
      Buffer.from('definitely not a zip file'),
      400,
      /not a valid zip/,
    ],
    [
      'no manifest',
      buildZip([{ name: 'data.json', data: JSON.stringify(exported) }]),
      400,
      /manifest\.json is missing/,
    ],
    [
      'another format',
      buildBackup({ data: exported, manifest: { format: 'other' } }),
      400,
      /Not a Flame backup/,
    ],
    [
      'a newer backup format',
      buildBackup({ data: exported, manifest: { schemaVersion: 2 } }),
      400,
      /newer version of Flame/,
    ],
    [
      'data.json that is not JSON',
      buildZip([
        {
          name: 'manifest.json',
          data: JSON.stringify({ format: 'flame-backup', schemaVersion: 1 }),
        },
        { name: 'data.json', data: '{"categories": [' },
      ]),
      400,
      /data\.json is not valid JSON/,
    ],
    [
      'a parent directory path',
      icon('../evil.png'),
      400,
      /invalid relative path/,
    ],
    [
      'a nested parent directory path',
      icon('uploads/../../evil.png'),
      400,
      /invalid relative path/,
    ],
    ['an absolute path', icon('/tmp/evil.png'), 400, /absolute path/],
    ['a drive letter path', icon('C:/evil.png'), 400, /absolute path/],
    [
      'a backslash path',
      icon('uploads\\..\\evil.png'),
      400,
      /invalid characters/,
    ],
    [
      'an unexpected file',
      icon('index.html', '<script></script>'),
      400,
      /unexpected file index\.html/,
    ],
    [
      'a non-icon upload',
      icon('uploads/page.html', '<script></script>'),
      400,
      /unexpected file/,
    ],
    [
      'an upload in a subdirectory',
      icon('uploads/sub/x.png'),
      400,
      /unexpected file/,
    ],
    ['a hidden upload', icon('uploads/.htaccess.png'), 400, /unexpected file/],
    [
      'a symlink',
      buildBackup({
        data: exported,
        extra: [
          { name: 'uploads/link.png', data: '/etc/passwd', mode: 0o120777 },
        ],
      }),
      400,
      /not a regular file/,
    ],
    [
      'an encrypted entry',
      buildBackup({
        data: exported,
        extra: [{ name: 'uploads/secret.png', data: PNG, flags: 0x0801 }],
      }),
      400,
      /encrypted/,
    ],
    [
      'HTML disguised as a PNG',
      icon('uploads/x.png', '<html><script>alert(1)</script></html>'),
      400,
      /not a PNG, JPEG/,
    ],
    ['a PNG named .svg', icon('uploads/x.svg', PNG), 400, /not a PNG, JPEG/],
    [
      'an icon larger than 2 MB',
      icon(
        'uploads/big.png',
        Buffer.concat([PNG_MAGIC, Buffer.alloc(3 * 1024 * 1024)])
      ),
      413,
      /larger than/,
    ],
    [
      'an entry larger than it declares (zip bomb)',
      buildBackup({
        data: exported,
        extra: [
          {
            name: 'uploads/bomb.png',
            data: Buffer.concat([PNG_MAGIC, Buffer.alloc(20 * 1024 * 1024)]),
            declaredSize: 100,
          },
        ],
      }),
      400,
      /too many bytes|larger than declared/,
    ],
    [
      'an archive over BACKUP_MAX_SIZE_MB',
      crypto.randomBytes(1.5 * 1024 * 1024),
      413,
      /1 MB or smaller/,
    ],
    [
      'a javascript: link',
      withData((d) => (d.apps[0].url = 'javascript:alert(document.cookie)')),
      400,
      /apps\.0\.url: URL is invalid/,
    ],
    [
      'a javascript: external URL',
      withData((d) => (d.apps[0].externalUrl = 'javascript:alert(1)')),
      400,
      /apps\.0\.externalUrl: URL is invalid/,
    ],
    [
      'a status check URL that is not http',
      withData((d) => (d.apps[1].statusUrl = 'ftp://orbit.local')),
      400,
      /apps\.1\.statusUrl: Status check URL must be/,
    ],
    [
      'an unknown preferred URL',
      withData((d) => (d.apps[0].preferredUrl = 'both')),
      400,
      /apps\.0\.preferredUrl/,
    ],
    [
      'a search provider with a data: template',
      withData((d) => (d.queries[0].template = 'data:text/html,<script>')),
      400,
      /queries\.0\.template/,
    ],
    [
      'an app without its category',
      withData((d) => (d.apps[1].categoryId = 999)),
      400,
      /apps\.1\.categoryId: No category with id 999/,
    ],
    [
      'duplicate ids',
      withData((d) => d.bookmarks.push({ ...d.bookmarks[0] })),
      400,
      /bookmarks\.2\.id: Duplicate id/,
    ],
    [
      'a theme color that is not a hex color',
      withData(
        (d) => (d.themes[0].colors.primary = 'red; } body { display: none')
      ),
      400,
      /themes\.0\.colors\.primary/,
    ],
    [
      'an invalid setting',
      withData((d) => (d.settings.dockerHost = 'ftp://nope')),
      400,
      /settings\.dockerHost/,
    ],
    [
      'an unknown tile style',
      withData((d) => (d.settings.appTileStyle = 'carousel')),
      400,
      /settings\.appTileStyle/,
    ],
    [
      'too many app columns',
      withData((d) => (d.settings.homeAppColumns = 20)),
      400,
      /settings\.homeAppColumns/,
    ],
    [
      'custom CSS over the size limit',
      buildBackup({
        data: exported,
        extra: [{ name: 'flame.css', data: 'a'.repeat(100001) }],
      }),
      400,
      /flame\.css/,
    ],
  ];

  test('are rejected without changing anything', async () => {
    const before = await snapshot();
    const backupsBefore = await listBackupFiles();
    const CASES = cases();

    for (const [label, buffer, status, message] of CASES) {
      const res = await restore(buffer);

      assert.strictEqual(res.status, status, `${label}: ${res.text}`);
      assert.match(res.body.error, message, label);
    }

    const previewRes = await preview(CASES[5][1]);
    assert.strictEqual(previewRes.status, 400);

    assert.deepStrictEqual(await snapshot(), before);
    assert.deepStrictEqual(await listBackupFiles(), backupsBefore);
    assert.ok(!fs.existsSync(join(workDir, 'evil.png')));
    assert.ok(!fs.existsSync(join(workDir, 'data/evil.png')));
  });

  test('a request without a file is rejected', async () => {
    const res = await authed(request(api).post('/api/backup/restore'));
    assert.strictEqual(res.status, 400);
    assert.match(res.body.error, /Choose a backup file/);
  });
});

test.describe('saved backups', () => {
  test('keep only the newest ones per kind', async () => {
    const preRestore = (await listBackupFiles()).filter(
      (f) => f.kind === 'pre-restore'
    );

    for (let i = 0; i < 3; i++) {
      await saveBackup(2);
    }

    const files = await listBackupFiles();
    const scheduled = files.filter((f) => f.kind === 'scheduled');

    assert.strictEqual(scheduled.length, 2);
    assert.deepStrictEqual(
      files.filter((f) => f.kind === 'pre-restore'),
      preRestore
    );
    // At most PRE_RESTORE_RETENTION pre-restore backups are kept
    assert.ok(preRestore.length <= 5);

    const res = await authed(request(api).get('/api/backup/files'));
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      res.body.data.map((f) => f.name),
      files.map((f) => f.name)
    );
  });

  test('only backup files can be downloaded', async () => {
    fs.writeFileSync('data/backups/notes.zip', 'x');

    for (const name of [
      'notes.zip',
      '..%2Fconfig.json',
      '..%2F..%2Fdata%2Fdb.sqlite',
      'flame-backup-20261029T120000000Z.zip',
    ]) {
      const res = await authed(request(api).get(`/api/backup/files/${name}`));
      assert.strictEqual(res.status, 404, name);
    }
  });

  test('the schedule follows the settings', async () => {
    const setSchedule = async (backupSchedule) => {
      const res = await authed(request(api).put('/api/config')).send({
        backupSchedule,
      });
      assert.strictEqual(res.status, 200, res.text);
    };

    await setSchedule('daily');
    assert.ok(schedule.scheduledJobs.scheduledBackup);

    await setSchedule('weekly');
    assert.ok(schedule.scheduledJobs.scheduledBackup);

    await setSchedule('off');
    assert.strictEqual(schedule.scheduledJobs.scheduledBackup, undefined);

    const bad = await authed(request(api).put('/api/config')).send({
      backupSchedule: 'hourly',
    });
    assert.strictEqual(bad.status, 400);
  });

  test('a scheduled run saves a restorable backup with the configured retention', async () => {
    writeJson('data/config.json', {
      ...readJson('data/config.json'),
      backupRetention: 1,
    });

    await runScheduledBackup();

    const scheduled = (await listBackupFiles()).filter(
      (f) => f.kind === 'scheduled'
    );
    assert.strictEqual(scheduled.length, 1);

    const res = await preview(
      fs.readFileSync(join('data/backups', scheduled[0].name))
    );
    assert.strictEqual(res.status, 200, res.text);
    assert.strictEqual(res.body.data.backup.apps, 3);
  });
});

test('the backup schema covers every database column', async () => {
  const { shape } = dataSchema('');
  const queryInterface = sequelize.getQueryInterface();

  for (const table of ['categories', 'apps', 'bookmarks']) {
    const columns = Object.keys(await queryInterface.describeTable(table));

    assert.deepStrictEqual(
      Object.keys(shape[table].element.shape).sort(),
      columns.sort(),
      table
    );
  }
});
