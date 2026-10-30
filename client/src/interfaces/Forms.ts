import { WeatherData, WeatherProvider } from '../types';
import { BackupSchedule } from './Backup';
import { FontId, ThemeMode, ThemeSchedule } from './Theme';

export interface WeatherForm {
  weatherProvider: WeatherProvider;
  WEATHER_API_KEY?: string;
  lat: number;
  long: number;
  isCelsius: boolean;
  weatherData: WeatherData;
}

export interface GeneralForm {
  defaultSearchProvider: string;
  secondarySearchProvider: string;
  searchSameTab: boolean;
  pinAppsByDefault: boolean;
  pinBookmarksByDefault: boolean;
  pinCategoriesByDefault: boolean;
  useOrdering: string;
  appsSameTab: boolean;
  bookmarksSameTab: boolean;
  extraUrlSchemes: string;
  autoFetchIcons: boolean;
  iconFetchAllowPrivate: boolean;
  statusChecks: boolean;
  statusCheckInterval: number;
  statusCheckTimeout: number;
  statusCheckSlow: number;
  statusCheckDocker: boolean;
  statusColorUp: string;
  statusColorUnhealthy: string;
  statusColorDown: string;
}

export interface UISettingsForm {
  customTitle: string;
  hideHeader: boolean;
  hideApps: boolean;
  hideBookmarks: boolean;
  hideEmptyCategories: boolean;
  useAmericanDate: boolean;
  greetingsSchema: string;
  daySchema: string;
  monthSchema: string;
  showTime: boolean;
  hideDate: boolean;
  hideSearch: boolean;
  disableAutofocus: boolean;
}

export interface DockerSettingsForm {
  dockerApps: boolean;
  dockerHost: string;
  kubernetesApps: boolean;
  unpinStoppedApps: boolean;
}

export interface ThemeSettingsForm {
  defaultTheme: string;
  themeMode: ThemeMode;
  lightTheme: string;
  darkTheme: string;
  themeSchedule: ThemeSchedule;
  themeLightTime: string;
  themeDarkTime: string;
  fontFamily: FontId;
}

export interface BackupSettingsForm {
  backupSchedule: BackupSchedule;
  backupRetention: number;
}
