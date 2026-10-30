const asyncWrapper = require('../../middleware/asyncWrapper');
const ErrorResponse = require('../../utils/ErrorResponse');
const Bookmark = require('../../models/Bookmark');
const { autoFetchIcon } = require('../../utils/autoFetchIcon');
const { NO_VARIANTS, clearStaleVariants } = require('../../utils/iconVariants');

// @desc      Update bookmark
// @route     PUT /api/bookmarks/:id
// @access    Public
const updateBookmark = asyncWrapper(async (req, res, next) => {
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

  let body = { ...req.body };

  if (req.file) {
    body = { ...body, icon: req.file.filename, ...NO_VARIANTS };
  } else {
    body = clearStaleVariants(await autoFetchIcon(body, bookmark), bookmark);
  }

  bookmark = await bookmark.update(body);

  res.status(200).json({
    success: true,
    data: bookmark,
  });
});

module.exports = updateBookmark;
