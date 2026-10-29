const asyncWrapper = require('../../middleware/asyncWrapper');
const { syncIntegrations } = require('../../utils/integrationSync');
const loadConfig = require('../../utils/loadConfig');
const { toAdminConfig } = require('../../utils/sanitizeConfig');
const { syncWeatherJobs } = require('../../utils/weatherJobs');
const { writeFile } = require('fs/promises');

// @desc      Update config
// @route     PUT /api/config/
// @access    Private
const updateConfig = asyncWrapper(async (req, res, next) => {
  const existingConfig = await loadConfig();

  const newConfig = {
    ...existingConfig,
    ...req.body,
  };

  await writeFile('data/config.json', JSON.stringify(newConfig));

  await syncWeatherJobs();

  res.status(200).send({
    success: true,
    data: toAdminConfig(newConfig),
  });

  // Apply integration setting changes without waiting for the next scheduled sync
  syncIntegrations();
});

module.exports = updateConfig;
