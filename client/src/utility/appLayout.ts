import { CSSProperties } from 'react';

import { AppDensity, AppTileStyle, LayoutSettingsForm } from '../interfaces';

export type AppLayoutPage = 'home' | 'apps';

export interface AppLayout {
  tileStyle: AppTileStyle;
  density: AppDensity;
  iconScale: number;
  // 0 picks the columns from the screen width
  columns: number;
  hideUrls: boolean;
  hideDescriptions: boolean;
  hideStatusDots: boolean;
}

export const MIN_ICON_SCALE = 50;
export const MAX_ICON_SCALE = 200;
export const MAX_APP_COLUMNS = 8;

// Icon edge in px at 100%
export const ICON_SIZES: Record<AppTileStyle, number> = { list: 35, tiles: 56 };

interface Spacing {
  // Between apps
  row: number;
  // Below each category
  category: number;
  // Below a category's name
  heading: number;
  // Between category columns
  column: number;
  // Around each icon tile
  tile: number;
}

// "normal" is Flame's original spacing
export const DENSITIES: Record<AppDensity, Spacing> = {
  compact: { row: 4, category: 12, heading: 6, column: 0, tile: 4 },
  normal: { row: 10, category: 20, heading: 10, column: 0, tile: 8 },
  roomy: { row: 16, category: 32, heading: 14, column: 24, tile: 12 },
};

const clampInt = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;

/**
 * The app layout for a page. Settings missing from the config (e.g. a public
 * config from an older server) fall back to Flame's original look.
 */
export const appLayout = (
  config: Partial<LayoutSettingsForm>,
  page: AppLayoutPage
): AppLayout => ({
  tileStyle: config.appTileStyle === 'tiles' ? 'tiles' : 'list',
  density:
    config.appDensity && config.appDensity in DENSITIES
      ? config.appDensity
      : 'normal',
  iconScale: clampInt(config.appIconScale, MIN_ICON_SCALE, MAX_ICON_SCALE, 100),
  columns: clampInt(
    page === 'home' ? config.homeAppColumns : config.appsPageColumns,
    0,
    MAX_APP_COLUMNS,
    0
  ),
  hideUrls: !!config.hideAppUrls,
  hideDescriptions: !!config.hideAppDescriptions,
  hideStatusDots: !!config.hideStatusDots,
});

export const appIconSize = ({ tileStyle, iconScale }: AppLayout): number =>
  Math.round((ICON_SIZES[tileStyle] * iconScale) / 100);

// Custom properties read by the app grid, card and arrange styles
export const appLayoutStyle = (layout: AppLayout): CSSProperties => {
  const spacing = DENSITIES[layout.density];
  const style: Record<string, string | number> = {
    '--app-icon-size': `${appIconSize(layout)}px`,
    '--app-row-gap': `${spacing.row}px`,
    '--app-category-gap': `${spacing.category}px`,
    '--app-heading-gap': `${spacing.heading}px`,
    '--app-column-gap': `${spacing.column}px`,
    '--app-tile-padding': `${spacing.tile}px`,
  };

  if (layout.columns) style['--app-columns'] = layout.columns;

  return style as CSSProperties;
};

// Changes whenever the grid's columns or card sizes may change without a resize
export const appLayoutKey = (layout: AppLayout): string =>
  [layout.tileStyle, layout.density, layout.iconScale, layout.columns].join(':');

/** The line under an app's name: its description, else its URL, unless hidden */
export const appSubtitle = (
  description: string,
  displayUrl: string,
  layout: Pick<AppLayout, 'hideUrls' | 'hideDescriptions'>
): string => {
  if (description && !layout.hideDescriptions) return description;

  return layout.hideUrls ? '' : displayUrl;
};
