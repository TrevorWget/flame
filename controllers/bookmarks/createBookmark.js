const asyncWrapper = require('../../middleware/asyncWrapper');
const Bookmark = require('../../models/Bookmark');
const { autoFetchIcon } = require('../../utils/autoFetchIcon');
const { NO_VARIANTS } = require('../../utils/iconVariants');

// @desc      Create new bookmark
// @route     POST /api/bookmarks
// @access    Public
const createBookmark = asyncWrapper(async (req, res, next) => {
  let body = { ...req.body };

  if (req.file) {
    body = { ...body, icon: req.file.filename, ...NO_VARIANTS };
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
