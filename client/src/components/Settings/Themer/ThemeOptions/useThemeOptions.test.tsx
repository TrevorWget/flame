import { act, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Config } from '../../../../interfaces';
import { ActionType } from '../../../../store/action-types';
import { store } from '../../../../store/store';
import {
  configTemplate,
  parsePABToTheme,
  statusColors,
} from '../../../../utility';
import { useStatusColors } from '../../../Apps/AppStatus/useStatusColors';
import { useThemeOptions } from './useThemeOptions';

const LIGHT = '#35342f;#37bbe4;#f1f2f0';
const DARK = '#EFFBFF;#6EE2FF;#242B33';
const DEFAULT = '#222222;#dddddd;#ffffff';

let dots: ReturnType<typeof useStatusColors>;

const Harness = () => {
  useThemeOptions();
  dots = useStatusColors();
  return null;
};

let prefersDark = false;
const listeners = new Set<() => void>();

const setPrefersDark = (dark: boolean) => {
  prefersDark = dark;
  act(() => listeners.forEach((listener) => listener()));
};

const loadConfig = (config: Partial<Config>) =>
  act(() => {
    store.dispatch({
      type: ActionType.getConfig,
      payload: {
        ...configTemplate,
        defaultTheme: DEFAULT,
        lightTheme: LIGHT,
        darkTheme: DARK,
        ...config,
      },
    });
  });

const activeColors = () => store.getState().theme.activeTheme.colors;

const renderHarness = () =>
  render(
    <Provider store={store}>
      <Harness />
    </Provider>
  );

beforeEach(() => {
  localStorage.clear();
  window.matchMedia = vi.fn().mockImplementation(() => ({
    get matches() {
      return prefersDark;
    },
    addEventListener: (_: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      listeners.delete(listener),
  }));
});

afterEach(() => {
  vi.useRealTimers();
  listeners.clear();
});

describe('useThemeOptions', () => {
  it('leaves the theme alone in manual mode', () => {
    store.dispatch<any>({
      type: ActionType.setTheme,
      payload: parsePABToTheme(DEFAULT),
    });
    renderHarness();
    loadConfig({ themeMode: 'manual' });

    expect(activeColors()).toEqual(parsePABToTheme(DEFAULT));
  });

  it('follows the device setting, status dots included', () => {
    prefersDark = true;
    renderHarness();
    loadConfig({ themeMode: 'system' });

    expect(activeColors()).toEqual(parsePABToTheme(DARK));
    expect(document.body.style.getPropertyValue('--color-background')).toBe(
      '#242B33'
    );
    expect(dots).toEqual(statusColors(parsePABToTheme(DARK)));

    setPrefersDark(false);

    expect(activeColors()).toEqual(parsePABToTheme(LIGHT));
    expect(dots).toEqual(statusColors(parsePABToTheme(LIGHT)));
    // Automatic switches don't count as a pick
    expect(localStorage.theme).toBeUndefined();
  });

  it('switches at the fixed times and goes back to the manual theme', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-10-30T18:59:30'));

    renderHarness();
    loadConfig({
      themeMode: 'time',
      themeSchedule: 'fixed',
      themeDarkTime: '19:00',
    });
    expect(activeColors()).toEqual(parsePABToTheme(LIGHT));

    act(() => {
      vi.advanceTimersByTime(60 * 1000);
    });
    expect(activeColors()).toEqual(parsePABToTheme(DARK));

    loadConfig({ themeMode: 'manual' });
    expect(activeColors()).toEqual(parsePABToTheme(DEFAULT));
  });

  it('applies the font', () => {
    renderHarness();
    loadConfig({ fontFamily: 'jetbrains-mono' });

    expect(document.body.dataset.font).toBe('jetbrains-mono');
    expect(document.body.style.getPropertyValue('--font-family')).toContain(
      'JetBrains Mono'
    );

    loadConfig({ fontFamily: 'roboto' });
    expect(document.body.dataset.font).toBeUndefined();
  });
});
