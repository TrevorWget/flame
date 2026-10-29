const asyncWrapper = require('../../middleware/asyncWrapper');
const App = require('../../models/App');
const reorderItems = require('../../utils/reorderItems');

// @desc      Reorder apps
// @route     PUT /api/apps/0/reorder
// @access    Public
const reorderApps = asyncWrapper(async (req, res, next) => {
  await reorderItems(App, req.body.apps);

  res.status(200).json({
    success: true,
    data: {},
  });
});

module.exports = reorderApps;
