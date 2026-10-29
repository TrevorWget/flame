import { Category } from '../interfaces';

// The homepage shows pinned app categories with only their pinned apps;
// /applications lists every app
export const pinnedApps = (categories: Category[]): Category[] =>
  categories
    .filter(({ isPinned }) => isPinned)
    .map((category) => ({
      ...category,
      apps: category.apps.filter(({ isPinned }) => isPinned),
    }));
