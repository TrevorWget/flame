export interface ThemeColors {
  background: string;
  primary: string;
  accent: string;
}

export interface Theme {
  name: string;
  colors: ThemeColors;
  isCustom: boolean;
}

export type ThemeMode = 'manual' | 'system' | 'time';

export type ThemeSchedule = 'sun' | 'fixed';

export type ColorScheme = 'light' | 'dark';

export type FontId =
  | 'roboto'
  | 'inter'
  | 'nunito'
  | 'source-serif'
  | 'jetbrains-mono'
  | 'system';

/** Minutes after UTC midnight, worked out by the server from the weather location */
export interface SunTimes {
  sunrise: number | null;
  sunset: number | null;
  polar: 'day' | 'night' | null;
}
