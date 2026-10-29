import { App, Bookmark, Category } from '../interfaces';
import { sortData } from './sortData';

export type ItemsKey = 'apps' | 'bookmarks';
export type Item = App | Bookmark;

export interface ItemMove {
  categories: Category[];
  fromCategoryId: number;
  toCategoryId: number;
  /** New orderIds of the target category, only set with custom ordering */
  order: { id: number; orderId: number }[] | null;
}

export const categoryItems = (category: Category, key: ItemsKey): Item[] =>
  category[key];

const withItems = (
  category: Category,
  key: ItemsKey,
  items: Item[]
): Category =>
  key === 'apps'
    ? { ...category, apps: items as App[] }
    : { ...category, bookmarks: items as Bookmark[] };

/**
 * Moves an app or bookmark to `toIndex` of the target category (counted
 * without the moved item). Without custom ordering the target category is
 * sorted the way the server will return it, and moves within one category
 * are meaningless, so they return null like any other no-op.
 */
export const moveItem = (
  categories: Category[],
  key: ItemsKey,
  itemId: number,
  toCategoryId: number,
  toIndex: number,
  ordering: string
): ItemMove | null => {
  const from = categories.find((c) =>
    categoryItems(c, key).some((item) => item.id === itemId)
  );
  const to = categories.find((c) => c.id === toCategoryId);

  if (!from || !to) return null;

  const customOrder = ordering === 'orderId';
  const sameCategory = from.id === to.id;

  if (sameCategory && !customOrder) return null;

  const fromItems = categoryItems(from, key);
  const fromIndex = fromItems.findIndex((item) => item.id === itemId);
  const remaining = fromItems.filter((item) => item.id !== itemId);
  const base = sameCategory ? remaining : categoryItems(to, key);
  const index = Math.min(Math.max(toIndex, 0), base.length);

  if (sameCategory && index === fromIndex) return null;

  const moved = { ...fromItems[fromIndex], categoryId: to.id };
  let target: Item[] = [...base.slice(0, index), moved, ...base.slice(index)];
  let order: ItemMove['order'] = null;

  if (customOrder) {
    target = target.map((item, i) => ({ ...item, orderId: i + 1 }));
    order = target.map(({ id, orderId }) => ({ id, orderId }));
  } else {
    target = sortData<Item>(target, ordering);
  }

  return {
    categories: categories.map((c) => {
      if (c.id === to.id) return withItems(c, key, target);
      if (c.id === from.id) return withItems(c, key, remaining);
      return c;
    }),
    fromCategoryId: from.id,
    toCategoryId: to.id,
    order,
  };
};
