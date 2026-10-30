import { describe, expect, it } from 'vitest';

import { Config, Theme } from '../interfaces';
import { configTemplate } from './templateObjects';
import {
  copyName,
  isThemePAB,
  pickColorScheme,
  timeToMinutes,
} from './themeMode';

const config = (overrides: Partial<Config>): Config => ({
  ...configTemplate,
  ...overrides,
});

// Local time, like the fixed schedule
const at = (time: string) => new Date(`2026-10-30T${time}:00`);
const utc = (time: string) => new Date(`2026-10-30T${time}:00Z`);

describe('pickColorScheme', () => {
  it('leaves the theme alone in manual mode', () => {
    expect(pickColorScheme(configTemplate, at('12:00'), true)).toBeNull();
  });

  it('follows the device setting', () => {
    const system = config({ themeMode: 'system' });

    expect(pickColorScheme(system, at('12:00'), true)).toBe('dark');
    expect(pickColorScheme(system, at('12:00'), false)).toBe('light');
  });

  it('switches at fixed local times', () => {
    const fixed = config({
      themeMode: 'time',
      themeSchedule: 'fixed',
      themeLightTime: '07:00',
      themeDarkTime: '19:30',
    });

    expect(pickColorScheme(fixed, at('06:59'), false)).toBe('dark');
    expect(pickColorScheme(fixed, at('07:00'), false)).toBe('light');
    expect(pickColorScheme(fixed, at('19:29'), true)).toBe('light');
    expect(pickColorScheme(fixed, at('19:30'), false)).toBe('dark');
  });

  it('handles a light period that runs past midnight', () => {
    const nightShift = config({
      themeMode: 'time',
      themeSchedule: 'fixed',
      themeLightTime: '22:00',
      themeDarkTime: '06:00',
    });

    expect(pickColorScheme(nightShift, at('23:00'), false)).toBe('light');
    expect(pickColorScheme(nightShift, at('03:00'), false)).toBe('light');
    expect(pickColorScheme(nightShift, at('12:00'), false)).toBe('dark');
  });

  it('follows sunrise and sunset in UTC, also when sunset is after UTC midnight', () => {
    // Los Angeles in July: up 12:45 UTC, down 03:08 UTC
    const sun = config({
      themeMode: 'time',
      themeSchedule: 'sun',
      sunTimes: { sunrise: 12 * 60 + 45, sunset: 3 * 60 + 8, polar: null },
    });

    expect(pickColorScheme(sun, utc('12:00'), false)).toBe('dark');
    expect(pickColorScheme(sun, utc('20:00'), false)).toBe('light');
    expect(pickColorScheme(sun, utc('02:00'), false)).toBe('light');
    expect(pickColorScheme(sun, utc('04:00'), false)).toBe('dark');
  });

  it('keeps one theme through polar day and night', () => {
    const polar = (p: 'day' | 'night') =>
      config({
        themeMode: 'time',
        themeSchedule: 'sun',
        sunTimes: { sunrise: null, sunset: null, polar: p },
      });

    expect(pickColorScheme(polar('day'), utc('00:30'), false)).toBe('light');
    expect(pickColorScheme(polar('night'), utc('12:00'), false)).toBe('dark');
  });

  it('uses the fixed times when there is no weather location', () => {
    const noLocation = config({
      themeMode: 'time',
      themeSchedule: 'sun',
      sunTimes: null,
      themeLightTime: '08:00',
      themeDarkTime: '18:00',
    });

    expect(pickColorScheme(noLocation, at('07:00'), false)).toBe('dark');
    expect(pickColorScheme(noLocation, at('09:00'), false)).toBe('light');
  });
});

describe('helpers', () => {
  it('recognises saved theme colors', () => {
    expect(isThemePAB('#EFFBFF;#6EE2FF;#242B33')).toBe(true);
    expect(isThemePAB('tron')).toBe(false);
    expect(isThemePAB('#fff;#000')).toBe(false);
    expect(isThemePAB(null)).toBe(false);
  });

  it('reads times', () => {
    expect(timeToMinutes('07:30')).toBe(450);
    expect(timeToMinutes('24:00')).toBeNull();
  });

  it('names copies so they never clash', () => {
    const themes = ['tron', 'tron copy', 'tron copy 2'].map(
      (name): Theme => ({
        name,
        isCustom: true,
        colors: {
          background: '#000000',
          primary: '#ffffff',
          accent: '#ff0066',
        },
      })
    );

    expect(copyName('neon', themes)).toBe('neon copy');
    expect(copyName('tron', themes)).toBe('tron copy 3');
  });
});
