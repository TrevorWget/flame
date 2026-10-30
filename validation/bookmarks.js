const {
  id,
  idParam,
  visibility,
  name,
  url,
  icon,
  iconVariant,
  reorderList,
  emptyBody,
  writableFields,
} = require('./fields');

const READ_ONLY = ['id', 'createdAt', 'updatedAt', 'orderId'];

const createBookmark = {
  body: writableFields(
    {
      name,
      url,
      categoryId: id,
      icon: icon.optional(),
      iconOnDark: iconVariant.optional(),
      iconOnLight: iconVariant.optional(),
      isPublic: visibility.optional(),
    },
    READ_ONLY
  ),
};

const updateBookmark = {
  params: idParam,
  body: writableFields(
    {
      name: name.optional(),
      url: url.optional(),
      categoryId: id.optional(),
      icon: icon.optional(),
      iconOnDark: iconVariant.optional(),
      iconOnLight: iconVariant.optional(),
      isPublic: visibility.optional(),
    },
    READ_ONLY
  ),
};

const deleteBookmark = { params: idParam, body: emptyBody };

const reorderBookmarks = { body: reorderList('bookmarks') };

module.exports = {
  createBookmark,
  updateBookmark,
  deleteBookmark,
  reorderBookmarks,
};
