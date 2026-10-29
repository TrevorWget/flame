import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Category } from '../../../../interfaces';
import { ActionType } from '../../../../store/action-types';
import { store } from '../../../../store/store';
import { AppsForm } from '../../../Apps/Form/AppsForm';
import { FetchIcon } from './FetchIcon';

vi.mock('axios');

const mockedPost = vi.mocked(axios.post);

const notifications = () =>
  store.getState().notification.notifications.map((n) => n.message);

const renderFetchIcon = (props: Partial<Parameters<typeof FetchIcon>[0]> = {}) => {
  const onFetched = vi.fn();

  render(
    <Provider store={store}>
      <FetchIcon url="https://jellyfin.local" icon="" onFetched={onFetched} {...props} />
    </Provider>
  );

  return onFetched;
};

describe('FetchIcon', () => {
  beforeEach(() => {
    mockedPost.mockReset();
  });

  it('asks the server to fetch the site icon', async () => {
    mockedPost.mockResolvedValue({ data: { success: true, data: { icon: 'favicon-abc.png' } } });
    const onFetched = renderFetchIcon();

    fireEvent.click(screen.getByRole('button', { name: 'Fetch icon from site' }));
    expect(screen.getByRole('button', { name: 'Fetching icon...' })).toBeDisabled();

    await waitFor(() => expect(onFetched).toHaveBeenCalledWith('favicon-abc.png'));
    expect(mockedPost).toHaveBeenCalledWith(
      '/api/icons/fetch',
      { url: 'https://jellyfin.local' },
      { headers: { 'X-Flame-CSRF': '1' } }
    );
    expect(screen.getByRole('button', { name: 'Fetch icon from site' })).toBeEnabled();
  });

  it('stores an icon URL typed into the icon field', async () => {
    mockedPost.mockResolvedValue({ data: { success: true, data: { icon: 'favicon-def.svg' } } });
    renderFetchIcon({ icon: 'https://cdn.example.com/logo.svg' });

    fireEvent.click(screen.getByRole('button', { name: 'Store this icon in Flame' }));

    await waitFor(() => expect(mockedPost).toHaveBeenCalled());
    expect(mockedPost.mock.calls[0][1]).toEqual({ url: 'https://cdn.example.com/logo.svg' });
  });

  it('shows the server error and keeps the icon', async () => {
    mockedPost.mockRejectedValue({
      response: { data: { error: 'jellyfin.local is on a private network address' } },
    });
    const onFetched = renderFetchIcon();

    fireEvent.click(screen.getByRole('button', { name: 'Fetch icon from site' }));

    await waitFor(() =>
      expect(notifications()).toContain('jellyfin.local is on a private network address')
    );
    expect(onFetched).not.toHaveBeenCalled();
  });

  it('needs a URL first', () => {
    renderFetchIcon({ url: '  ' });

    fireEvent.click(screen.getByRole('button', { name: 'Fetch icon from site' }));

    expect(notifications()).toContain('Enter a URL to fetch the icon from');
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('previews stored and remote image icons only', () => {
    const { rerender } = render(
      <Provider store={store}>
        <FetchIcon url="" icon="favicon-abc.png" onFetched={vi.fn()} />
      </Provider>
    );
    expect(screen.getByAltText('Current icon')).toHaveAttribute('src', '/uploads/favicon-abc.png');

    rerender(
      <Provider store={store}>
        <FetchIcon url="" icon="https://cdn.example.com/a.svg" onFetched={vi.fn()} />
      </Provider>
    );
    expect(screen.getByAltText('Current icon')).toHaveAttribute('src', 'https://cdn.example.com/a.svg');

    rerender(
      <Provider store={store}>
        <FetchIcon url="" icon="book-open-outline" onFetched={vi.fn()} />
      </Provider>
    );
    expect(screen.queryByAltText('Current icon')).not.toBeInTheDocument();
  });
});

describe('AppsForm icon fetching', () => {
  const category: Category = {
    id: 1,
    name: 'Media',
    type: 'apps',
    isPinned: true,
    isPublic: true,
    orderId: 1,
    apps: [],
    bookmarks: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockedPost.mockReset();
    act(() => {
      store.dispatch({ type: ActionType.getCategoriesSuccess, payload: [category] });
    });
  });

  it('puts the fetched icon into the icon field', async () => {
    mockedPost.mockResolvedValue({ data: { success: true, data: { icon: 'favicon-123.ico' } } });

    render(
      <Provider store={store}>
        <AppsForm modalHandler={vi.fn()} />
      </Provider>
    );

    fireEvent.change(screen.getByLabelText('Internal URL'), {
      target: { name: 'url', value: 'sonarr.local:8989' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Fetch icon from site' }));

    await waitFor(() => expect(screen.getByLabelText('App icon')).toHaveValue('favicon-123.ico'));
    expect(mockedPost.mock.calls[0][1]).toEqual({ url: 'sonarr.local:8989' });
    expect(screen.getByAltText('Current icon')).toHaveAttribute('src', '/uploads/favicon-123.ico');
  });
});
