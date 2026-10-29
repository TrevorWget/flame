const asyncWrapper = require('../../middleware/asyncWrapper');
const Bookmark = require('../../models/Bookmark');
const ErrorResponse = require('../../utils/ErrorResponse');
const loadConfig = require('../../utils/loadConfig');
const { isAllowedUrl } = require('../../utils/urlSchemes');

// @desc      Create new bookmark
// @route     POST /api/bookmarks
// @access    Public
const createBookmark = asyncWrapper(async (req, res, next) => {
  const { extraUrlSchemes } = await loadConfig();

  if (!isAllowedUrl(req.body.url, extraUrlSchemes)) {
    return next(
      new ErrorResponse('URL is invalid or its scheme is not allowed', 400)
    );
  }

  let bookmark;

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

  bookmark = await Bookmark.create(body);

  res.status(201).json({
    success: true,
    data: bookmark,
  });
});

module.exports = createBookmark;
