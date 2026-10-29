import { DockerSettingsForm, GeneralForm, ThemeSettingsForm, UISettingsForm, WeatherForm } from '../../interfaces';

export const uiSettingsTemplate: UISettingsForm = {
  customTitle: document.title,
  hideHeader: false,
  hideApps: false,
  hideBookmarks: false,
  hideEmptyCategories: true,
  useAmericanDate: false,
  greetingsSchema: 'Good evening!;Good afternoon!;Good morning!;Good night!',
  daySchema: 'Sunday;Monday;Tuesday;Wednesday;Thursday;Friday;Saturday',
  monthSchema:
    'January;February;March;April;May;June;July;August;September;October;November;December',
  showTime: false,
  hideDate: false,
  hideSearch: false,
  disableAutofocus: false,
};

export const weatherSettingsTemplate: WeatherForm = {
  weatherProvider: 'weatherapi',
  lat: 0,
  long: 0,
  isCelsius: true,
  weatherData: 'cloud',
};

export const generalSettingsTemplate: GeneralForm = {
  searchSameTab: false,
  defaultSearchProvider: 'l',
  secondarySearchProvider: 'd',
  pinAppsByDefault: true,
  pinBookmarksByDefault: true,
  pinCategoriesByDefault: true,
  useOrdering: 'createdAt',
  appsSameTab: false,
  bookmarksSameTab: false,
  extraUrlSchemes: '',
  statusChecks: false,
  statusCheckInterval: 60,
  statusCheckTimeout: 5,
  statusCheckDocker: false,
};

export const dockerSettingsTemplate: DockerSettingsForm = {
  dockerApps: true,
  dockerHost: 'localhost',
  kubernetesApps: true,
  unpinStoppedApps: true,
};

export const themeSettingsTemplate: ThemeSettingsForm = {
  defaultTheme: 'tron',
};
