import axios, { AxiosError } from 'axios';
import { Dispatch } from 'redux';

import { ApiResponse, App, Config, NewApp } from '../../interfaces';
import { applyAuth } from '../../utility';
import { ActionType } from '../action-types';
import {
  AddAppAction,
  DeleteAppAction,
  PinAppAction,
  ReorderAppsAction,
  SetEditAppAction,
  SortAppsAction,
  UpdateAppAction,
} from '../actions/app';

export const pinApp =
  (app: App) => async (dispatch: Dispatch<PinAppAction>) => {
    try {
      const { id, isPinned, name } = app;
      const res = await axios.put<ApiResponse<App>>(
        `/api/apps/${id}`,
        {
          isPinned: !isPinned,
        },
        {
          headers: applyAuth(),
        }
      );

      const status = isPinned
        ? 'unpinned from Homescreen'
        : 'pinned to Homescreen';

      dispatch<any>({
        type: ActionType.createNotification,
        payload: {
          title: 'Success',
          message: `App ${name} ${status}`,
        },
      });

      dispatch({
        type: ActionType.pinApp,
        payload: res.data.data,
      });
    } catch (err) {
      console.log(err);
    }
  };

  
export const addApp =
  (formData: NewApp | FormData) =>
  async (dispatch: Dispatch<AddAppAction>) => {
    try {
      const res = await axios.post<ApiResponse<App>>(
        '/api/apps',
        formData,
        { headers: applyAuth() }
      );

      dispatch<any>({
        type: ActionType.createNotification,
        payload: {
          title: 'Success',
          message: `App created`,
        },
      });

      dispatch({
        type: ActionType.addApp,
        payload: res.data.data,
      });

      dispatch<any>(sortApps(res.data.data.categoryId));
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


export const deleteApp =
  (appId: number, categoryId: number) =>
  async (dispatch: Dispatch<DeleteAppAction>) => {
    try {
      await axios.delete<ApiResponse<{}>>(`/api/apps/${appId}`, {
        headers: applyAuth(),
      });

      dispatch<any>({
        type: ActionType.createNotification,
        payload: {
          title: 'Success',
          message: 'App deleted',
        },
      });

      dispatch({
        type: ActionType.deleteApp,
        payload: {
          appId,
          categoryId,
        },
      });
    } catch (err) {
      console.log(err);
    }
  };

export const updateApp =
  (
    appId: number,
    formData: NewApp | FormData,
    category: {
      prev: number;
      curr: number;
    }
  ) =>
  async (
    dispatch: Dispatch<
      DeleteAppAction | AddAppAction | UpdateAppAction
    >
  ) => {
    try {
      const res = await axios.put<ApiResponse<App>>(
        `/api/apps/${appId}`,
        formData,
        { headers: applyAuth() }
      );

      dispatch<any>({
        type: ActionType.createNotification,
        payload: {
          title: 'Success',
          message: `App updated`,
        },
      });

      // Check if category was changed
      const categoryWasChanged = category.curr !== category.prev;

      if (categoryWasChanged) {
        // Delete app from old category
        dispatch({
          type: ActionType.deleteApp,
          payload: {
            appId,
            categoryId: category.prev,
          },
        });

        // Add app to the new category
        dispatch({
          type: ActionType.addApp,
          payload: res.data.data,
        });
      } else {
        // Else update only name/url/icon
        dispatch({
          type: ActionType.updateApp,
          payload: res.data.data,
        });
      }

      dispatch<any>(sortApps(res.data.data.categoryId));
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

export const setEditApp =
  (app: App | null) =>
  (dispatch: Dispatch<SetEditAppAction>) => {
    dispatch({
      type: ActionType.setEditApp,
      payload: app,
    });
  };

export const reorderApps =
  (apps: App[], categoryId: number) =>
  async (dispatch: Dispatch<ReorderAppsAction>) => {
    interface ReorderQuery {
      apps: {
        id: number;
        orderId: number;
      }[];
    }

    try {
      const updateQuery: ReorderQuery = { apps: [] };

      apps.forEach((app, index) =>
        updateQuery.apps.push({
          id: app.id,
          orderId: index + 1,
        })
      );

      await axios.put<ApiResponse<{}>>(
        '/api/apps/0/reorder',
        updateQuery,
        { headers: applyAuth() }
      );

      dispatch({
        type: ActionType.reorderApps,
        payload: { apps, categoryId },
      });
    } catch (err) {
      console.log(err);
    }
  };

export const sortApps =
  (categoryId: number) => async (dispatch: Dispatch<SortAppsAction>) => {
    try {
      const res = await axios.get<ApiResponse<Config>>('/api/config');

      dispatch({
        type: ActionType.sortApps,
        payload: {
          orderType: res.data.data.useOrdering,
          categoryId,
        },
      });
    } catch (err) {
      console.log(err);
    }
  };
