const asyncWrapper = require('../../middleware/asyncWrapper');
const ErrorResponse = require('../../utils/ErrorResponse');
const verifyToken = require('../../utils/verifyToken');

// @desc      Verify token
// @route     POST /api/auth/verify
// @access    Public
const validate = asyncWrapper(async (req, res, next) => {
  if (!verifyToken(req.body.token)) {
    return next(new ErrorResponse('Token expired', 401));
  }

  res.status(200).json({
    success: true,
    data: { token: { isValid: true } },
  });
});

module.exports = validate;
