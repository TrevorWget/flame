const jwt = require('jsonwebtoken');
const asyncWrapper = require('../../middleware/asyncWrapper');
const ErrorResponse = require('../../utils/ErrorResponse');
const signToken = require('../../utils/signToken');
const sessionInfo = require('../../utils/sessionInfo');
const { setTokenCookie } = require('../../utils/authCookie');
const { isLoginEnabled, checkPassword } = require('../../utils/password');

const { SESSION_DURATIONS } = signToken;

// @desc      Login user
// @route     POST /api/auth/
// @access    Public
const login = asyncWrapper(async (req, res, next) => {
  const { password, duration } = req.body;

  if (!isLoginEnabled()) {
    return next(
      new ErrorResponse(
        'Login is disabled until a non-default PASSWORD is configured',
        503
      )
    );
  }

  if (!SESSION_DURATIONS.includes(duration)) {
    return next(new ErrorResponse('Invalid session duration', 400));
  }

  if (!checkPassword(password)) {
    return next(new ErrorResponse('Invalid credentials', 401));
  }

  const token = signToken(duration);
  const tokenPayload = jwt.decode(token);

  setTokenCookie(req, res, token, new Date(tokenPayload.exp * 1000));

  res.status(200).json({
    success: true,
    data: sessionInfo({ tokenPayload }),
  });
});

module.exports = login;
