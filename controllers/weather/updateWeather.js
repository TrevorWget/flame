const asyncWrapper = require('../../middleware/asyncWrapper');
const getExternalWeather = require('../../utils/getExternalWeather');
const { broadcastWeather } = require('../../utils/weatherJobs');
const Logger = require('../../utils/Logger');
const logger = new Logger();

// @desc      Update weather
// @route     GET /api/weather/update
// @access    Private
const updateWeather = asyncWrapper(async (req, res, next) => {
  let weather;

  try {
    weather = await getExternalWeather();
  } catch (err) {
    // The error handler hides 5xx messages; upstream failures are built from
    // the provider name and its error text, which the admin needs to see
    if (err.isUpstream) {
      logger.log(`${req.method} ${req.originalUrl}: ${err.message}`, 'ERROR');

      return res.status(err.statusCode).json({
        success: false,
        error: err.message,
      });
    }

    throw err;
  }

  broadcastWeather(weather);

  res.status(200).json({
    success: true,
    data: weather,
  });
});

module.exports = updateWeather;
