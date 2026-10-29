const asyncWrapper = require('../../middleware/asyncWrapper');
const { clearTokenCookie } = require('../../utils/authCookie');

// @desc      Clear this browser's session cookie
// @route     POST /api/auth/logout
// @access    Public
const logout = asyncWrapper(async (req, res) => {
  clearTokenCookie(req, res);

  res.status(200).json({
    success: true,
    data: {},
  });
});

module.exports = logout;
