const asyncWrapper = require('../../middleware/asyncWrapper');
const { clearTokenCookie } = require('../../utils/authCookie');
const { bumpTokenVersion } = require('../../utils/tokenVersion');

// @desc      Invalidate every issued token, on all devices
// @route     POST /api/auth/logout-all
// @access    Private
const logoutAll = asyncWrapper(async (req, res) => {
  bumpTokenVersion();
  clearTokenCookie(req, res);

  res.status(200).json({
    success: true,
    data: {},
  });
});

module.exports = logoutAll;
