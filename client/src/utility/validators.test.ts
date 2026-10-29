import { describe, expect, it } from 'vitest';

import { isUrl } from './validators';

describe('isUrl', () => {
  it('treats http(s) icon URLs as remote, including dot-less hosts', () => {
    for (const url of [
      'https://example.com/icon.png',
      'http://localhost:8080/icon.svg',
      'http://localhost/icon.png',
      'http://nas:5000/logo.ico',
      'http://192.168.1.2/icon.webp',
      'https://[::1]:3000/icon.svg',
      'HTTPS://Example.com/icon.png',
    ]) {
      expect(isUrl(url)).toBe(true);
    }
  });

  it('treats uploaded file names as local', () => {
    for (const name of [
      '3f2b8c1e-7d4a-4b9e-9c1a-2f6e8d0b5a7c.svg',
      '1650000000000--my.icon.png',
      'icon.png',
      'example.com.png',
    ]) {
      expect(isUrl(name)).toBe(false);
    }
  });
});
