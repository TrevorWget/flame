const ErrorResponse = require('./ErrorResponse');

const DEFAULT_PROVIDER = 'weatherapi';

// WMO weather interpretation codes (Open-Meteo) mapped to the weatherapi.com
// condition codes the stored data and the client icon mapping are based on.
const WMO_CONDITIONS = {
  0: [1000, 'Clear sky'],
  1: [1003, 'Mainly clear'],
  2: [1003, 'Partly cloudy'],
  3: [1009, 'Overcast'],
  45: [1135, 'Fog'],
  48: [1147, 'Freezing fog'],
  51: [1150, 'Light drizzle'],
  53: [1153, 'Drizzle'],
  55: [1153, 'Dense drizzle'],
  56: [1168, 'Light freezing drizzle'],
  57: [1171, 'Dense freezing drizzle'],
  61: [1183, 'Slight rain'],
  63: [1189, 'Moderate rain'],
  65: [1195, 'Heavy rain'],
  66: [1198, 'Light freezing rain'],
  67: [1201, 'Heavy freezing rain'],
  71: [1213, 'Slight snow'],
  73: [1219, 'Moderate snow'],
  75: [1225, 'Heavy snow'],
  77: [1213, 'Snow grains'],
  80: [1240, 'Slight rain showers'],
  81: [1243, 'Moderate rain showers'],
  82: [1246, 'Violent rain showers'],
  85: [1255, 'Slight snow showers'],
  86: [1258, 'Heavy snow showers'],
  95: [1273, 'Thunderstorm'],
  96: [1276, 'Thunderstorm with slight hail'],
  99: [1276, 'Thunderstorm with heavy hail'],
};

const round1 = (value) => Math.round(value * 10) / 10;

const hasWeatherKey = (config) =>
  typeof config.WEATHER_API_KEY === 'string' && config.WEATHER_API_KEY !== '';

const getCoordinates = ({ lat, long }) => {
  const latitude = Number(lat);
  const longitude = Number(long);

  if (
    lat === '' ||
    long === '' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    throw new ErrorResponse('Latitude or longitude is invalid', 400);
  }

  return { latitude, longitude };
};

// Upstream error bodies are shown to the admin, so keep them short
const upstreamReason = (reason) =>
  typeof reason === 'string' ? reason.slice(0, 200) : undefined;

const providers = {
  weatherapi: {
    name: 'Weather API',
    requiresKey: true,
    buildUrl: (config) => {
      const { latitude, longitude } = getCoordinates(config);
      const params = new URLSearchParams({
        key: config.WEATHER_API_KEY,
        q: `${latitude},${longitude}`,
      });

      return `https://api.weatherapi.com/v1/current.json?${params}`;
    },
    parse: ({ current }) => ({
      externalLastUpdate: current.last_updated,
      tempC: current.temp_c,
      tempF: current.temp_f,
      isDay: current.is_day,
      cloud: current.cloud,
      conditionText: current.condition.text,
      conditionCode: current.condition.code,
      humidity: current.humidity,
      windK: current.wind_kph,
      windM: current.wind_mph,
    }),
    errorReason: (body) => upstreamReason(body?.error?.message),
  },

  'open-meteo': {
    name: 'Open-Meteo',
    requiresKey: false,
    buildUrl: (config) => {
      const { latitude, longitude } = getCoordinates(config);
      const params = new URLSearchParams({
        latitude,
        longitude,
        current: [
          'temperature_2m',
          'relative_humidity_2m',
          'is_day',
          'cloud_cover',
          'weather_code',
          'wind_speed_10m',
        ].join(','),
        timezone: 'auto',
      });

      return `https://api.open-meteo.com/v1/forecast?${params}`;
    },
    parse: ({ current }) => {
      const [conditionCode, conditionText] = WMO_CONDITIONS[
        current.weather_code
      ] || [1000, 'Unknown'];

      return {
        externalLastUpdate: String(current.time).replace('T', ' '),
        tempC: current.temperature_2m,
        tempF: round1((current.temperature_2m * 9) / 5 + 32),
        isDay: current.is_day,
        cloud: current.cloud_cover,
        conditionText,
        conditionCode,
        humidity: current.relative_humidity_2m,
        windK: current.wind_speed_10m,
        windM: round1(current.wind_speed_10m / 1.609344),
      };
    },
    errorReason: (body) => upstreamReason(body?.reason),
  },
};

const isWeatherProvider = (id) =>
  Object.prototype.hasOwnProperty.call(providers, id);

const getWeatherProviderId = (config) =>
  isWeatherProvider(config.weatherProvider)
    ? config.weatherProvider
    : DEFAULT_PROVIDER;

const getWeatherProvider = (config) => providers[getWeatherProviderId(config)];

const isWeatherEnabled = (config) =>
  !getWeatherProvider(config).requiresKey || hasWeatherKey(config);

module.exports = {
  DEFAULT_PROVIDER,
  WMO_CONDITIONS,
  hasWeatherKey,
  isWeatherProvider,
  getWeatherProviderId,
  getWeatherProvider,
  isWeatherEnabled,
};
