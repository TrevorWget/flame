const { z } = require('zod');
const loadConfig = require('../utils/loadConfig');
const { DERIVED_KEYS } = require('../utils/sanitizeConfig');
const { isWeatherProvider } = require('../utils/weatherProviders');
const { parseDockerHost } = require('../controllers/apps/docker/dockerHost');
const { isPlainObject } = require('./fields');

const text = (max) => z.string().max(max);

const dockerHost = text(255).superRefine((value, ctx) => {
  try {
    parseDockerHost(value);
  } catch (err) {
    ctx.addIssue({
      code: 'custom',
      message: `Invalid Docker host: ${err.message}`,
    });
  }
});

const coordinate = (limit) => z.number().min(-limit).max(limit).nullable();

const SETTINGS = {
  weatherProvider: z
    .string()
    .refine(isWeatherProvider, 'Unknown weather provider'),
  // Omitting the key keeps the stored one; an empty string clears it
  WEATHER_API_KEY: text(256),
  // An emptied number input is sent as null
  lat: coordinate(90),
  long: coordinate(180),
  isCelsius: z.boolean(),
  customTitle: text(255),
  pinAppsByDefault: z.boolean(),
  pinBookmarksByDefault: z.boolean(),
  pinCategoriesByDefault: z.boolean(),
  hideHeader: z.boolean(),
  useOrdering: z.enum(['createdAt', 'name', 'orderId']),
  appsSameTab: z.boolean(),
  bookmarksSameTab: z.boolean(),
  searchSameTab: z.boolean(),
  hideApps: z.boolean(),
  hideBookmarks: z.boolean(),
  hideEmptyCategories: z.boolean(),
  hideSearch: z.boolean(),
  defaultSearchProvider: text(50),
  secondarySearchProvider: text(50),
  dockerApps: z.boolean(),
  dockerHost,
  kubernetesApps: z.boolean(),
  unpinStoppedApps: z.boolean(),
  useAmericanDate: z.boolean(),
  disableAutofocus: z.boolean(),
  greetingsSchema: text(1000),
  daySchema: text(1000),
  monthSchema: text(1000),
  showTime: z.boolean(),
  defaultTheme: text(255),
  isKilometer: z.boolean(),
  weatherData: z.enum(['cloud', 'humidity']),
  hideDate: z.boolean(),
  extraUrlSchemes: text(500),
  backupSchedule: z.enum(['off', 'daily', 'weekly']),
  backupRetention: z.number().int().min(1).max(365),
  autoFetchIcons: z.boolean(),
  iconFetchAllowPrivate: z.boolean(),
  statusChecks: z.boolean(),
  // Seconds
  statusCheckInterval: z.number().int().min(10).max(86400),
  statusCheckTimeout: z.number().int().min(1).max(60),
  statusCheckDocker: z.boolean(),
};

const isUnchanged = (value, stored) =>
  JSON.stringify(value) === JSON.stringify(stored);

/**
 * The settings pages send back the whole config they loaded, which can include
 * keys from older versions and the server-computed DERIVED_KEYS. Keys whose
 * value matches the stored config are no-ops, so only changed keys are checked.
 */
const updateConfig = {
  body: z.preprocess(async (value) => {
    if (!isPlainObject(value)) return value;

    const stored = await loadConfig();
    const changes = {};

    for (const [key, keyValue] of Object.entries(value)) {
      if (DERIVED_KEYS.includes(key)) continue;
      if (key in stored && isUnchanged(keyValue, stored[key])) continue;

      changes[key] = keyValue;
    }

    return changes;
  }, z.strictObject(SETTINGS).partial()),
};

const updateCSS = {
  body: z.strictObject({ styles: z.string().max(100000) }),
};

module.exports = { SETTINGS, updateConfig, updateCSS };
