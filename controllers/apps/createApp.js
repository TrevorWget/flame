const asyncWrapper = require('../../middleware/asyncWrapper');
const App = require('../../models/App');
const loadConfig = require('../../utils/loadConfig');
const { autoFetchIcon } = require('../../utils/autoFetchIcon');
const { NO_VARIANTS } = require('../../utils/iconVariants');
const { runStatusChecks } = require('../../utils/statusChecks');

// @desc      Create new app
// @route     POST /api/apps
// @access    Public
const createApp = asyncWrapper(async (req, res, next) => {
  const { pinAppsByDefault } = await loadConfig();

  let body = { ...req.body };

  if (req.file) {
    body = { ...body, icon: req.file.filename, ...NO_VARIANTS };
  } else {
    body = await autoFetchIcon(body);
  }

  const app = await App.create({
    ...body,
    isPinned: pinAppsByDefault,
  });

  res.status(201).json({
    success: true,
    data: app,
  });

  runStatusChecks();
});

module.exports = createApp;
