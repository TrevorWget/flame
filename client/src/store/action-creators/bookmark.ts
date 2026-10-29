import axios, { AxiosError } from 'axios';
import { Dispatch } from 'redux';

import { ApiResponse, Bookmark, Config, NewBookmark } from '../../interfaces';
import { applyAuth } from '../../utility';
import { ActionType } from '../action-types';
import {
  AddBookmarkAction,
  DeleteBookmarkAction,
  ReorderBookmarksAction,
  SetEditBookmarkAction,
  SortBookmarksAction,
  UpdateBookmarkAction,
} from '../actions/bookmark';


export const addBookmark =
  (formData: NewBookmark | FormData) =>
  async (dispatch: Dispatch<AddBookmarkAction>) => {
    try {
      const res = await axios.post<ApiResponse<Bookmark>>(
        '/api/bookmarks',
        formData,
        { headers: applyAuth() }
      );

      dispatch<any>({
        type: ActionType.createNotification,
        payload: {
          title: 'Success',
          message: `Bookmark created`,
        },
      });

      dispatch({
        type: ActionType.addBookmark,
        payload: res.data.data,
      });

      dispatch<any>(sortBookmarks(res.data.data.categoryId));
    } catch (err) {
      const error = err as AxiosError<{ error: string }>;

      dispatch<any>({
        type: ActionType.createNotification,
        payload: {
          title: 'Error',
          message: error.response?.data.error,
        },
      });
    }
  };


export const deleteBookmark =
  (bookmarkId: number, categoryId: number) =>
  async (dispatch: Dispatch<DeleteBookmarkAction>) => {
    try {
      await axios.delete<ApiResponse<{}>>(`/api/bookmarks/${bookmarkId}`, {
        headers: applyAuth(),
      });

      dispatch<any>({
        type: ActionType.createNotification,
        payload: {
          title: 'Success',
          message: 'Bookmark deleted',
        },
      });

      dispatch({
        type: ActionType.deleteBookmark,
        payload: {
          bookmarkId,
          categoryId,
        },
      });
    } catch (err) {
      console.log(err);
    }
  };

export const updateBookmark =
  (
    bookmarkId: number,
    formData: NewBookmark | FormData,
    category: {
      prev: number;
      curr: number;
    }
  ) =>
  async (
    dispatch: Dispatch<
      DeleteBookmarkAction | AddBookmarkAction | UpdateBookmarkAction
    >
  ) => {
    try {
      const res = await axios.put<ApiResponse<Bookmark>>(
        `/api/bookmarks/${bookmarkId}`,
        formData,
        { headers: applyAuth() }
      );

      dispatch<any>({
        type: ActionType.createNotification,
        payload: {
          title: 'Success',
          message: `Bookmark updated`,
        },
      });

      // Check if category was changed
      const categoryWasChanged = category.curr !== category.prev;

      if (categoryWasChanged) {
        // Delete bookmark from old category
        dispatch({
          type: ActionType.deleteBookmark,
          payload: {
            bookmarkId,
            categoryId: category.prev,
          },
        });

        // Add bookmark to the new category
        dispatch({
          type: ActionType.addBookmark,
          payload: res.data.data,
        });
      } else {
        // Else update only name/url/icon
        dispatch({
          type: ActionType.updateBookmark,
          payload: res.data.data,
        });
      }

      dispatch<any>(sortBookmarks(res.data.data.categoryId));
    } catch (err) {
      const error = err as AxiosError<{ error: string }>;

      dispatch<any>({
        type: ActionType.createNotification,
        payload: {
          title: 'Error',
          message: error.response?.data.error,
        },
      });
    }
  };

export const setEditBookmark =
  (bookmark: Bookmark | null) =>
  (dispatch: Dispatch<SetEditBookmarkAction>) => {
    dispatch({
      type: ActionType.setEditBookmark,
      payload: bookmark,
    });
  };

export const reorderBookmarks =
  (bookmarks: Bookmark[], categoryId: number) =>
  async (dispatch: Dispatch<ReorderBookmarksAction>) => {
    interface ReorderQuery {
      bookmarks: {
        id: number;
        orderId: number;
      }[];
    }

    try {
      const updateQuery: ReorderQuery = { bookmarks: [] };

      bookmarks.forEach((bookmark, index) =>
        updateQuery.bookmarks.push({
          id: bookmark.id,
          orderId: index + 1,
        })
      );

      await axios.put<ApiResponse<{}>>(
        '/api/bookmarks/0/reorder',
        updateQuery,
        { headers: applyAuth() }
      );

      dispatch({
        type: ActionType.reorderBookmarks,
        payload: { bookmarks, categoryId },
      });
    } catch (err) {
      console.log(err);
    }
  };

export const sortBookmarks =
  (categoryId: number) => async (dispatch: Dispatch<SortBookmarksAction>) => {
    try {
      const res = await axios.get<ApiResponse<Config>>('/api/config');

      dispatch({
        type: ActionType.sortBookmarks,
        payload: {
          orderType: res.data.data.useOrdering,
          categoryId,
        },
      });
    } catch (err) {
      console.log(err);
    }
  };
