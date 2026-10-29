const asyncWrapper = require('../../middleware/asyncWrapper');
const sessionInfo = require('../../utils/sessionInfo');

// @desc      Get the session of the current request's cookie, token or proxy header
// @route     GET /api/auth
// @access    Public
const getSession = asyncWrapper(async (req, res) => {
  res.status(200).json({
    success: true,
    data: sessionInfo(req),
  });
});

module.exports = getSession;
