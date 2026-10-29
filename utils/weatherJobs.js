const schedule = require('node-schedule');
const getExternalWeather = require('./getExternalWeather');
const clearWeatherData = require('./clearWeatherData');
const Sockets = require('../Sockets');
const Logger = require('./Logger');
const loadConfig = require('./loadConfig');
const { isWeatherEnabled } = require('./weatherProviders');
const logger = new Logger();

const UPDATE_JOB = 'updateWeather';
const CLEAR_JOB = 'clearWeather';

const broadcastWeather = (weatherData) => {
  const weatherSocket = Sockets.getSocket('weather');

  if (weatherSocket) {
    weatherSocket.socket.send(JSON.stringify(weatherData));
  }
};

const updateWeather = async () => {
  try {
    broadcastWeather(await getExternalWeather());
  } catch (err) {
    logger.log(err.message, 'ERROR');
  }
};

const isScheduled = () => Boolean(schedule.scheduledJobs[UPDATE_JOB]);

// Starts or stops the weather jobs to match the current config. Safe to call
// repeatedly; the update job reads the config on every run, so provider and
// location changes don't need a reschedule.
const syncWeatherJobs = async () => {
  const enabled = isWeatherEnabled(await loadConfig());

  if (enabled && !isScheduled()) {
    // Update weather data every 15 minutes
    schedule.scheduleJob(UPDATE_JOB, '0 */15 * * * *', updateWeather);

    // Clear old weather data every 4 hours
    schedule.scheduleJob(CLEAR_JOB, '0 5 */4 * * *', clearWeatherData);

    logger.log('Weather jobs started');
  } else if (!enabled && isScheduled()) {
    schedule.cancelJob(UPDATE_JOB);
    schedule.cancelJob(CLEAR_JOB);

    logger.log('Weather jobs stopped');
  }

  return enabled;
};

module.exports = {
  syncWeatherJobs,
  broadcastWeather,
  isWeatherScheduled: isScheduled,
};
