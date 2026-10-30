import { render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import axios from 'axios';
import { Provider } from 'react-redux';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProviders, Session } from '../../../../interfaces';
import { store } from '../../../../store';
import { ActionType } from '../../../../store/action-types';
import { oidcLoginUrl } from '../../../../utility';
import { AuthForm } from './AuthForm';

const LocationSearch = () => <output>{useLocation().search}</output>;

const renderForm = (url = '/settings/app') =>
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <AuthForm />
        <LocationSearch />
      </MemoryRouter>
    </Provider>
  );

const mockProviders = (providers: AuthProviders) =>
  vi.spyOn(axios, 'get').mockResolvedValue({
    data: { success: true, data: providers },
  });

const signIn = (session: Partial<Session>) =>
  store.dispatch({
    type: ActionType.autoLogin,
    payload: {
      isAuthenticated: true,
      expiresAt: null,
      method: 'password',
      user: null,
      logoutUrl: null,
      ...session,
    },
  });

describe('AuthForm', () => {
  beforeEach(() => {
    store.dispatch({ type: ActionType.logout });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows only the password form by default', async () => {
    const get = mockProviders({ password: true, oidc: null });
    renderForm();

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/api/auth/providers')
    );
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Log in with/ })).toBeNull();
  });

  it('offers OIDC next to the password form', async () => {
    mockProviders({ password: true, oidc: { name: 'Authentik' } });
    renderForm();

    expect(
      await screen.findByRole('button', { name: 'Log in with Authentik' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('hides the password form when only OIDC is available', async () => {
    mockProviders({ password: false, oidc: { name: 'Authentik' } });
    renderForm();

    await screen.findByRole('button', { name: 'Log in with Authentik' });
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Login' })).toBeNull();
    expect(screen.getByLabelText('Session duration')).toBeInTheDocument();
  });

  it('reports an OIDC error from the callback once and clears it from the URL', async () => {
    mockProviders({ password: true, oidc: { name: 'Authentik' } });
    const before = store.getState().notification.notifications.length;

    render(
      <StrictMode>
        <Provider store={store}>
          <MemoryRouter initialEntries={['/settings/app?ssoError=forbidden']}>
            <AuthForm />
            <LocationSearch />
          </MemoryRouter>
        </Provider>
      </StrictMode>
    );

    await waitFor(() =>
      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    );
    const notifications = store.getState().notification.notifications;
    expect(notifications).toHaveLength(before + 1);
    expect(notifications.at(-1)).toMatchObject({
      title: 'Error',
      message: 'Your account is not in a group that is allowed to use Flame.',
    });
  });

  it('shows who is logged in through the proxy without a useless logout', () => {
    signIn({ method: 'proxy', user: 'trevor' });
    renderForm();

    expect(screen.getByText('trevor')).toBeInTheDocument();
    expect(screen.getByText(/through your reverse proxy/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Logout' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Log out all sessions' })
    ).toBeNull();
  });

  it('offers logout for proxy sessions with a logout URL', () => {
    signIn({
      method: 'proxy',
      user: 'trevor',
      logoutUrl: '/outpost.goauthentik.io/sign_out',
    });
    renderForm();

    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
  });

  it('shows the OIDC user and session expiry', () => {
    signIn({ method: 'oidc', user: 'trevor', expiresAt: Date.now() + 3600e3 });
    renderForm();

    expect(screen.getByText('trevor')).toBeInTheDocument();
    expect(screen.getByText(/with single sign-on/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
  });
});

describe('oidcLoginUrl', () => {
  it('passes the chosen session duration', () => {
    expect(oidcLoginUrl('1d')).toBe('/api/auth/oidc/login?duration=1d');
  });
});
