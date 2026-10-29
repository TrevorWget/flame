const asyncWrapper = require('../../middleware/asyncWrapper');
const Bookmark = require('../../models/Bookmark');
const { autoFetchIcon } = require('../../utils/autoFetchIcon');

// @desc      Create new bookmark
// @route     POST /api/bookmarks
// @access    Public
const createBookmark = asyncWrapper(async (req, res, next) => {
  let body = { ...req.body };

  if (req.file) {
    body.icon = req.file.filename;
  } else {
    body = await autoFetchIcon(body);
  }

  const bookmark = await Bookmark.create(body);

  res.status(201).json({
    success: true,
    data: bookmark,
  });
});

module.exports = createBookmark;
