const asyncWrapper = require('./asyncWrapper');
const ErrorResponse = require('../utils/ErrorResponse');

const formatIssue = ({ path, message }) =>
  path.length ? `${path.join('.')}: ${message}` : message;

/**
 * Validates req.params, req.query and req.body against zod schemas and
 * replaces them with the parsed values, so controllers only see known fields.
 * On multipart routes this must run after the upload middleware.
 */
const validate = (schemas) =>
  asyncWrapper(async (req, res, next) => {
    for (const part of ['params', 'query', 'body']) {
      const schema = schemas[part];

      if (!schema) continue;

      const result = await schema.safeParseAsync(req[part] ?? {});

      if (!result.success) {
        return next(
          new ErrorResponse(
            result.error.issues.map(formatIssue).join('; '),
            400
          )
        );
      }

      // req.query is a getter in Express 5
      Object.defineProperty(req, part, {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }

    next();
  });

module.exports = validate;
