import { AppStatusName, ThemeColors } from '../interfaces';

type Rgb = [number, number, number];

export type StatusColors = Record<AppStatusName, string>;

export interface StatusColorOverrides {
  statusColorUp?: string;
  statusColorUnhealthy?: string;
  statusColorDown?: string;
}

// WCAG 2.1 non-text contrast (1.4.11) for graphical objects
export const MIN_STATUS_CONTRAST = 3;

// Used when the user switches from theme colors to custom ones
export const CLASSIC_STATUS_COLORS: StatusColors = {
  up: '#3fb950',
  unhealthy: '#d29922',
  down: '#f85149',
};

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

// Theme colors are 3, 4, 6 or 8 digit hex colors; alpha is ignored
export const parseHex = (color: string): Rgb | null => {
  const hex = color.trim().replace(/^#/, '');

  if (!/^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) {
    return null;
  }

  const full =
    hex.length <= 4
      ? [...hex.slice(0, 3)].map((c) => c + c).join('')
      : hex.slice(0, 6);

  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
};

const toHex = (rgb: Rgb): string =>
  `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

const luminance = (rgb: Rgb): number => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (a: Rgb, b: Rgb): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

/** WCAG contrast ratio of two hex colors, or null if one can't be parsed */
export const contrastRatio = (a: string, b: string): number | null => {
  const [rgbA, rgbB] = [parseHex(a), parseHex(b)];
  return rgbA && rgbB ? ratio(rgbA, rgbB) : null;
};

const mix = (a: Rgb, b: Rgb, weight: number): Rgb =>
  a.map((v, i) => Math.round(v + (b[i] - v) * weight)) as Rgb;

// Themes often use an accent close to the background (e.g. white's #dddddd on
// #ffffff), so colors are moved towards white or black, whichever stands out
// more from the background, until they reach the minimum contrast
const withContrast = (color: Rgb, background: Rgb): Rgb => {
  const target =
    ratio(WHITE, background) >= ratio(BLACK, background) ? WHITE : BLACK;

  for (let step = 0; step <= 20; step++) {
    const candidate = mix(color, target, step / 20);

    if (ratio(candidate, background) >= MIN_STATUS_CONTRAST) {
      return candidate;
    }
  }

  return target;
};

/**
 * Dot colors for the active theme. Flame themes have a background, primary
 * (text) and accent color but no secondary one, so up uses the accent, down the
 * primary color and unhealthy a mix of both. Custom colors from the settings
 * replace the derived ones as they are.
 */
export const statusColors = (
  theme: ThemeColors,
  overrides: StatusColorOverrides = {}
): StatusColors => {
  const background = parseHex(theme.background) || BLACK;
  const primary = parseHex(theme.primary) || WHITE;
  const accent = parseHex(theme.accent) || primary;

  const derived: StatusColors = {
    up: toHex(withContrast(accent, background)),
    unhealthy: toHex(withContrast(mix(accent, primary, 0.5), background)),
    down: toHex(withContrast(primary, background)),
  };

  const custom = (value: string | undefined): string | null =>
    value && parseHex(value) ? value : null;

  return {
    up: custom(overrides.statusColorUp) || derived.up,
    unhealthy: custom(overrides.statusColorUnhealthy) || derived.unhealthy,
    down: custom(overrides.statusColorDown) || derived.down,
  };
};
