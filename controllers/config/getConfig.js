const asyncWrapper = require('../../middleware/asyncWrapper');
const loadConfig = require('../../utils/loadConfig');
const { toPublicConfig } = require('../../utils/sanitizeConfig');

// @desc      Get public UI config (allow-listed keys only)
// @route     GET /api/config
// @access    Public
const getConfig = asyncWrapper(async (req, res, next) => {
  const config = await loadConfig();

  res.status(200).json({
    success: true,
    data: toPublicConfig(config),
  });
});

module.exports = getConfig;
