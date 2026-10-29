const asyncWrapper = require('../../middleware/asyncWrapper');

// @desc      Get the session of the current request's cookie or token
// @route     GET /api/auth
// @access    Public
const getSession = asyncWrapper(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      isAuthenticated: req.isAuthenticated,
      expiresAt: req.isAuthenticated ? req.tokenPayload.exp * 1000 : null,
    },
  });
});

module.exports = getSession;
