const ErrorResponse = require('../utils/ErrorResponse');
const { parseDockerHost } = require('../controllers/apps/docker/dockerHost');

// Rejects config updates with a dockerHost Flame couldn't connect to
const validateDockerHost = (req, res, next) => {
  if (req.body && 'dockerHost' in req.body) {
    try {
      parseDockerHost(req.body.dockerHost);
    } catch (err) {
      return next(new ErrorResponse(`Invalid Docker host: ${err.message}`, 400));
    }
  }

  next();
};

module.exports = validateDockerHost;
