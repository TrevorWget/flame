const { z } = require('zod');
const {
  idParam,
  visibility,
  flag,
  name,
  reorderList,
  emptyBody,
  writableFields,
} = require('./fields');

// The edit forms send back the loaded category, including its apps/bookmarks
const READ_ONLY = [
  'id',
  'createdAt',
  'updatedAt',
  'orderId',
  'apps',
  'bookmarks',
];

const type = z.enum(['apps', 'bookmarks']);

const createCategory = {
  body: writableFields(
    {
      name,
      type,
      isPublic: visibility.optional(),
    },
    // New categories are pinned according to the pinCategoriesByDefault setting
    [...READ_ONLY, 'isPinned']
  ),
};

const updateCategory = {
  params: idParam,
  body: writableFields(
    {
      name: name.optional(),
      type: type.optional(),
      isPublic: visibility.optional(),
      isPinned: flag.optional(),
    },
    READ_ONLY
  ),
};

const deleteCategory = { params: idParam, body: emptyBody };

const reorderCategories = { body: reorderList('categories') };

module.exports = {
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
};
