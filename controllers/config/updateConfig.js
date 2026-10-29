const asyncWrapper = require('../../middleware/asyncWrapper');
const loadConfig = require('../../utils/loadConfig');
const { DERIVED_KEYS, toAdminConfig } = require('../../utils/sanitizeConfig');
const { isWeatherProvider } = require('../../utils/weatherProviders');
const { syncWeatherJobs } = require('../../utils/weatherJobs');
const ErrorResponse = require('../../utils/ErrorResponse');
const { writeFile } = require('fs/promises');

// @desc      Update config
// @route     PUT /api/config/
// @access    Private
const updateConfig = asyncWrapper(async (req, res, next) => {
  const existingConfig = await loadConfig();

  const body = { ...req.body };

  for (const key of DERIVED_KEYS) {
    delete body[key];
  }

  // Omitting the key keeps the stored one; an empty string clears it
  if (typeof body.WEATHER_API_KEY !== 'string') {
    delete body.WEATHER_API_KEY;
  }

  if ('weatherProvider' in body && !isWeatherProvider(body.weatherProvider)) {
    return next(new ErrorResponse('Unknown weather provider', 400));
  }

  const newConfig = {
    ...existingConfig,
    ...body,
  };

  await writeFile('data/config.json', JSON.stringify(newConfig));

  await syncWeatherJobs();

  res.status(200).send({
    success: true,
    data: toAdminConfig(newConfig),
  });
});

module.exports = updateConfig;
