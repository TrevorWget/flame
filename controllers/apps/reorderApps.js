const asyncWrapper = require('../../middleware/asyncWrapper');
const App = require('../../models/App');
const ErrorResponse = require('../../utils/ErrorResponse');
const reorderItems = require('../../utils/reorderItems');

// @desc      Reorder apps
// @route     PUT /api/apps/0/reorder
// @access    Public
const reorderApps = asyncWrapper(async (req, res, next) => {
  if (!Array.isArray(req.body.apps)) {
    return next(new ErrorResponse('apps must be an array', 400));
  }

  await reorderItems(App, req.body.apps);

  res.status(200).json({
    success: true,
    data: {},
  });
});

module.exports = reorderApps;
