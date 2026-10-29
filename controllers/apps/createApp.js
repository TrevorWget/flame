const asyncWrapper = require('../../middleware/asyncWrapper');
const App = require('../../models/App');
const loadConfig = require('../../utils/loadConfig');
const { autoFetchIcon } = require('../../utils/autoFetchIcon');

// @desc      Create new app
// @route     POST /api/apps
// @access    Public
const createApp = asyncWrapper(async (req, res, next) => {
  const { pinAppsByDefault } = await loadConfig();

  let body = { ...req.body };

  if (req.file) {
    body.icon = req.file.filename;
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
});

module.exports = createApp;
