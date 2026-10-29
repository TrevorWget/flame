const ErrorResponse = require('../utils/ErrorResponse');
const { CSRF_HEADER, isCsrfSafe } = require('../utils/authCookie');

const requireCsrf = (req, res, next) => {
  if (!isCsrfSafe(req)) {
    return next(new ErrorResponse(`Missing ${CSRF_HEADER} header`, 403));
  }

  next();
};

module.exports = requireCsrf;
