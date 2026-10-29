import { describe, expect, it } from 'vitest';

import { ActionType } from '../action-types';
import { authReducer } from './auth';

const initial = authReducer(undefined, { type: ActionType.authError });

describe('authReducer', () => {
  it('stores how and as whom the session was established', () => {
    const state = authReducer(initial, {
      type: ActionType.autoLogin,
      payload: {
        isAuthenticated: true,
        expiresAt: null,
        method: 'proxy',
        user: 'trevor',
        logoutUrl: '/outpost.goauthentik.io/sign_out',
      },
    });

    expect(state).toEqual({
      isAuthenticated: true,
      sessionChecked: true,
      expiresAt: null,
      method: 'proxy',
      user: 'trevor',
      logoutUrl: '/outpost.goauthentik.io/sign_out',
    });
  });

  it('forgets the session on logout', () => {
    const loggedIn = authReducer(initial, {
      type: ActionType.login,
      payload: {
        isAuthenticated: true,
        expiresAt: 1,
        method: 'oidc',
        user: 'trevor',
        logoutUrl: null,
      },
    });

    expect(authReducer(loggedIn, { type: ActionType.logout })).toEqual({
      isAuthenticated: false,
      sessionChecked: true,
      expiresAt: null,
      method: null,
      user: null,
      logoutUrl: null,
    });
  });
});
