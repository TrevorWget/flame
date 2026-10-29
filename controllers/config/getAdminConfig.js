const asyncWrapper = require('../../middleware/asyncWrapper');
const loadConfig = require('../../utils/loadConfig');
const { toAdminConfig } = require('../../utils/sanitizeConfig');

// @desc      Get full config (secrets redacted)
// @route     GET /api/config/admin
// @access    Private
const getAdminConfig = asyncWrapper(async (req, res, next) => {
  const config = await loadConfig();

  res.status(200).json({
    success: true,
    data: toAdminConfig(config),
  });
});

module.exports = getAdminConfig;
