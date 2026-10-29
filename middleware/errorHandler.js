const { STATUS_CODES } = require('http');
const ErrorResponse = require('../utils/ErrorResponse');
const Logger = require('../utils/Logger');
const logger = new Logger();

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || err.status;
  if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599) {
    statusCode = 500;
  }

  const isDev = process.env.NODE_ENV == 'development';

  // ErrorResponse messages and client errors from Express middleware (e.g. bad
  // JSON) are written for the user; anything else may leak internals
  // (Sequelize, filesystem paths, upstream APIs).
  const isPublic =
    statusCode < 500 && (err instanceof ErrorResponse || err.expose === true);

  logger.log(`${req.method} ${req.originalUrl}: ${err.message}`, 'ERROR');

  if (isDev) {
    console.log(err);
  } else if (!isPublic) {
    console.log(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    error:
      isDev || isPublic
        ? err.message || 'Server Error'
        : STATUS_CODES[statusCode] || 'Server Error',
  });
};

module.exports = errorHandler;
