import { beforeEach, describe, expect, it } from 'vitest';

import { App, Bookmark, Category } from '../../interfaces';
import { ActionType } from '../action-types';
import { store } from '../store';

const model = { createdAt: new Date(), updatedAt: new Date() };

const app: App = {
  ...model,
  id: 11,
  name: 'Jellyfin',
  url: 'http://jellyfin',
  categoryId: 1,
  icon: '',
  isPublic: true,
  description: '',
  statusCheck: true,
  statusUrl: null,
  orderId: 1,
  isPinned: false,
};

const bookmark: Bookmark = {
  ...model,
  id: 21,
  name: 'Docs',
  url: 'http://docs',
  categoryId: 2,
  icon: '',
  isPublic: true,
  orderId: 1,
};

const category = (overrides: Partial<Category>): Category => ({
  ...model,
  id: 0,
  name: 'Category',
  type: 'apps',
  isPublic: true,
  isPinned: false,
  orderId: 1,
  apps: [],
  bookmarks: [],
  ...overrides,
});

const appCategory = category({ id: 1, apps: [app] });
const bookmarkCategory = category({
  id: 2,
  type: 'bookmarks',
  bookmarks: [bookmark],
});

// The category alone, as PUT /api/categories/:id used to return it
const withoutContents = (c: Category) => {
  const rest: Partial<Category> = { ...c };
  delete rest.apps;
  delete rest.bookmarks;
  return rest as Category;
};

beforeEach(() => {
  store.dispatch({
    type: ActionType.getCategoriesSuccess,
    payload: [appCategory, bookmarkCategory],
  });
});

describe.each([
  ['apps', appCategory],
  ['bookmarks', bookmarkCategory],
] as const)('%s category edits', (slice, stored) => {
  it.each([
    [ActionType.pinCategory, { isPinned: true }],
    [ActionType.updateCategory, { isPublic: false }],
  ] as const)('%s keeps the apps and bookmarks', (type, change) => {
    store.dispatch({
      type,
      payload: withoutContents({ ...stored, ...change }),
    });

    const [updated] = store.getState()[slice].categories;

    expect(updated).toMatchObject({ id: stored.id, ...change });
    expect(updated.apps).toEqual(stored.apps);
    expect(updated.bookmarks).toEqual(stored.bookmarks);
  });
});
