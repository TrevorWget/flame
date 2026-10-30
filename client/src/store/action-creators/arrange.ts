import axios, { AxiosError } from 'axios';
import { Dispatch } from 'redux';

import { applyAuth } from '../../utility';
import { categoryItems, ItemsKey, moveItem } from '../../utility/moveItem';
import { ActionType } from '../action-types';
import type { State } from '../reducers';
import { getCategories } from './category';

const endpoints: Record<ItemsKey, string> = {
  apps: '/api/apps',
  bookmarks: '/api/bookmarks',
};

const errorMessage = (err: unknown): string => {
  const error = err as AxiosError<{ error?: string }>;
  return error.response?.data?.error || error.message || 'Request failed';
};

/**
 * Moves an item right away and saves it with the regular endpoints: PUT
 * /:id for the new category, then /0/reorder for the custom order. Resolves
 * to whether the move was saved; on failure the previous state is restored.
 */
const arrangeItem =
  (key: ItemsKey) =>
  (itemId: number, toCategoryId: number, toIndex: number) =>
  async (dispatch: Dispatch<any>, getState: () => State): Promise<boolean> => {
    const { categories } = getState()[key];
    const ordering = getState().config.config.useOrdering;

    const from = categories.find((c) =>
      categoryItems(c, key).some((item) => item.id === itemId)
    );
    const item = from && categoryItems(from, key).find((i) => i.id === itemId);

    if (!from || !item) return false;

    if (from.id === toCategoryId && ordering !== 'orderId') {
      dispatch({
        type: ActionType.createNotification,
        payload: {
          title: 'Info',
          message:
            'Custom order is disabled. Set Sorting type to Custom order in Settings > General to reorder within a category',
        },
      });
      return false;
    }

    const move = moveItem(
      categories,
      key,
      itemId,
      toCategoryId,
      toIndex,
      ordering
    );

    if (!move) return false;

    dispatch({
      type: ActionType.arrangeItems,
      payload: { type: key, categories: move.categories },
    });

    const endpoint = endpoints[key];
    const headers = applyAuth();
    let categorySaved = false;

    try {
      if (move.fromCategoryId !== move.toCategoryId) {
        await axios.put(
          `${endpoint}/${itemId}`,
          { categoryId: move.toCategoryId },
          { headers }
        );
        categorySaved = true;
      }

      if (move.order) {
        await axios.put(
          `${endpoint}/0/reorder`,
          { [key]: move.order },
          { headers }
        );
      }

      return true;
    } catch (err) {
      dispatch({
        type: ActionType.arrangeItems,
        payload: { type: key, categories },
      });

      if (categorySaved) {
        // The order failed after the category was saved; put it back
        try {
          await axios.put(
            `${endpoint}/${itemId}`,
            { categoryId: move.fromCategoryId },
            { headers }
          );
        } catch {
          dispatch<any>(getCategories());
        }
      }

      dispatch({
        type: ActionType.createNotification,
        payload: {
          title: 'Error',
          message: `Could not move ${item.name}: ${errorMessage(err)}`,
        },
      });

      return false;
    }
  };

export const moveApp = arrangeItem('apps');
export const moveBookmark = arrangeItem('bookmarks');
