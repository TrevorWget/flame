import { useSelector } from 'react-redux';

import type { State } from '../store/reducers';
import { isDarkColor } from './statusColors';

export interface ThemedIcons {
  icon: string;
  iconOnDark?: string | null;
  iconOnLight?: string | null;
}

// Any icon not picked as Automatic from selfh.st looks the same on every theme
export const NO_THEMED_ICONS = { iconOnDark: null, iconOnLight: null };

export const followsTheme = (item: ThemedIcons): boolean =>
  Boolean(item.iconOnDark || item.iconOnLight);

/** The icon to show on a dark or light theme, falling back to the standard one */
export const themedIcon = (item: ThemedIcons, isDark: boolean): string =>
  (isDark ? item.iconOnDark : item.iconOnLight) || item.icon;

/**
 * Whether the active theme has a dark background. Built-in, custom and edited
 * themes, and the automatic light/dark switching, all go through setTheme, so
 * this follows every change without a reload.
 */
export const useIsDarkTheme = (): boolean =>
  useSelector((state: State) => isDarkColor(state.theme.activeTheme.colors.background));
