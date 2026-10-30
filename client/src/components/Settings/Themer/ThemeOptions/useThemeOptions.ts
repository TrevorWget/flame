import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { setTheme } from '../../../../store/action-creators';
import { State } from '../../../../store/reducers';
import {
  applyFont,
  isThemePAB,
  parsePABToTheme,
  pickColorScheme,
} from '../../../../utility';

const DARK_QUERY = '(prefers-color-scheme: dark)';

const prefersDark = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia(DARK_QUERY).matches;

const usePrefersDark = (enabled: boolean): boolean => {
  const [dark, setDark] = useState(prefersDark);

  useEffect(() => {
    if (!enabled || typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia(DARK_QUERY);
    const listener = () => setDark(query.matches);

    listener();
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, [enabled]);

  return dark;
};

// Re-renders every minute while the theme follows the time of day
const useMinute = (enabled: boolean): Date => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!enabled) return;

    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  return now;
};

/**
 * Applies the dashboard font and, outside manual mode, switches between the
 * light and dark themes. A theme picked by hand stays until the next switch.
 */
export const useThemeOptions = (): void => {
  const { config, loading } = useSelector((state: State) => state.config);
  const dispatch = useDispatch();

  const dark = usePrefersDark(!loading && config.themeMode === 'system');
  const now = useMinute(!loading && config.themeMode === 'time');

  useEffect(() => {
    if (!loading) applyFont(config.fontFamily);
  }, [config.fontFamily, loading]);

  const scheme = loading ? null : pickColorScheme(config, now, dark);
  const pab =
    scheme === 'light'
      ? config.lightTheme
      : scheme === 'dark'
      ? config.darkTheme
      : null;
  const target = isThemePAB(pab) ? pab : null;
  const wasAutomatic = useRef(false);

  useEffect(() => {
    if (target) {
      wasAutomatic.current = true;
      dispatch<any>(setTheme(parsePABToTheme(target), false));
      return;
    }

    // Back to manual: the browser's own pick, or the default theme
    if (wasAutomatic.current) {
      wasAutomatic.current = false;
      const manual = localStorage.theme || config.defaultTheme;

      if (isThemePAB(manual)) {
        dispatch<any>(setTheme(parsePABToTheme(manual), false));
      }
    }
  }, [target, config.defaultTheme, dispatch]);
};
