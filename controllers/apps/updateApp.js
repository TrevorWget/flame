const asyncWrapper = require('../../middleware/asyncWrapper');
const App = require('../../models/App');
const ErrorResponse = require('../../utils/ErrorResponse');
const { runStatusChecks } = require('../../utils/statusChecks');

// @desc      Update app
// @route     PUT /api/apps/:id
// @access    Public
const updateApp = asyncWrapper(async (req, res, next) => {
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

  const body = { ...req.body };

  if (req.file) {
    body.icon = req.file.filename;
  }

  app = await app.update(body);

  res.status(200).json({
    success: true,
    data: app,
  });

  if (['url', 'statusCheck', 'statusUrl'].some((key) => key in body)) {
    runStatusChecks();
  }
});

module.exports = updateApp;
