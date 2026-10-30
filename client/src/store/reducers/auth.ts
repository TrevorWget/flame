import { SessionMethod } from '../../interfaces';
import { Action } from '../actions';
import { ActionType } from '../action-types';

interface AuthState {
  isAuthenticated: boolean;
  // False until the session cookie has been checked on page load
  sessionChecked: boolean;
  // Session expiry in ms since the epoch; the token itself is an HttpOnly cookie.
  // Null for proxy sessions, which don't expire on Flame's side.
  expiresAt: number | null;
  method: SessionMethod | null;
  user: string | null;
  logoutUrl: string | null;
}

const signedOut = {
  isAuthenticated: false,
  expiresAt: null,
  method: null,
  user: null,
  logoutUrl: null,
};

const initialState: AuthState = {
  ...signedOut,
  sessionChecked: false,
};

export const authReducer = (
  state: AuthState = initialState,
  action: Action
): AuthState => {
  switch (action.type) {
    case ActionType.login:
    case ActionType.autoLogin:
      return {
        ...state,
        isAuthenticated: true,
        sessionChecked: true,
        expiresAt: action.payload.expiresAt,
        method: action.payload.method,
        user: action.payload.user,
        logoutUrl: action.payload.logoutUrl,
      };

    case ActionType.logout:
      return {
        ...state,
        ...signedOut,
      };

    case ActionType.authError:
      return {
        ...state,
        ...signedOut,
        sessionChecked: true,
      };

    default:
      return state;
  }
};
