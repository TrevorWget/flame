import { ActionType } from '../action-types';

export interface LoginAction {
  type: ActionType.login;
  payload: number;
}

export interface LogoutAction {
  type: ActionType.logout;
}

export interface AutoLoginAction {
  type: ActionType.autoLogin;
  payload: number;
}

export interface AuthErrorAction {
  type: ActionType.authError;
}
