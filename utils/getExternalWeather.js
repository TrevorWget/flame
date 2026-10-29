const Weather = require('../models/Weather');
const axios = require('axios');
const loadConfig = require('./loadConfig');
const ErrorResponse = require('./ErrorResponse');
const {
  getWeatherProvider,
  isWeatherEnabled,
} = require('./weatherProviders');

const getExternalWeather = async () => {
  const config = await loadConfig();
  const provider = getWeatherProvider(config);

  if (!isWeatherEnabled(config)) {
    throw new ErrorResponse('Weather is not configured', 400);
  }

  const url = provider.buildUrl(config);

  let weather;
  try {
    const res = await axios.get(url, { timeout: 10000 });
    weather = provider.parse(res.data);
  } catch (err) {
    // Never include the error itself: its config.url carries the API key
    const reason = provider.errorReason(err.response?.data);
    const error = new ErrorResponse(
      `${provider.name} request failed${reason ? `: ${reason}` : ''}`,
      502
    );
    error.isUpstream = true;
    throw error;
  }

  return await Weather.create(weather);
};

module.exports = getExternalWeather;
