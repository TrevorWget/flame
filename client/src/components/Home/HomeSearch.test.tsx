import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { store } from '../../store/store';
import { App, Category } from '../../interfaces';
import { ActionType } from '../../store/action-types';
import { Home } from './Home';

vi.mock('../Widgets/WeatherWidget/WeatherWidget', () => ({
  WeatherWidget: () => null,
}));

const model = { createdAt: new Date(), updatedAt: new Date() };

const app = (id: number, name: string, fields: Partial<App>): App => ({
  ...model,
  id,
  name,
  url: `http://${name.toLowerCase()}.lan`,
  categoryId: 1,
  icon: '',
  isPublic: true,
  description: '',
  statusCheck: true,
  statusUrl: null,
  orderId: id,
  isPinned: true,
  ...fields,
});

const renderHome = (apps: App[]) => {
  const category: Category = {
    ...model,
    id: 1,
    name: 'Media',
    type: 'apps',
    isPublic: true,
    isPinned: true,
    orderId: 1,
    apps,
    bookmarks: [],
  };

  act(() => {
    store.dispatch({
      type: ActionType.getCategoriesSuccess,
      payload: [category],
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

const search = (query: string) => {
  const input = screen.getByRole('textbox');

  fireEvent.change(input, { target: { value: query } });
  fireEvent.keyUp(input, { code: 'KeyA' });

  return () => fireEvent.submit(input.closest('form')!);
};

describe('Home search with external URLs', () => {
  let open: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    store.dispatch({ type: ActionType.logout });
    open = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    open.mockRestore();
  });

  it('finds apps by their external URL and opens the picked URL', () => {
    renderHome([
      app(1, 'Jellyfin', {
        externalUrl: 'https://media.example.com',
        preferredUrl: 'external',
      }),
      app(2, 'Sonarr', {}),
    ]);

    const submit = search('media');

    expect(screen.getByText('Jellyfin')).toBeInTheDocument();
    expect(screen.queryByText('Sonarr')).not.toBeInTheDocument();

    submit();
    expect(open).toHaveBeenCalledWith('https://media.example.com');
  });

  it('opens the internal URL of a result that picked an empty external URL', () => {
    renderHome([app(1, 'Radarr', { externalUrl: '', preferredUrl: 'external' })]);

    search('radarr')();
    expect(open).toHaveBeenCalledWith('http://radarr.lan');
  });
});
