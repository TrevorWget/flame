import { Dispatch } from 'redux';
import {
  AddThemeAction,
  DeleteThemeAction,
  EditThemeAction,
  FetchThemesAction,
  SetThemeAction,
  UpdateThemeAction,
} from '../actions/theme';
import { ActionType } from '../action-types';
import { Theme, ApiResponse, ThemeColors } from '../../interfaces';
import { applyAuth, parseThemeToPAB } from '../../utility';
import axios, { AxiosError } from 'axios';
import type { State } from '../reducers';
import { getAdminConfig } from './config';

export const setTheme =
  (colors: ThemeColors, remeberTheme: boolean = true) =>
  (dispatch: Dispatch<SetThemeAction>) => {
    if (remeberTheme) {
      localStorage.setItem('theme', parseThemeToPAB(colors));
    }

    for (const [key, value] of Object.entries(colors)) {
      document.body.style.setProperty(`--color-${key}`, value);
    }

    dispatch({
      type: ActionType.setTheme,
      payload: colors,
    });
  };

export const fetchThemes =
  () => async (dispatch: Dispatch<FetchThemesAction>) => {
    try {
      const res = await axios.get<ApiResponse<Theme[]>>('/api/themes');

      dispatch({
        type: ActionType.fetchThemes,
        payload: res.data.data,
      });
    } catch (err) {
      console.log(err);
    }
  };

export const addTheme =
  (theme: Theme) => async (dispatch: Dispatch<AddThemeAction>) => {
    try {
      const res = await axios.post<ApiResponse<Theme>>('/api/themes', theme, {
        headers: applyAuth(),
      });

      dispatch({
        type: ActionType.addTheme,
        payload: res.data.data,
      });

      dispatch<any>({
        type: ActionType.createNotification,
        payload: {
          title: 'Success',
          message: 'Theme added',
        },
      });
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

export const deleteTheme =
  (name: string) => async (dispatch: Dispatch<DeleteThemeAction>) => {
    try {
      const res = await axios.delete<ApiResponse<Theme[]>>(
        `/api/themes/${encodeURIComponent(name)}`,
        { headers: applyAuth() }
      );

      dispatch({
        type: ActionType.deleteTheme,
        payload: res.data.data,
      });

      dispatch<any>({
        type: ActionType.createNotification,
        payload: {
          title: 'Success',
          message: 'Theme deleted',
        },
      });
    } catch (err) {
      console.log(err);
    }
  };

export const editTheme =
  (theme: Theme | null) => (dispatch: Dispatch<EditThemeAction>) => {
    dispatch({
      type: ActionType.editTheme,
      payload: theme,
    });
  };

export const updateTheme =
  (theme: Theme, originalName: string) =>
  async (dispatch: Dispatch<UpdateThemeAction>, getState: () => State) => {
    const original = getState().theme.userThemes.find(
      (t) => t.name === originalName
    );

    try {
      const res = await axios.put<ApiResponse<Theme[]>>(
        `/api/themes/${encodeURIComponent(originalName)}`,
        theme,
        { headers: applyAuth() }
      );

      dispatch({
        type: ActionType.updateTheme,
        payload: res.data.data,
      });

      // Keep showing an edited theme that is in use
      if (original) {
        const before = parseThemeToPAB(original.colors);

        if (parseThemeToPAB(getState().theme.activeTheme.colors) === before) {
          dispatch<any>(setTheme(theme.colors, localStorage.theme === before));
        }
      }

      // The server moves settings that use the theme to its new colors
      dispatch<any>(getAdminConfig());

      dispatch<any>({
        type: ActionType.createNotification,
        payload: {
          title: 'Success',
          message: 'Theme updated',
        },
      });
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
