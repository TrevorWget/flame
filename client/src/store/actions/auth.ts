import { Session } from '../../interfaces';
import { ActionType } from '../action-types';

export interface LoginAction {
  type: ActionType.login;
  payload: Session;
}

export interface LogoutAction {
  type: ActionType.logout;
}

export interface AutoLoginAction {
  type: ActionType.autoLogin;
  payload: Session;
}

export interface AuthErrorAction {
  type: ActionType.authError;
}
