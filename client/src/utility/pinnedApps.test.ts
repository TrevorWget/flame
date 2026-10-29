import { describe, expect, it } from 'vitest';

import { App, Category } from '../interfaces';
import { pinnedApps } from './pinnedApps';

const model = { createdAt: new Date(), updatedAt: new Date() };

const app = (id: number, isPinned: boolean): App => ({
  ...model,
  id,
  name: `App ${id}`,
  url: `http://app${id}`,
  categoryId: 1,
  icon: '',
  isPublic: true,
  description: '',
  statusCheck: true,
  statusUrl: null,
  orderId: id,
  isPinned,
});

const category = (id: number, isPinned: boolean, apps: App[]): Category => ({
  ...model,
  id,
  name: `Category ${id}`,
  type: 'apps',
  isPublic: true,
  isPinned,
  orderId: id,
  apps,
  bookmarks: [],
});

describe('pinnedApps', () => {
  it('keeps pinned categories with only their pinned apps', () => {
    const categories = [
      category(1, true, [app(1, true), app(2, false), app(3, true)]),
      category(2, false, [app(4, true)]),
      category(3, true, [app(5, false)]),
    ];

    const result = pinnedApps(categories);

    expect(result.map(({ id }) => id)).toEqual([1, 3]);
    expect(result[0].apps.map(({ id }) => id)).toEqual([1, 3]);
    expect(result[1].apps).toEqual([]);
  });

  it('leaves the categories in state untouched', () => {
    const categories = [category(1, true, [app(1, true), app(2, false)])];

    pinnedApps(categories);

    expect(categories[0].apps).toHaveLength(2);
  });
});
