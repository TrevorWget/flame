import { describe, expect, it } from 'vitest';

import { themes } from '../../../utils/init/themes.json';
import { isDarkColor } from './statusColors';
import { followsTheme, themedIcon } from './themedIcon';

describe('isDarkColor', () => {
  it.each(themes.map((theme) => [theme.name, theme.colors] as const))(
    '%s: the background is the opposite of the text color',
    (_, colors) => {
      expect(isDarkColor(colors.background)).toBe(!isDarkColor(colors.primary));
    }
  );

  it('splits where white and black stand out equally', () => {
    expect(isDarkColor('#242b33')).toBe(true);
    expect(isDarkColor('#000')).toBe(true);
    expect(isDarkColor('#757575')).toBe(true);
    expect(isDarkColor('#777777')).toBe(false);
    expect(isDarkColor('#ffffff')).toBe(false);
    expect(isDarkColor('#F6D305')).toBe(false);
    expect(isDarkColor('#ffffff80')).toBe(false);
  });

  it('counts colors it cannot read as dark, like the default theme', () => {
    expect(isDarkColor('')).toBe(true);
    expect(isDarkColor('rgb(255, 255, 255)')).toBe(true);
  });
});

describe('themedIcon', () => {
  const auto = {
    icon: 'selfhst-jellyfin.svg',
    iconOnDark: 'selfhst-jellyfin_light.svg',
    iconOnLight: 'selfhst-jellyfin_dark.svg',
  };

  it('shows the light version on dark themes and the dark one on light themes', () => {
    expect(themedIcon(auto, true)).toBe('selfhst-jellyfin_light.svg');
    expect(themedIcon(auto, false)).toBe('selfhst-jellyfin_dark.svg');
  });

  it('falls back to the standard icon when a version is missing', () => {
    const lightOnly = { ...auto, iconOnLight: null };
    expect(themedIcon(lightOnly, true)).toBe('selfhst-jellyfin_light.svg');
    expect(themedIcon(lightOnly, false)).toBe('selfhst-jellyfin.svg');

    const legacy = { icon: 'selfhst-jellyfin_light.svg' };
    expect(themedIcon(legacy, true)).toBe('selfhst-jellyfin_light.svg');
    expect(themedIcon(legacy, false)).toBe('selfhst-jellyfin_light.svg');
    expect(themedIcon({ icon: 'movie', iconOnDark: '', iconOnLight: '' }, false)).toBe('movie');
  });

  it('tells whether an item follows the theme', () => {
    expect(followsTheme(auto)).toBe(true);
    expect(followsTheme({ icon: 'x', iconOnDark: null, iconOnLight: 'y' })).toBe(true);
    expect(followsTheme({ icon: 'x' })).toBe(false);
  });
});
