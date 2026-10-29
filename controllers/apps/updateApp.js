const asyncWrapper = require('../../middleware/asyncWrapper');
const App = require('../../models/App');
const ErrorResponse = require('../../utils/ErrorResponse');
const loadConfig = require('../../utils/loadConfig');
const { isAllowedUrl } = require('../../utils/urlSchemes');

// @desc      Update app
// @route     PUT /api/apps/:id
// @access    Public
const updateApp = asyncWrapper(async (req, res, next) => {
  const { extraUrlSchemes } = await loadConfig();

  if ('url' in req.body && !isAllowedUrl(req.body.url, extraUrlSchemes)) {
    return next(
      new ErrorResponse('URL is invalid or its scheme is not allowed', 400)
    );
  }

  let app = await App.findOne({
    where: { id: req.params.id },
  });

  if (!app) {
    return next(
      new ErrorResponse(
        `App with the id of ${req.params.id} was not found`,
        404
      )
    );
  }

  let body = { ...req.body };

  if (body.icon) {
    body.icon = body.icon.trim();
  }

  if (req.file) {
    body.icon = req.file.filename;
  }

  app = await app.update(body);

  res.status(200).json({
    success: true,
    data: app,
  });
});

module.exports = updateApp;
