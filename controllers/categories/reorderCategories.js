const asyncWrapper = require('../../middleware/asyncWrapper');
const Category = require('../../models/Category');
const ErrorResponse = require('../../utils/ErrorResponse');
const reorderItems = require('../../utils/reorderItems');

// @desc      Reorder categories
// @route     PUT /api/categories/0/reorder
// @access    Public
const reorderCategories = asyncWrapper(async (req, res, next) => {
  if (!Array.isArray(req.body.categories)) {
    return next(new ErrorResponse('categories must be an array', 400));
  }

  await reorderItems(Category, req.body.categories);

  res.status(200).json({
    success: true,
    data: {},
  });
});

module.exports = reorderCategories;
