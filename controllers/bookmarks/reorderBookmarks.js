const asyncWrapper = require('../../middleware/asyncWrapper');
const Bookmark = require('../../models/Bookmark');
const ErrorResponse = require('../../utils/ErrorResponse');
const reorderItems = require('../../utils/reorderItems');

// @desc      Reorder bookmarks
// @route     PUT /api/bookmarks/0/reorder
// @access    Public
const reorderBookmarks = asyncWrapper(async (req, res, next) => {
  if (!Array.isArray(req.body.bookmarks)) {
    return next(new ErrorResponse('bookmarks must be an array', 400));
  }

  await reorderItems(Bookmark, req.body.bookmarks);

  res.status(200).json({
    success: true,
    data: {},
  });
});

module.exports = reorderBookmarks;
