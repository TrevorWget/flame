const jwt = require('jsonwebtoken');
const asyncWrapper = require('../../middleware/asyncWrapper');
const ErrorResponse = require('../../utils/ErrorResponse');
const signToken = require('../../utils/signToken');
const { setTokenCookie } = require('../../utils/authCookie');
const { isLoginEnabled, checkPassword } = require('../../utils/password');

// Must match the session duration options in the client's AuthForm
const ALLOWED_DURATIONS = ['1h', '1d', '14d', '30d', '1y'];

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

  if (!ALLOWED_DURATIONS.includes(duration)) {
    return next(new ErrorResponse('Invalid session duration', 400));
  }

  if (!checkPassword(password)) {
    return next(new ErrorResponse('Invalid credentials', 401));
  }

  const token = signToken(duration);
  const expiresAt = jwt.decode(token).exp * 1000;

  setTokenCookie(req, res, token, new Date(expiresAt));

  res.status(200).json({
    success: true,
    data: { isAuthenticated: true, expiresAt },
  });
});

module.exports = login;
