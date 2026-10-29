const asyncWrapper = require('../../middleware/asyncWrapper');
const ErrorResponse = require('../../utils/ErrorResponse');
const Bookmark = require('../../models/Bookmark');
const loadConfig = require('../../utils/loadConfig');
const { isAllowedUrl } = require('../../utils/urlSchemes');

// @desc      Update bookmark
// @route     PUT /api/bookmarks/:id
// @access    Public
const updateBookmark = asyncWrapper(async (req, res, next) => {
  const { extraUrlSchemes } = await loadConfig();

  if ('url' in req.body && !isAllowedUrl(req.body.url, extraUrlSchemes)) {
    return next(
      new ErrorResponse('URL is invalid or its scheme is not allowed', 400)
    );
  }

  let bookmark = await Bookmark.findOne({
    where: { id: req.params.id },
  });

  if (!bookmark) {
    return next(
      new ErrorResponse(
        `Bookmark with id of ${req.params.id} was not found`,
        404
      )
    );
  }

  let body = {
    ...req.body,
    categoryId: parseInt(req.body.categoryId),
  };

  if (body.icon) {
    body.icon = body.icon.trim();
  }

  if (req.file) {
    body.icon = req.file.filename;
  }

  bookmark = await bookmark.update(body);

  res.status(200).json({
    success: true,
    data: bookmark,
  });
});

module.exports = updateBookmark;
