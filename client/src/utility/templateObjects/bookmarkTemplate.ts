import { Bookmark, NewBookmark } from '../../interfaces';

export const newBookmarkTemplate: NewBookmark = {
  name: '',
  url: '',
  categoryId: -1,
  icon: '',
  iconOnDark: null,
  iconOnLight: null,
  isPublic: true,
};

export const bookmarkTemplate: Bookmark = {
  ...newBookmarkTemplate,
  id: -1,
  createdAt: new Date(),
  updatedAt: new Date(),
  orderId: 0,
};
