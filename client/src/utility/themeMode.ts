import { ColorScheme, Config, SunTimes, Theme } from '../interfaces';
import { parseHex } from './statusColors';

type SchemeConfig = Pick<
  Config,
  | 'themeMode'
  | 'themeSchedule'
  | 'themeLightTime'
  | 'themeDarkTime'
  | 'sunTimes'
>;

/** primary;accent;background with three valid hex colors */
export const isThemePAB = (
  value: string | null | undefined
): value is string => {
  const parts = (value || '').split(';');
  return parts.length === 3 && parts.every((part) => parseHex(part) !== null);
};

export const timeToMinutes = (time: string): number | null => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

export const minutesToTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(
    minutes % 60
  ).padStart(2, '0')}`;

// True from `start` up to `end`, wrapping past midnight when end < start
const isBetween = (now: number, start: number, end: number): boolean =>
  start <= end ? now >= start && now < end : now >= start || now < end;

/** Sun times are in UTC, so `now` is compared in UTC as well */
export const isSunUp = (sun: SunTimes, now: Date): boolean => {
  if (sun.polar) return sun.polar === 'day';
  if (sun.sunrise === null || sun.sunset === null) return true;

  return isBetween(
    now.getUTCHours() * 60 + now.getUTCMinutes(),
    sun.sunrise,
    sun.sunset
  );
};

/**
 * Which theme the automatic modes want right now, or null in manual mode.
 * The sun schedule needs sun times from the server, which it only has with a
 * weather location; without them the fixed (local) times are used.
 */
export const pickColorScheme = (
  config: SchemeConfig,
  now: Date,
  prefersDark: boolean
): ColorScheme | null => {
  switch (config.themeMode) {
    case 'system':
      return prefersDark ? 'dark' : 'light';

    case 'time': {
      if (config.themeSchedule === 'sun' && config.sunTimes) {
        return isSunUp(config.sunTimes, now) ? 'light' : 'dark';
      }

      const light = timeToMinutes(config.themeLightTime) ?? 7 * 60;
      const dark = timeToMinutes(config.themeDarkTime) ?? 19 * 60;

      if (light === dark) return 'light';

      return isBetween(now.getHours() * 60 + now.getMinutes(), light, dark)
        ? 'light'
        : 'dark';
    }

    default:
      return null;
  }
};

/** "<name> copy", or "<name> copy 2" and up when that is taken */
export const copyName = (name: string, themes: Theme[]): string => {
  const taken = new Set(themes.map((t) => t.name));
  const base = `${name} copy`;

  if (!taken.has(base)) return base;

  let n = 2;
  while (taken.has(`${base} ${n}`)) n++;

  return `${base} ${n}`;
};
