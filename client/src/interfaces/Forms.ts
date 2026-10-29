import { WeatherData, WeatherProvider } from '../types';

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
}
