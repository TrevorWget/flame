// Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseDockerHost, loadTlsOptions } = require('../controllers/apps/docker/dockerHost');

const noTls = {};

test('localhost and unix:// use a local socket', () => {
  for (const value of ['localhost', 'LOCALHOST', 'localhost:2375', '', undefined]) {
    assert.deepStrictEqual(
      parseDockerHost(value, noTls),
      { type: 'socket', socketPath: '/var/run/docker.sock', label: 'unix:///var/run/docker.sock' },
      String(value)
    );
  }

  assert.strictEqual(
    parseDockerHost('unix:///run/user/1000/podman/podman.sock', noTls).socketPath,
    '/run/user/1000/podman/podman.sock'
  );
  assert.strictEqual(
    parseDockerHost('npipe:////./pipe/docker_engine', noTls).socketPath,
    '\\\\.\\pipe\\docker_engine'
  );
});

test('tcp hosts use http unless TLS is configured', () => {
  const cases = {
    'tcp://socket-proxy:2375': 'http://socket-proxy:2375',
    'socket-proxy:2375': 'http://socket-proxy:2375',
    '192.0.2.10': 'http://192.0.2.10:2375',
    'http://docker.lan:2375/': 'http://docker.lan:2375',
    'tcp://[fd00::2]:2375': 'http://[fd00::2]:2375',
    'https://docker.lan': 'https://docker.lan:2376',
  };

  for (const [input, baseURL] of Object.entries(cases)) {
    const target = parseDockerHost(input, noTls);
    assert.strictEqual(target.type, 'tcp', input);
    assert.strictEqual(target.baseURL, baseURL, input);
    assert.strictEqual(target.tls, baseURL.startsWith('https'), input);
  }

  for (const env of [{ DOCKER_TLS_VERIFY: '1' }, { DOCKER_CERT_PATH: '/certs' }]) {
    assert.strictEqual(parseDockerHost('tcp://docker.lan:2376', env).baseURL, 'https://docker.lan:2376');
    assert.strictEqual(parseDockerHost('docker.lan', env).baseURL, 'https://docker.lan:2376');
    // An explicit http:// is respected
    assert.strictEqual(parseDockerHost('http://docker.lan:2375', env).tls, false);
  }

  assert.strictEqual(parseDockerHost('tcp://docker.lan', { DOCKER_TLS_VERIFY: '0' }).tls, false);
});

test('rejects values that are not a Docker API root', () => {
  for (const value of [
    'ftp://docker.lan',
    'file:///etc/passwd',
    'ssh://admin@nas',
    'tcp://',
    'tcp://user:pass@docker.lan:2375',
    'http://docker.lan:2375/containers/json',
    'http://docker.lan:2375?x=1',
    'http://169.254.169.254/latest/meta-data',
    'unix://relative.sock',
    'npipe://docker_engine',
    'docker lan:2375',
  ]) {
    assert.throws(() => parseDockerHost(value, noTls), Error, value);
  }
});

test('loads TLS material from DOCKER_CERT_PATH', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flame-docker-certs-'));

  try {
    fs.writeFileSync(path.join(dir, 'ca.pem'), 'CA');
    assert.deepStrictEqual(loadTlsOptions({ DOCKER_CERT_PATH: dir }), {
      ca: Buffer.from('CA'),
      cert: undefined,
      key: undefined,
    });

    fs.writeFileSync(path.join(dir, 'cert.pem'), 'CERT');
    assert.throws(() => loadTlsOptions({ DOCKER_CERT_PATH: dir }), /key\.pem/);

    fs.writeFileSync(path.join(dir, 'key.pem'), 'KEY');
    assert.strictEqual(loadTlsOptions({ DOCKER_CERT_PATH: dir }).key.toString(), 'KEY');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
