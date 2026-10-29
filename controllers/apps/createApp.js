const asyncWrapper = require('../../middleware/asyncWrapper');
const App = require('../../models/App');
const loadConfig = require('../../utils/loadConfig');
const ErrorResponse = require('../../utils/ErrorResponse');
const { isAllowedUrl } = require('../../utils/urlSchemes');

// @desc      Create new app
// @route     POST /api/apps
// @access    Public
const createApp = asyncWrapper(async (req, res, next) => {
  const { pinAppsByDefault, extraUrlSchemes } = await loadConfig();

  let body = { ...req.body };

  if (!isAllowedUrl(body.url, extraUrlSchemes)) {
    return next(
      new ErrorResponse('URL is invalid or its scheme is not allowed', 400)
    );
  }

  if (body.icon) {
    body.icon = body.icon.trim();
  }

  if (req.file) {
    body.icon = req.file.filename;
  }

  const app = await App.create({
    ...body,
    categoryId: parseInt(req.body.categoryId),
    isPinned: pinAppsByDefault,
  });

  res.status(201).json({
    success: true,
    data: app,
  });
});

module.exports = createApp;
