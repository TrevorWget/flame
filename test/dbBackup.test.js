// Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const { join } = require('path');

process.env.NODE_ENV = 'test';
process.env.VERSION = '2.5.0';

const repoRoot = join(__dirname, '..');
const workDir = fs.mkdtempSync(join(os.tmpdir(), 'flame-backup-test-'));

fs.mkdirSync(join(workDir, 'data'));
fs.writeFileSync(
  join(workDir, 'data/config.json'),
  JSON.stringify(require('../utils/init/initialConfig.json'))
);
process.chdir(workDir);

test.mock.method(console, 'log', () => {});

const { connectDB, sequelize, umzug } = require('../db');
const backupDB = require('../db/utils/backupDb');
const { slugify } = require('../db/utils/slugify');

const LAST_MIGRATION = '09_app-status-check.js';

test.after(async () => {
  await sequelize.close();
  process.chdir(repoRoot);
  fs.rmSync(workDir, { recursive: true, force: true });
});

const pendingNames = async () => (await umzug.pending()).map((m) => m.file);

test('backup names include the version and a timestamp', () => {
  assert.strictEqual(
    slugify(new Date('2026-10-29T14:45:01.123Z')),
    'db-250-20261029T144501123Z-backup.sqlite'
  );
});

test('a fresh install runs every migration without a backup or app categories', async () => {
  await connectDB();

  assert.deepStrictEqual(await pendingNames(), []);
  assert.ok(!fs.existsSync('data/db_backups'));

  const [categories] = await sequelize.query(
    'SELECT COUNT(*) AS count FROM categories'
  );
  assert.strictEqual(categories[0].count, 0);
});

test('backups taken at the same moment never overwrite each other', () => {
  const date = new Date('2026-10-29T14:45:01.123Z');
  const first = backupDB(date);
  const second = backupDB(date);

  assert.notStrictEqual(first, second);
  assert.ok(fs.existsSync(first) && fs.existsSync(second));
  fs.rmSync('data/db_backups', { recursive: true });
});

test('migrations do not run when the backup fails', async (t) => {
  await umzug.down({ to: LAST_MIGRATION });
  assert.deepStrictEqual(await pendingNames(), [LAST_MIGRATION]);

  // A file where the backup directory should be makes the backup fail
  fs.writeFileSync('data/db_backups', '');
  const exit = t.mock.method(process, 'exit', () => {});

  await connectDB();

  assert.deepStrictEqual(
    exit.mock.calls.map((c) => c.arguments),
    [[1]]
  );
  assert.deepStrictEqual(await pendingNames(), [LAST_MIGRATION]);
  fs.rmSync('data/db_backups');
});

test('pending migrations on an existing database are backed up first', async () => {
  await connectDB();

  assert.deepStrictEqual(await pendingNames(), []);
  const files = fs.readdirSync('data/db_backups');
  assert.strictEqual(files.length, 1);
  assert.match(files[0], /^db-250-\d{8}T\d{9}Z-backup\.sqlite$/);
});
