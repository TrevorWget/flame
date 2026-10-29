import { Action } from '../actions';
import { ActionType } from '../action-types';

interface AuthState {
  isAuthenticated: boolean;
  // False until the session cookie has been checked on page load
  sessionChecked: boolean;
  // Session expiry in ms since the epoch; the token itself is an HttpOnly cookie
  expiresAt: number | null;
}

const initialState: AuthState = {
  isAuthenticated: false,
  sessionChecked: false,
  expiresAt: null,
};

export const authReducer = (
  state: AuthState = initialState,
  action: Action
): AuthState => {
  switch (action.type) {
    case ActionType.login:
      return {
        ...state,
        expiresAt: action.payload,
        isAuthenticated: true,
        sessionChecked: true,
      };

    case ActionType.logout:
      return {
        ...state,
        expiresAt: null,
        isAuthenticated: false,
      };

    case ActionType.autoLogin:
      return {
        ...state,
        expiresAt: action.payload,
        isAuthenticated: true,
        sessionChecked: true,
      };

    case ActionType.authError:
      return {
        ...state,
        expiresAt: null,
        isAuthenticated: false,
        sessionChecked: true,
      };

    default:
      return state;
  }
};
