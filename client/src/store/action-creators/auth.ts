import axios, { AxiosError } from 'axios';
import { Dispatch } from 'redux';

import { getAdminConfig, getCategories, getConfig } from '.';
import { ApiResponse, Session } from '../../interfaces';
import { applyAuth } from '../../utility';
import { ActionType } from '../action-types';
import { AuthErrorAction, AutoLoginAction, LoginAction, LogoutAction } from '../actions/auth';
import { State } from '../reducers';

export const login =
  (formData: { password: string; duration: string }) =>
  async (dispatch: Dispatch<LoginAction>) => {
    try {
      const res = await axios.post<ApiResponse<Session>>(
        '/api/auth',
        formData,
        { headers: applyAuth() }
      );

      dispatch({
        type: ActionType.login,
        payload: res.data.data,
      });

      dispatch<any>(getCategories());
      dispatch<any>(getAdminConfig());
    } catch (err) {
      dispatch<any>(authError(err, true));
    }
  };

const clearSession = (dispatch: Dispatch<LogoutAction>) => {
  dispatch({
    type: ActionType.logout,
  });

  dispatch<any>(getCategories());
  dispatch<any>(getConfig());
};

// Also used when the session has expired, so a failed request to clear the
// cookie must not keep the user logged in. A proxy session can only be ended
// at the proxy.
export const logout =
  () => async (dispatch: Dispatch<LogoutAction>, getState: () => State) => {
    const { method, logoutUrl } = getState().auth;

    await axios
      .post('/api/auth/logout', {}, { headers: applyAuth() })
      .catch(() => {});

    if (method === 'proxy' && logoutUrl) {
      window.location.assign(logoutUrl);
      return;
    }

    clearSession(dispatch);
  };

export const logoutAll = () => async (dispatch: Dispatch<LogoutAction>) => {
  try {
    await axios.post('/api/auth/logout-all', {}, { headers: applyAuth() });

    dispatch<any>({
      type: ActionType.createNotification,
      payload: {
        title: 'Success',
        message: 'Logged out of all sessions',
      },
    });
  } catch (err) {
    dispatch<any>(authError(err, true));

    // Other sessions are still valid unless this one was already rejected
    if ((err as AxiosError).response?.status !== 401) {
      return;
    }
  }

  clearSession(dispatch);
};

export const autoLogin = () => async (dispatch: Dispatch<AutoLoginAction>) => {
  try {
    const res = await axios.get<ApiResponse<Session>>('/api/auth');

    if (!res.data.data.isAuthenticated) {
      dispatch<any>({ type: ActionType.authError });
      return;
    }

    dispatch({
      type: ActionType.autoLogin,
      payload: res.data.data,
    });

    dispatch<any>(getCategories());
    dispatch<any>(getAdminConfig());
  } catch (err) {
    dispatch<any>({ type: ActionType.authError });
    dispatch<any>(authError(err, false));
  }
};

export const authError =
  (error: unknown, showNotification: boolean) =>
  (dispatch: Dispatch<AuthErrorAction>) => {
    const apiError = error as AxiosError<any, any>;

    if (showNotification) {
      dispatch<any>({
        type: ActionType.createNotification,
        payload: {
          title: 'Error',
          message: apiError.response?.data.error,
        },
      });
    }

    dispatch<any>(getCategories());
  };
