const asyncWrapper = require('../../middleware/asyncWrapper');
const ErrorResponse = require('../../utils/ErrorResponse');
const Category = require('../../models/Category');
const App = require('../../models/App');
const Bookmark = require('../../models/Bookmark');
const { Sequelize } = require('sequelize');
const loadConfig = require('../../utils/loadConfig');

// @desc      Update category
// @route     PUT /api/categories/:id
// @access    Public
const updateCategory = asyncWrapper(async (req, res, next) => {
  let category = await Category.findOne({
    where: { id: req.params.id },
  });

  if (!category) {
    return next(
      new ErrorResponse(
        `Category with id of ${req.params.id} was not found`,
        404
      )
    );
  }

  await category.update({ ...req.body });

  const { useOrdering: orderType } = await loadConfig();

  const order =
    orderType == 'name'
      ? [
          [Sequelize.fn('lower', Sequelize.col('apps.name')), 'ASC'],
          [Sequelize.fn('lower', Sequelize.col('bookmarks.name')), 'ASC'],
        ]
      : [
          [{ model: App, as: 'apps' }, orderType, 'ASC'],
          [{ model: Bookmark, as: 'bookmarks' }, orderType, 'ASC'],
        ];

  // Same shape as GET /api/categories/:id, apps and bookmarks included
  category = await Category.findOne({
    where: { id: category.id },
    include: [
      { model: App, as: 'apps' },
      { model: Bookmark, as: 'bookmarks' },
    ],
    order,
  });

  res.status(200).json({
    success: true,
    data: category,
  });
});

module.exports = updateCategory;
