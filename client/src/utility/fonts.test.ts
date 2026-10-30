import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { applyFont, DEFAULT_FONT, FONTS, getFont } from './fonts';

const clientDir = join(__dirname, '../..');
const read = (path: string) => readFileSync(join(clientDir, path), 'utf-8');

const cssFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return name.endsWith('.css') ? [path] : [];
  });

describe('fonts', () => {
  afterEach(() => applyFont(DEFAULT_FONT));

  it('default to Roboto, the font Flame always used', () => {
    expect(DEFAULT_FONT).toBe('roboto');
    expect(getFont(undefined).stack).toBe('Roboto, sans-serif');
    expect(read('src/index.css')).toMatch(/--font-family: Roboto, sans-serif;/);
  });

  it('are all bundled, apart from the system font', () => {
    const fontsCss = read('src/fonts.css');

    for (const font of FONTS.filter(
      (f) => !['roboto', 'system'].includes(f.id)
    )) {
      const family = /^'([^']+)'/.exec(font.stack)![1];
      expect(fontsCss).toContain(`font-family: '${family}'`);
    }
  });

  it('are never loaded from Google Fonts or another server', () => {
    for (const path of [
      ...cssFiles(join(clientDir, 'src')),
      join(clientDir, 'index.html'),
    ]) {
      const content = readFileSync(path, 'utf-8');

      expect(content, path).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
      expect(content, path).not.toMatch(/url\(\s*['"]?(https?:)?\/\//);
    }
  });

  it('match the ids the server accepts', () => {
    const server = read('../validation/config.js');
    const ids = /const FONTS = \[([^\]]+)\]/.exec(server)![1].match(/'[^']+'/g);

    expect(ids!.map((id) => id.slice(1, -1))).toEqual(FONTS.map((f) => f.id));
  });

  it('apply to form fields only when not the default', () => {
    applyFont('inter');
    expect(document.body.style.getPropertyValue('--font-family')).toContain(
      'Inter Variable'
    );
    expect(document.body.dataset.font).toBe('inter');

    applyFont('roboto');
    expect(document.body.style.getPropertyValue('--font-family')).toBe(
      'Roboto, sans-serif'
    );
    expect(document.body.dataset.font).toBeUndefined();

    applyFont('unknown');
    expect(document.body.dataset.font).toBeUndefined();
  });
});
