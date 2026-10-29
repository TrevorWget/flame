import { act, render, screen } from '@testing-library/react';
import axios from 'axios';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App, AppStatuses, Category } from '../../../interfaces';
import { ActionType } from '../../../store/action-types';
import { store } from '../../../store/store';
import { AppGrid } from '../AppGrid/AppGrid';
import { pollSeconds } from './useAppStatuses';

vi.mock('axios');

const model = { createdAt: new Date(), updatedAt: new Date() };

const app = (id: number, name: string): App => ({
  ...model,
  id,
  name,
  url: `http://${name.toLowerCase()}.local`,
  categoryId: 1,
  icon: '',
  isPublic: true,
  description: '',
  statusCheck: true,
  statusUrl: null,
  orderId: id,
  isPinned: true,
});

const category = (apps: App[]): Category => ({
  ...model,
  id: 1,
  name: 'Media',
  type: 'apps',
  isPublic: true,
  isPinned: true,
  orderId: 1,
  apps,
  bookmarks: [],
});

const since = new Date().toISOString();

const respond = (statuses: AppStatuses) =>
  vi.mocked(axios.get).mockResolvedValue({
    data: { success: true, data: { enabled: true, statuses } },
  });

const setStatusChecks = (statusChecks: boolean) =>
  act(() => {
    store.dispatch({
      type: ActionType.getConfig,
      payload: { statusChecks, statusCheckInterval: 60 },
    });
  });

const renderGrid = (apps: App[]) =>
  render(
    <Provider store={store}>
      <MemoryRouter>
        <AppGrid categories={[category(apps)]} searching={false} fromHomepage />
      </MemoryRouter>
    </Provider>
  );

describe('app status indicators', () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
  });

  afterEach(() => {
    setStatusChecks(false);
  });

  it('shows an up or down dot from the server results', async () => {
    respond({
      1: { status: 'up', detail: 'HTTP 200', since },
      2: { status: 'down', detail: 'Container exited', since },
    });
    setStatusChecks(true);

    renderGrid([app(1, 'Jellyfin'), app(2, 'Radarr'), app(3, 'Unchecked')]);

    const up = await screen.findByRole('img', { name: /^Up: HTTP 200/ });
    const down = screen.getByRole('img', { name: /^Down: Container exited/ });

    expect(up.parentElement).toHaveTextContent('Jellyfin');
    expect(down.parentElement).toHaveTextContent('Radarr');
    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(axios.get).toHaveBeenCalledWith('/api/apps/status');
  });

  it('does not poll or show dots when disabled', async () => {
    respond({ 1: { status: 'up', detail: 'HTTP 200', since } });

    renderGrid([app(1, 'Jellyfin')]);
    await act(async () => {});

    expect(axios.get).not.toHaveBeenCalled();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('polls between 10 and 30 seconds, following the check interval', () => {
    expect(pollSeconds(5)).toBe(10);
    expect(pollSeconds(20)).toBe(20);
    expect(pollSeconds(300)).toBe(30);
  });
});
