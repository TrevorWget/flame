// Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const {
  normalizeUrl,
  isAllowedUrl,
  parseSchemeList,
} = require('../utils/urlSchemes');

test('accepts default schemes and scheme-less hosts', () => {
  const cases = {
    'https://example.com': 'https://example.com',
    'HTTP://Example.com/path': 'HTTP://Example.com/path',
    'example.com': 'http://example.com',
    'localhost:8080': 'http://localhost:8080',
    'nas.local:5000/admin': 'http://nas.local:5000/admin',
    '192.0.2.10:32400/web': 'http://192.0.2.10:32400/web',
    '[::1]:3000': 'http://[::1]:3000',
    'admin:secret@nas.local': 'http://admin:secret@nas.local',
    'steam://rungameid/570': 'steam://rungameid/570',
    'ssh://admin@nas': 'ssh://admin@nas',
    'smb://nas/share': 'smb://nas/share',
    'mailto:me@example.com': 'mailto:me@example.com',
    '  https://example.com  ': 'https://example.com',
  };

  for (const [input, expected] of Object.entries(cases)) {
    assert.strictEqual(normalizeUrl(input), expected, input);
  }
});

test('rejects script and data schemes, including obfuscated forms', () => {
  const payloads = [
    'javascript:alert(1)',
    'javascript://%0aalert(document.cookie)',
    'JaVaScRiPt://%0aalert(1)',
    ' javascript:alert(1)',
    '\u0001javascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    'java\rscript://%0aalert(1)',
    'vbscript:msgbox(1)',
    'data:text/html,<script>alert(1)</script>',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'blob:https://example.com/uuid',
  ];

  for (const payload of payloads) {
    assert.strictEqual(normalizeUrl(payload), null, JSON.stringify(payload));
  }
});

test('rejects unknown explicit schemes and invalid values', () => {
  for (const value of ['obsidian://open?vault=x', 'foo://bar', '', '   ', null, undefined, 42, {}]) {
    assert.strictEqual(isAllowedUrl(value), false, String(value));
  }
});

test('extra schemes are configurable but cannot unblock script schemes', () => {
  const extra = 'obsidian; vscode:// ,javascript, data:';

  assert.deepStrictEqual(parseSchemeList(extra), ['obsidian', 'vscode']);
  assert.strictEqual(
    normalizeUrl('obsidian://open?vault=x', extra),
    'obsidian://open?vault=x'
  );
  assert.strictEqual(normalizeUrl('vscode://file/c:/x', extra), 'vscode://file/c:/x');
  assert.strictEqual(normalizeUrl('javascript:alert(1)', extra), null);
  assert.strictEqual(normalizeUrl('data:text/html,x', extra), null);
});
