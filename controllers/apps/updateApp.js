const asyncWrapper = require('../../middleware/asyncWrapper');
const App = require('../../models/App');
const ErrorResponse = require('../../utils/ErrorResponse');
const { autoFetchIcon } = require('../../utils/autoFetchIcon');

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

  let body = { ...req.body };

  if (req.file) {
    body.icon = req.file.filename;
  } else {
    body = await autoFetchIcon(body, app);
  }

  app = await app.update(body);

  res.status(200).json({
    success: true,
    data: app,
  });
});

module.exports = updateApp;
