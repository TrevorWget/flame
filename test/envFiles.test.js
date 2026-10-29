// Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const { join } = require('path');

const initDockerSecrets = require('../utils/init/initDockerSecrets');

const dir = fs.mkdtempSync(join(os.tmpdir(), 'flame-env-files-test-'));

test.mock.method(console, 'log', () => {});

test.after(() => {
  for (const key of ['PASSWORD', 'PASSWORD_FILE', 'SECRET', 'SECRET_FILE']) {
    delete process.env[key];
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('PASSWORD_FILE and SECRET_FILE override the plain variables, trimmed', () => {
  fs.writeFileSync(join(dir, 'password'), 'from-file-password\n');
  fs.writeFileSync(join(dir, 'secret'), '  from-file-secret\r\n');
  process.env.PASSWORD = 'from-env';
  process.env.PASSWORD_FILE = join(dir, 'password');
  process.env.SECRET_FILE = join(dir, 'secret');

  initDockerSecrets();

  assert.strictEqual(process.env.PASSWORD, 'from-file-password');
  assert.strictEqual(process.env.SECRET, 'from-file-secret');
});

test('an unreadable _FILE unsets the variable instead of keeping the old value', () => {
  process.env.PASSWORD = 'from-env';
  process.env.PASSWORD_FILE = join(dir, 'missing');

  initDockerSecrets();

  assert.strictEqual(process.env.PASSWORD, undefined);
});
