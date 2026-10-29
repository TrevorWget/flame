const asyncWrapper = require('../../middleware/asyncWrapper');
const Category = require('../../models/Category');
const reorderItems = require('../../utils/reorderItems');

// @desc      Reorder categories
// @route     PUT /api/categories/0/reorder
// @access    Public
const reorderCategories = asyncWrapper(async (req, res, next) => {
  await reorderItems(Category, req.body.categories);

  res.status(200).json({
    success: true,
    data: {},
  });
});

module.exports = reorderCategories;
