import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App, Bookmark, Category } from '../../interfaces';
import { configTemplate } from '../../utility/templateObjects/configTemplate';
import { ActionType } from '../action-types';
import { store } from '../store';
import { moveApp, moveBookmark } from './arrange';

vi.mock('axios');

const put = vi.mocked(axios.put);

const model = { createdAt: new Date(), updatedAt: new Date() };

const app = (id: number, categoryId: number, orderId: number): App => ({
  ...model,
  id,
  name: `App ${id}`,
  url: `http://app${id}.local`,
  categoryId,
  icon: '',
  isPublic: true,
  description: '',
  statusCheck: true,
  statusUrl: null,
  orderId,
  isPinned: false,
});

const category = (
  id: number,
  type: string,
  items: (App | Bookmark)[]
): Category => ({
  ...model,
  id,
  name: `Category ${id}`,
  type,
  isPublic: true,
  isPinned: false,
  orderId: id,
  apps: type === 'apps' ? (items as App[]) : [],
  bookmarks: type === 'bookmarks' ? (items as Bookmark[]) : [],
});

const initial = [
  category(1, 'apps', [app(1, 1, 1), app(2, 1, 2)]),
  category(2, 'apps', [app(3, 2, 1)]),
  category(3, 'bookmarks', [{ ...app(4, 3, 1), name: 'Docs' }]),
  category(4, 'bookmarks', []),
];

const appIds = () =>
  store.getState().apps.categories.map((c) => c.apps.map(({ id }) => id));

const notifications = () =>
  store.getState().notification.notifications.map(({ title }) => title);

const setOrdering = (useOrdering: string) =>
  store.dispatch({
    type: ActionType.getConfig,
    payload: { ...configTemplate, useOrdering },
  });

const move = (...args: Parameters<typeof moveApp>) =>
  store.dispatch<any>(moveApp(...args)) as Promise<boolean>;

beforeEach(() => {
  put.mockReset();
  put.mockResolvedValue({ data: { success: true, data: {} } });
  setOrdering('orderId');
  store.dispatch({ type: ActionType.getCategoriesSuccess, payload: initial });
});

describe('moveApp', () => {
  it('updates the store before saving the category and order', async () => {
    let resolve: () => void = () => {};
    put.mockImplementationOnce(
      () => new Promise((r) => (resolve = () => r({ data: {} })))
    );

    const saved = move(2, 2, 0);

    expect(appIds()).toEqual([[1], [2, 3]]);
    expect(put).toHaveBeenCalledWith(
      '/api/apps/2',
      { categoryId: 2 },
      expect.anything()
    );

    resolve();
    await expect(saved).resolves.toBe(true);

    expect(put).toHaveBeenLastCalledWith(
      '/api/apps/0/reorder',
      {
        apps: [
          { id: 2, orderId: 1 },
          { id: 3, orderId: 2 },
        ],
      },
      expect.anything()
    );
    expect(appIds()).toEqual([[1], [2, 3]]);
  });

  it('only saves the order for a move within a category', async () => {
    await move(1, 1, 1);

    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith(
      '/api/apps/0/reorder',
      {
        apps: [
          { id: 2, orderId: 1 },
          { id: 1, orderId: 2 },
        ],
      },
      expect.anything()
    );
    expect(appIds()).toEqual([[2, 1], [3]]);
  });

  it('only saves the category without custom order', async () => {
    setOrdering('name');

    await move(1, 2, 0);

    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith(
      '/api/apps/1',
      { categoryId: 2 },
      expect.anything()
    );
    expect(appIds()).toEqual([[2], [1, 3]]);
  });

  it('explains why a reorder is ignored without custom order', async () => {
    setOrdering('createdAt');

    await expect(move(1, 1, 1)).resolves.toBe(false);

    expect(put).not.toHaveBeenCalled();
    expect(appIds()).toEqual([[1, 2], [3]]);
    expect(notifications().at(-1)).toBe('Info');
  });

  it('rolls back when the category cannot be saved', async () => {
    put.mockRejectedValueOnce({ response: { data: { error: 'Nope' } } });

    await expect(move(2, 2, 0)).resolves.toBe(false);

    expect(put).toHaveBeenCalledTimes(1);
    expect(appIds()).toEqual([[1, 2], [3]]);
    expect(store.getState().notification.notifications.at(-1)).toMatchObject({
      title: 'Error',
      message: 'Could not move App 2: Nope',
    });
  });

  it('puts the category back when the order cannot be saved', async () => {
    put
      .mockResolvedValueOnce({ data: {} })
      .mockRejectedValueOnce(new Error('Network Error'));

    await expect(move(2, 2, 0)).resolves.toBe(false);

    expect(put).toHaveBeenLastCalledWith(
      '/api/apps/2',
      { categoryId: 1 },
      expect.anything()
    );
    expect(appIds()).toEqual([[1, 2], [3]]);
  });
});

describe('moveBookmark', () => {
  it('moves a bookmark into an empty category', async () => {
    await store.dispatch<any>(moveBookmark(4, 4, 0));

    expect(put).toHaveBeenCalledWith(
      '/api/bookmarks/4',
      { categoryId: 4 },
      expect.anything()
    );
    expect(put).toHaveBeenCalledWith(
      '/api/bookmarks/0/reorder',
      { bookmarks: [{ id: 4, orderId: 1 }] },
      expect.anything()
    );

    const [from, to] = store.getState().bookmarks.categories;
    expect(from.bookmarks).toEqual([]);
    expect(to.bookmarks).toMatchObject([{ id: 4, categoryId: 4 }]);
    expect(appIds()).toEqual([[1, 2], [3]]);
  });
});
