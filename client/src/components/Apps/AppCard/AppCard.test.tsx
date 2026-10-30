import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { ActionType } from '../../../store/action-types';
import { store } from '../../../store/store';
import { App, Category } from '../../../interfaces';
import { AppCard } from './AppCard';

const model = { createdAt: new Date(), updatedAt: new Date() };

const app = (name: string, fields: Partial<App>): App => ({
  ...model,
  id: name.length,
  name,
  url: `http://${name.toLowerCase()}.lan:8080`,
  categoryId: 1,
  icon: '',
  isPublic: true,
  description: '',
  statusCheck: true,
  statusUrl: null,
  orderId: 1,
  isPinned: true,
  ...fields,
});

const renderCard = (apps: App[]) => {
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

  return render(
    <Provider store={store}>
      <MemoryRouter>
        <AppCard category={category} fromHomepage />
      </MemoryRouter>
    </Provider>
  );
};

const link = (name: string) => screen.getByText(name).closest('a')!;

describe('AppCard URLs', () => {
  it('shows and opens the URL picked for each app', () => {
    renderCard([
      app('Legacy', {}),
      app('Inside', { externalUrl: 'https://inside.example.com' }),
      app('Outside', {
        externalUrl: 'https://outside.example.com',
        preferredUrl: 'external',
      }),
    ]);

    expect(link('Legacy').getAttribute('href')).toBe('http://legacy.lan:8080');
    expect(link('Inside').getAttribute('href')).toBe('http://inside.lan:8080');
    expect(link('Outside').getAttribute('href')).toBe(
      'https://outside.example.com'
    );
    expect(screen.getByText('outside.example.com')).toBeInTheDocument();
  });

  it('opens the internal URL when the external one is picked but empty', () => {
    renderCard([app('Empty', { externalUrl: '', preferredUrl: 'external' })]);

    expect(link('Empty').getAttribute('href')).toBe('http://empty.lan:8080');
    expect(screen.getByText('empty.lan:8080')).toBeInTheDocument();
  });
});

describe('AppCard icons', () => {
  const setTheme = (background: string, primary: string) =>
    act(() => {
      store.dispatch({
        type: ActionType.setTheme,
        payload: { background, primary, accent: '#6ee2ff' },
      });
    });

  afterEach(() => setTheme('#242b33', '#effbff'));

  it('switch between the light and dark versions with the theme, without a reload', () => {
    setTheme('#242b33', '#effbff');
    renderCard([
      app('Jellyfin', {
        icon: 'selfhst-jellyfin.webp',
        iconOnDark: 'selfhst-jellyfin_light.webp',
        iconOnLight: 'selfhst-jellyfin_dark.webp',
      }),
      app('Ghost', { icon: 'selfhst-ghost.webp', iconOnDark: 'selfhst-ghost_light.webp' }),
      app('Older', { icon: 'selfhst-plex_light.webp' }),
    ]);
    const src = (name: string) => screen.getByAltText(`${name} icon`).getAttribute('src');

    expect(src('Jellyfin')).toBe('/uploads/selfhst-jellyfin_light.webp');
    expect(src('Ghost')).toBe('/uploads/selfhst-ghost_light.webp');
    expect(src('Older')).toBe('/uploads/selfhst-plex_light.webp');

    setTheme('#ffffff', '#222222');
    expect(src('Jellyfin')).toBe('/uploads/selfhst-jellyfin_dark.webp');
    // No dark version, so the standard icon
    expect(src('Ghost')).toBe('/uploads/selfhst-ghost.webp');
    expect(src('Older')).toBe('/uploads/selfhst-plex_light.webp');

    setTheme('#1a1a1a', '#fffdea');
    expect(src('Jellyfin')).toBe('/uploads/selfhst-jellyfin_light.webp');
  });
});
