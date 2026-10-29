// Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const { join } = require('path');

// loadConfig reads data/config.json relative to the working directory
const tmp = fs.mkdtempSync(join(os.tmpdir(), 'flame-weather-'));
fs.mkdirSync(join(tmp, 'data'));
process.chdir(tmp);

const writeConfig = (config) =>
  fs.writeFileSync(join(tmp, 'data/config.json'), JSON.stringify(config));

const axios = require('axios');
const schedule = require('node-schedule');
const Weather = require('../models/Weather');
const getExternalWeather = require('../utils/getExternalWeather');
const { syncWeatherJobs, isWeatherScheduled } = require('../utils/weatherJobs');
const { toPublicConfig, toAdminConfig } = require('../utils/sanitizeConfig');
const {
  WMO_CONDITIONS,
  getWeatherProvider,
  isWeatherEnabled,
} = require('../utils/weatherProviders');

const SECRET = 'k3y&q=0,0#frag';

test.after(() => {
  schedule.gracefulShutdown();
  process.chdir(__dirname);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('weatherapi request uses https and encodes the key and coordinates', () => {
  const url = new URL(
    getWeatherProvider({}).buildUrl({
      WEATHER_API_KEY: SECRET,
      lat: '52.22',
      long: -21.01,
    })
  );

  assert.strictEqual(url.protocol, 'https:');
  assert.strictEqual(url.host, 'api.weatherapi.com');
  assert.deepStrictEqual([...url.searchParams.keys()], ['key', 'q']);
  assert.strictEqual(url.searchParams.get('key'), SECRET);
  assert.strictEqual(url.searchParams.get('q'), '52.22,-21.01');
});

test('open-meteo request uses https and never sends the API key', () => {
  const url = new URL(
    getWeatherProvider({ weatherProvider: 'open-meteo' }).buildUrl({
      WEATHER_API_KEY: SECRET,
      lat: 52.22,
      long: 21.01,
    })
  );

  assert.strictEqual(url.protocol, 'https:');
  assert.strictEqual(url.host, 'api.open-meteo.com');
  assert.strictEqual(url.searchParams.get('latitude'), '52.22');
  assert.strictEqual(url.searchParams.get('longitude'), '21.01');
  assert.ok(!url.href.includes('k3y'));
});

test('invalid coordinates are rejected before any request', () => {
  const provider = getWeatherProvider({ weatherProvider: 'open-meteo' });

  for (const [lat, long] of [
    ['52.2&key=x', 0],
    ['', 0],
    [91, 0],
    [0, -181],
    [null, undefined],
  ]) {
    assert.throws(() => provider.buildUrl({ lat, long }), {
      statusCode: 400,
    });
  }
});

test('weather is enabled by key for weatherapi and always for open-meteo', () => {
  assert.strictEqual(isWeatherEnabled({ WEATHER_API_KEY: '' }), false);
  assert.strictEqual(isWeatherEnabled({ WEATHER_API_KEY: 'x' }), true);
  assert.strictEqual(
    isWeatherEnabled({ weatherProvider: 'nope', WEATHER_API_KEY: '' }),
    false
  );
  assert.strictEqual(
    isWeatherEnabled({ weatherProvider: 'open-meteo', WEATHER_API_KEY: '' }),
    true
  );
});

test('config responses expose weather state but never the key', () => {
  const config = {
    weatherProvider: 'weatherapi',
    WEATHER_API_KEY: SECRET,
    lat: 1,
    long: 2,
  };

  for (const sanitized of [toPublicConfig(config), toAdminConfig(config)]) {
    assert.ok(!JSON.stringify(sanitized).includes('k3y'));
    assert.strictEqual(sanitized.weatherProvider, 'weatherapi');
    assert.strictEqual(sanitized.hasWeatherKey, true);
    assert.strictEqual(sanitized.weatherEnabled, true);
  }

  assert.ok(!('lat' in toPublicConfig(config)));
});

test('open-meteo response is converted to the stored weather shape', () => {
  const weather = getWeatherProvider({ weatherProvider: 'open-meteo' }).parse({
    current: {
      time: '2026-10-28T21:45',
      temperature_2m: 10,
      relative_humidity_2m: 81,
      is_day: 0,
      cloud_cover: 64,
      weather_code: 61,
      wind_speed_10m: 16.1,
    },
  });

  assert.deepStrictEqual(weather, {
    externalLastUpdate: '2026-10-28 21:45',
    tempC: 10,
    tempF: 50,
    isDay: 0,
    cloud: 64,
    conditionText: 'Slight rain',
    conditionCode: 1183,
    humidity: 81,
    windK: 16.1,
    windM: 10,
  });
});

test('every WMO code maps to a condition code the client has an icon for', () => {
  const iconMapping = fs.readFileSync(
    join(__dirname, '../client/src/components/UI/Icons/WeatherIcon/IconMapping.ts'),
    'utf-8'
  );
  const iconCodes = new Set(
    [...iconMapping.matchAll(/code: (\d+)/g)].map((m) => Number(m[1]))
  );

  for (const [wmo, [code]] of Object.entries(WMO_CONDITIONS)) {
    assert.ok(iconCodes.has(code), `WMO ${wmo} -> ${code}`);
  }
});

test('upstream failures report the provider error without leaking the key', async (t) => {
  writeConfig({ weatherProvider: 'weatherapi', WEATHER_API_KEY: SECRET, lat: 1, long: 2 });

  t.mock.method(axios, 'get', async (url) => {
    const err = new Error(`Request failed for ${url}`);
    err.config = { url };
    err.response = { status: 401, data: { error: { code: 2008, message: 'API key has been disabled.' } } };
    throw err;
  });

  await assert.rejects(getExternalWeather(), (err) => {
    assert.strictEqual(err.statusCode, 502);
    assert.strictEqual(err.message, 'Weather API request failed: API key has been disabled.');
    assert.ok(!err.message.includes('k3y'));
    return true;
  });
});

test('weather is not requested when no provider is usable', async (t) => {
  writeConfig({ weatherProvider: 'weatherapi', WEATHER_API_KEY: '', lat: 1, long: 2 });
  const get = t.mock.method(axios, 'get');

  await assert.rejects(getExternalWeather(), { statusCode: 400 });
  assert.strictEqual(get.mock.callCount(), 0);
});

test('successful fetch stores the parsed weather', async (t) => {
  writeConfig({ weatherProvider: 'open-meteo', lat: 52.22, long: 21.01 });

  const get = t.mock.method(axios, 'get', async () => ({
    data: {
      current: {
        time: '2026-10-28T21:45',
        temperature_2m: 3.2,
        relative_humidity_2m: 90,
        is_day: 1,
        cloud_cover: 100,
        weather_code: 3,
        wind_speed_10m: 5,
      },
    },
  }));
  const create = t.mock.method(Weather, 'create', async (data) => data);

  const weather = await getExternalWeather();

  assert.match(get.mock.calls[0].arguments[0], /^https:\/\/api\.open-meteo\.com\//);
  assert.strictEqual(create.mock.callCount(), 1);
  assert.strictEqual(weather.conditionCode, 1009);
  assert.strictEqual(weather.tempF, 37.8);
});

test('weatherapi response is stored unchanged', async (t) => {
  writeConfig({ weatherProvider: 'weatherapi', WEATHER_API_KEY: SECRET, lat: 1, long: 2 });

  t.mock.method(axios, 'get', async () => ({
    data: {
      current: {
        last_updated: '2026-10-28 21:45',
        temp_c: 11.1,
        temp_f: 52,
        is_day: 0,
        cloud: 75,
        condition: { text: 'Light rain', code: 1183 },
        humidity: 88,
        wind_kph: 9.4,
        wind_mph: 5.8,
      },
    },
  }));
  t.mock.method(Weather, 'create', async (data) => data);

  assert.deepStrictEqual(await getExternalWeather(), {
    externalLastUpdate: '2026-10-28 21:45',
    tempC: 11.1,
    tempF: 52,
    isDay: 0,
    cloud: 75,
    conditionText: 'Light rain',
    conditionCode: 1183,
    humidity: 88,
    windK: 9.4,
    windM: 5.8,
  });
});

test('weather jobs start and stop when the config changes at runtime', async () => {
  writeConfig({ weatherProvider: 'weatherapi', WEATHER_API_KEY: '' });
  assert.strictEqual(await syncWeatherJobs(), false);
  assert.strictEqual(isWeatherScheduled(), false);

  writeConfig({ weatherProvider: 'weatherapi', WEATHER_API_KEY: 'new-key' });
  assert.strictEqual(await syncWeatherJobs(), true);
  assert.strictEqual(isWeatherScheduled(), true);
  const job = schedule.scheduledJobs.updateWeather;

  // Already running: not rescheduled (no duplicate jobs)
  assert.strictEqual(await syncWeatherJobs(), true);
  assert.strictEqual(schedule.scheduledJobs.updateWeather, job);

  writeConfig({ weatherProvider: 'open-meteo', WEATHER_API_KEY: '' });
  assert.strictEqual(await syncWeatherJobs(), true);
  assert.strictEqual(schedule.scheduledJobs.updateWeather, job);

  writeConfig({ weatherProvider: 'weatherapi', WEATHER_API_KEY: '' });
  assert.strictEqual(await syncWeatherJobs(), false);
  assert.strictEqual(isWeatherScheduled(), false);
  assert.strictEqual(schedule.scheduledJobs.clearWeather, undefined);
});
