const { hasWeatherKey, isWeatherEnabled } = require('./weatherProviders');

// Keys safe to expose to unauthenticated visitors. Anything not listed here
// (including keys added in the future) is admin-only by default.
const PUBLIC_KEYS = [
  'customTitle',
  'hideHeader',
  'useOrdering',
  'appsSameTab',
  'bookmarksSameTab',
  'searchSameTab',
  'hideApps',
  'hideBookmarks',
  'hideEmptyCategories',
  'hideSearch',
  'defaultSearchProvider',
  'secondarySearchProvider',
  'useAmericanDate',
  'disableAutofocus',
  'greetingsSchema',
  'daySchema',
  'monthSchema',
  'showTime',
  'defaultTheme',
  'isCelsius',
  'isKilometer',
  'weatherProvider',
  'weatherData',
  'hideDate',
  'extraUrlSchemes',
  'statusChecks',
  'statusCheckInterval',
  'statusColorUp',
  'statusColorUnhealthy',
  'statusColorDown',
];

// Never returned by any endpoint, even to authenticated admins.
const SECRET_KEYS = ['WEATHER_API_KEY'];

// Computed by the server; must never be written back to config.json.
const DERIVED_KEYS = ['hasWeatherKey', 'weatherEnabled'];

const addDerivedKeys = (target, config) => {
  target.hasWeatherKey = hasWeatherKey(config);
  target.weatherEnabled = isWeatherEnabled(config);
};

const toPublicConfig = (config) => {
  const publicConfig = {};

  for (const key of PUBLIC_KEYS) {
    if (key in config) {
      publicConfig[key] = config[key];
    }
  }

  addDerivedKeys(publicConfig, config);

  return publicConfig;
};

const toAdminConfig = (config) => {
  const adminConfig = { ...config };

  for (const key of SECRET_KEYS) {
    delete adminConfig[key];
  }

  addDerivedKeys(adminConfig, config);

  return adminConfig;
};

module.exports = {
  PUBLIC_KEYS,
  SECRET_KEYS,
  DERIVED_KEYS,
  toPublicConfig,
  toAdminConfig,
};
