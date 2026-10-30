import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { store } from '../../store/store';
import { App, Category } from '../../interfaces';
import { ActionType } from '../../store/action-types';
import { COLLAPSED_CATEGORIES_KEY } from '../../utility/collapsedCategories';
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
  statusCheck: true,
  statusUrl: null,
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

const bookmarkCategory = (id: number, name: string): Category => ({
  ...category(id, name, true, []),
  type: 'bookmarks',
  bookmarks: [
    {
      ...model,
      id: id * 10,
      name: `${name} link`,
      url: `http://${name.toLowerCase()}.example`,
      categoryId: id,
      icon: '',
      isPublic: true,
      orderId: 1,
    },
  ],
});

const toggle = (name: string) => screen.getByRole('button', { name });

const isCollapsed = (name: string) => {
  const button = toggle(name);
  const content = document.getElementById(button.getAttribute('aria-controls')!);

  expect(content).not.toBeNull();
  expect(button.closest('h3')!.parentElement).toContainElement(content);

  return button.getAttribute('aria-expanded') === 'false';
};

describe('Home collapsible categories', () => {
  const categories = () => [
    category(1, 'Media', true, [app('Jellyfin', true)]),
    category(2, 'Tools', true, [app('Portainer', true)]),
    bookmarkCategory(3, 'Reading'),
  ];

  beforeEach(() => {
    store.dispatch({ type: ActionType.logout });
    localStorage.clear();
  });

  it('collapses a category when its name is clicked and remembers it after a reload', async () => {
    const user = userEvent.setup();
    const { unmount } = renderHome(categories());

    expect(isCollapsed('Media')).toBe(false);

    await user.click(toggle('Media'));
    expect(isCollapsed('Media')).toBe(true);
    expect(isCollapsed('Tools')).toBe(false);
    expect(toggle('Media').closest('h3')!.parentElement!.className).toMatch(/Collapsed/);

    unmount();
    renderHome(categories());

    expect(isCollapsed('Media')).toBe(true);
    expect(isCollapsed('Tools')).toBe(false);

    await user.click(toggle('Media'));
    expect(isCollapsed('Media')).toBe(false);
  });

  it('collapses bookmark categories too', async () => {
    const user = userEvent.setup();
    renderHome(categories());

    await user.click(toggle('Reading'));
    expect(isCollapsed('Reading')).toBe(true);
    expect(isCollapsed('Media')).toBe(false);
  });

  it('toggles from the keyboard', async () => {
    const user = userEvent.setup();
    renderHome(categories());

    act(() => toggle('Tools').focus());
    await user.keyboard('{Enter}');
    expect(isCollapsed('Tools')).toBe(true);

    await user.keyboard(' ');
    expect(isCollapsed('Tools')).toBe(false);
  });

  it('still finds apps inside collapsed categories when searching', async () => {
    const user = userEvent.setup();
    const { container } = renderHome(categories());

    await user.click(toggle('Media'));
    await user.type(container.querySelector('input')!, 'jelly');

    expect(screen.getByText('Search Results')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Search Results' })).toBeNull();
    expect(screen.getByText('Jellyfin').closest('[class*=Collapsed]')).toBeNull();

    await user.keyboard('{Escape}');
    expect(isCollapsed('Media')).toBe(true);
  });

  it('forgets deleted categories once a signed-in user loads them all', () => {
    localStorage.setItem(COLLAPSED_CATEGORIES_KEY, '[1,99]');
    act(() => {
      store.dispatch({
        type: ActionType.login,
        payload: {
          isAuthenticated: true,
          expiresAt: Date.now() + 60_000,
          method: 'password',
          user: null,
          logoutUrl: null,
        },
      });
    });

    renderHome(categories());

    expect(localStorage.getItem(COLLAPSED_CATEGORIES_KEY)).toBe('[1]');
    expect(isCollapsed('Media')).toBe(true);
  });

  it("keeps guests' saved state for categories they can't see", () => {
    localStorage.setItem(COLLAPSED_CATEGORIES_KEY, '[1,99]');

    renderHome(categories());

    expect(localStorage.getItem(COLLAPSED_CATEGORIES_KEY)).toBe('[1,99]');
    expect(isCollapsed('Media')).toBe(true);
  });
});
