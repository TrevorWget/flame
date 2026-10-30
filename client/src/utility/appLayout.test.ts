import { describe, expect, it } from 'vitest';

import { configTemplate } from './templateObjects';
import { appLayout, appLayoutKey, appLayoutStyle, appSubtitle } from './appLayout';

const vars = (style: object) => style as Record<string, string | number>;

describe('appLayout', () => {
  it("defaults to Flame's original list layout", () => {
    const layout = appLayout(configTemplate, 'home');

    expect(layout).toEqual({
      tileStyle: 'list',
      density: 'normal',
      iconScale: 100,
      columns: 0,
      hideUrls: false,
      hideDescriptions: false,
      hideStatusDots: false,
    });
    expect(vars(appLayoutStyle(layout))).toEqual({
      '--app-icon-size': '35px',
      '--app-row-gap': '10px',
      '--app-category-gap': '20px',
      '--app-heading-gap': '10px',
      '--app-column-gap': '0px',
      '--app-tile-padding': '8px',
    });
  });

  it('falls back to the defaults for missing or invalid settings', () => {
    const fromOldServer = appLayout({}, 'apps');
    const invalid = appLayout(
      {
        appTileStyle: 'carousel' as never,
        appDensity: 'tight' as never,
        appIconScale: Number.NaN,
        appsPageColumns: 40,
      },
      'apps'
    );

    expect(fromOldServer).toEqual(appLayout(configTemplate, 'apps'));
    expect(invalid).toEqual({ ...fromOldServer, columns: 8 });
  });

  it('takes the columns of each page from its own setting', () => {
    const config = { ...configTemplate, homeAppColumns: 6, appsPageColumns: 2 };

    expect(appLayout(config, 'home').columns).toBe(6);
    expect(appLayout(config, 'apps').columns).toBe(2);
    expect(vars(appLayoutStyle(appLayout(config, 'home')))['--app-columns']).toBe(6);
    expect(appLayoutStyle(appLayout(configTemplate, 'home'))).not.toHaveProperty(
      '--app-columns'
    );
  });

  it('scales the icon of each tile style and spaces it by density', () => {
    const style = vars(
      appLayoutStyle(
        appLayout(
          { appTileStyle: 'tiles', appDensity: 'compact', appIconScale: 150 },
          'home'
        )
      )
    );

    expect(style['--app-icon-size']).toBe('84px');
    expect(style['--app-row-gap']).toBe('4px');
    expect(
      vars(appLayoutStyle(appLayout({ appDensity: 'roomy', appIconScale: 50 }, 'home')))
    ).toMatchObject({ '--app-icon-size': '18px', '--app-column-gap': '24px' });
  });

  it('changes its key with anything that moves the cards', () => {
    const base = appLayout(configTemplate, 'home');

    expect(appLayoutKey({ ...base, columns: 3 })).not.toBe(appLayoutKey(base));
    expect(appLayoutKey({ ...base, iconScale: 120 })).not.toBe(appLayoutKey(base));
    expect(appLayoutKey({ ...base, hideStatusDots: true })).toBe(appLayoutKey(base));
  });
});

describe('appSubtitle', () => {
  const shown = { hideUrls: false, hideDescriptions: false };

  it('shows the description, or the URL without one', () => {
    expect(appSubtitle('Movies', 'jellyfin.lan', shown)).toBe('Movies');
    expect(appSubtitle('', 'jellyfin.lan', shown)).toBe('jellyfin.lan');
  });

  it('falls back to the URL when descriptions are hidden', () => {
    const layout = { ...shown, hideDescriptions: true };

    expect(appSubtitle('Movies', 'jellyfin.lan', layout)).toBe('jellyfin.lan');
  });

  it('shows nothing for hidden URLs', () => {
    const layout = { ...shown, hideUrls: true };

    expect(appSubtitle('Movies', 'jellyfin.lan', layout)).toBe('Movies');
    expect(appSubtitle('', 'jellyfin.lan', layout)).toBe('');
    expect(
      appSubtitle('Movies', 'jellyfin.lan', { hideUrls: true, hideDescriptions: true })
    ).toBe('');
  });
});
