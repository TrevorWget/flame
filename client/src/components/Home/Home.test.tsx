import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { store } from '../../store/store';
import { App, Category } from '../../interfaces';
import { ActionType } from '../../store/action-types';
import { Home } from './Home';

vi.mock('../Widgets/WeatherWidget/WeatherWidget', () => ({
  WeatherWidget: () => null,
}));

const model = { createdAt: new Date(), updatedAt: new Date() };

const app = (name: string, isPinned: boolean): App => ({
  ...model,
  id: name.length,
  name,
  url: `http://${name.toLowerCase()}.local`,
  categoryId: 1,
  icon: '',
  isPublic: true,
  description: '',
  orderId: 1,
  isPinned,
});

const category = (
  id: number,
  name: string,
  isPinned: boolean,
  apps: App[]
): Category => ({
  ...model,
  id,
  name,
  type: 'apps',
  isPublic: true,
  isPinned,
  orderId: id,
  apps,
  bookmarks: [],
});

const renderHome = (categories: Category[]) => {
  act(() => {
    store.dispatch({
      type: ActionType.getCategoriesSuccess,
      payload: categories,
    });
  });

  return render(
    <Provider store={store}>
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    </Provider>
  );
};

describe('Home', () => {
  beforeEach(() => {
    store.dispatch({ type: ActionType.logout });
  });

  it('shows only the pinned apps of pinned categories', () => {
    renderHome([
      category(1, 'Media', true, [app('Jellyfin', true), app('Sonarr', false)]),
      category(2, 'Tools', false, [app('Portainer', true)]),
    ]);

    expect(screen.getByText('Media')).toBeInTheDocument();
    expect(screen.getByText('Jellyfin')).toBeInTheDocument();
    expect(screen.queryByText('Sonarr')).not.toBeInTheDocument();
    expect(screen.queryByText('Tools')).not.toBeInTheDocument();
    expect(screen.queryByText('Portainer')).not.toBeInTheDocument();
  });

  it('follows app pins made after loading', () => {
    const sonarr = app('Sonarr', false);
    renderHome([category(1, 'Media', true, [app('Jellyfin', true), sonarr])]);

    expect(screen.queryByText('Sonarr')).not.toBeInTheDocument();

    act(() => {
      store.dispatch({
        type: ActionType.pinApp,
        payload: { ...sonarr, isPinned: true },
      });
    });
    expect(screen.getByText('Sonarr')).toBeInTheDocument();

    act(() => {
      store.dispatch({
        type: ActionType.pinApp,
        payload: { ...sonarr, isPinned: false },
      });
    });
    expect(screen.queryByText('Sonarr')).not.toBeInTheDocument();
  });

  it('hides the apps section from guests when no app is pinned', () => {
    renderHome([category(1, 'Media', true, [app('Sonarr', false)])]);

    expect(screen.queryByText('Applications')).not.toBeInTheDocument();
    expect(screen.queryByText('Sonarr')).not.toBeInTheDocument();
    expect(screen.getByText(/Welcome to Flame!/)).toBeInTheDocument();
  });
});
