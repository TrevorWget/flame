import { describe, expect, it } from 'vitest';

import { App, Bookmark, Category } from '../interfaces';
import { moveItem } from './moveItem';

const app = (
  id: number,
  categoryId: number,
  orderId: number,
  name = `App ${id}`
): App => ({
  id,
  name,
  url: `http://app${id}.local`,
  categoryId,
  icon: '',
  isPublic: true,
  description: '',
  statusCheck: true,
  statusUrl: null,
  orderId,
  isPinned: false,
  createdAt: new Date(2026, 0, id),
  updatedAt: new Date(2026, 0, id),
});

const category = (
  id: number,
  apps: App[],
  bookmarks: Bookmark[] = []
): Category => ({
  id,
  name: `Category ${id}`,
  type: apps.length ? 'apps' : 'bookmarks',
  isPublic: true,
  isPinned: false,
  orderId: id,
  apps,
  bookmarks,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const ids = (c: Category) => c.apps.map(({ id }) => id);

const categories = [
  category(1, [app(1, 1, 1), app(2, 1, 2), app(3, 1, 3)]),
  category(2, [app(4, 2, 1), app(5, 2, 2)]),
  category(3, []),
];

describe('moveItem', () => {
  it('moves an app to a position in another category with custom order', () => {
    const move = moveItem(categories, 'apps', 2, 2, 1, 'orderId')!;

    expect(ids(move.categories[0])).toEqual([1, 3]);
    expect(ids(move.categories[1])).toEqual([4, 2, 5]);
    expect(move.categories[1].apps[1]).toMatchObject({ id: 2, categoryId: 2 });
    expect(move).toMatchObject({ fromCategoryId: 1, toCategoryId: 2 });
    expect(move.order).toEqual([
      { id: 4, orderId: 1 },
      { id: 2, orderId: 2 },
      { id: 5, orderId: 3 },
    ]);
  });

  it('reorders within a category', () => {
    const move = moveItem(categories, 'apps', 1, 1, 2, 'orderId')!;

    expect(ids(move.categories[0])).toEqual([2, 3, 1]);
    expect(move.categories[0].apps.map(({ orderId }) => orderId)).toEqual([
      1, 2, 3,
    ]);
    expect(move.categories[1]).toBe(categories[1]);
  });

  it('moves into an empty category and clamps the index', () => {
    const move = moveItem(categories, 'apps', 5, 3, 99, 'orderId')!;

    expect(ids(move.categories[1])).toEqual([4]);
    expect(ids(move.categories[2])).toEqual([5]);
    expect(move.order).toEqual([{ id: 5, orderId: 1 }]);
  });

  it('sorts the target category without custom order', () => {
    const named = [
      category(1, [app(1, 1, 1, 'Sonarr')]),
      category(2, [app(2, 2, 1, 'Jellyfin'), app(3, 2, 2, 'Radarr')]),
    ];

    const move = moveItem(named, 'apps', 1, 2, 0, 'name')!;

    expect(move.categories[1].apps.map(({ name }) => name)).toEqual([
      'Jellyfin',
      'Radarr',
      'Sonarr',
    ]);
    expect(move.order).toBeNull();
  });

  it('ignores moves that change nothing', () => {
    expect(moveItem(categories, 'apps', 2, 1, 1, 'orderId')).toBeNull();
    expect(moveItem(categories, 'apps', 1, 1, 2, 'createdAt')).toBeNull();
    expect(moveItem(categories, 'apps', 42, 2, 0, 'orderId')).toBeNull();
    expect(moveItem(categories, 'apps', 1, 42, 0, 'orderId')).toBeNull();
  });

  it('moves bookmarks', () => {
    const bookmark = (id: number, categoryId: number): Bookmark => ({
      ...app(id, categoryId, id),
      name: `Bookmark ${id}`,
    });
    const bookmarkCategories = [
      category(1, [], [bookmark(1, 1), bookmark(2, 1)]),
      category(2, [], [bookmark(3, 2)]),
    ];

    const move = moveItem(bookmarkCategories, 'bookmarks', 1, 2, 1, 'orderId')!;

    expect(move.categories[0].bookmarks.map(({ id }) => id)).toEqual([2]);
    expect(move.categories[1].bookmarks.map(({ id }) => id)).toEqual([3, 1]);
    expect(move.categories[1].bookmarks[1].categoryId).toBe(2);
  });
});
