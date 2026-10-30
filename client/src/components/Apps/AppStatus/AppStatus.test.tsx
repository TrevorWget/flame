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

const setStatusChecks = (statusChecks: boolean, colors = {}) =>
  act(() => {
    store.dispatch({
      type: ActionType.getConfig,
      payload: { statusChecks, statusCheckInterval: 60, ...colors },
    });
  });

const TRON = { background: '#242B33', primary: '#EFFBFF', accent: '#6EE2FF' };

const setTheme = (colors: typeof TRON) =>
  act(() => {
    store.dispatch({ type: ActionType.setTheme, payload: colors });
  });

const dotColor = (dot: HTMLElement) => dot.style.getPropertyValue('--status-color');

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

  it('shows an up, unhealthy or down dot from the server results', async () => {
    respond({
      1: { status: 'up', detail: 'HTTP 200', since },
      2: { status: 'down', detail: 'Container exited', since },
      4: { status: 'unhealthy', detail: 'HTTP 503', since },
    });
    setStatusChecks(true);

    renderGrid([
      app(1, 'Jellyfin'),
      app(2, 'Radarr'),
      app(3, 'Unchecked'),
      app(4, 'Sonarr'),
    ]);

    const up = await screen.findByRole('img', { name: /^Up: HTTP 200/ });
    const down = screen.getByRole('img', { name: /^Down: Container exited/ });
    const unhealthy = screen.getByRole('img', { name: /^Unhealthy: HTTP 503/ });

    expect(up.parentElement).toHaveTextContent('Jellyfin');
    expect(down.parentElement).toHaveTextContent('Radarr');
    expect(unhealthy.parentElement).toHaveTextContent('Sonarr');
    expect(unhealthy).toHaveAttribute('title', unhealthy.getAttribute('aria-label'));
    expect(screen.getAllByRole('img')).toHaveLength(3);
    expect(axios.get).toHaveBeenCalledWith('/api/apps/status');

    // Shapes tell the states apart without color
    expect(new Set([up, down, unhealthy].map((dot) => dot.className)).size).toBe(3);
  });

  it('colors the dots from the theme unless custom colors are set', async () => {
    respond({
      1: { status: 'up', detail: 'HTTP 200', since },
      2: { status: 'down', detail: 'Connection refused', since },
    });
    setTheme(TRON);
    setStatusChecks(true);

    renderGrid([app(1, 'Jellyfin'), app(2, 'Radarr')]);

    const up = await screen.findByRole('img', { name: /^Up/ });
    const down = screen.getByRole('img', { name: /^Down/ });
    expect(dotColor(up)).toBe('#6ee2ff');
    expect(dotColor(down)).toBe('#effbff');

    setTheme({ background: '#ffffff', primary: '#222222', accent: '#dddddd' });
    // The faint accent of the white theme is darkened to stay visible
    expect(dotColor(up)).not.toBe('#dddddd');
    expect(dotColor(down)).toBe('#222222');

    setStatusChecks(true, { statusColorUp: '#3fb950', statusColorDown: '' });
    expect(dotColor(up)).toBe('#3fb950');
    expect(dotColor(down)).toBe('#222222');

    setTheme(TRON);
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
