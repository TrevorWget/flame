import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axios from 'axios';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Category } from '../../../../interfaces';
import { ActionType } from '../../../../store/action-types';
import { store } from '../../../../store/store';
import { AppsForm } from '../../../Apps/Form/AppsForm';
import { SelfhstIcon, SelfhstPicker } from './SelfhstPicker';

vi.mock('axios');

const mockedGet = vi.mocked(axios.get);
const mockedPost = vi.mocked(axios.post);

const icon = (name: string, reference: string, flags: Partial<SelfhstIcon> = {}) => ({
  name,
  reference,
  svg: true,
  png: true,
  webp: true,
  light: true,
  dark: true,
  category: 'Self-Hosted',
  ...flags,
});

const JELLYFIN = icon('Jellyfin', 'jellyfin');
const GHOST = icon('Ghost', 'ghost', { svg: false, dark: false });

const searchResult = (icons: SelfhstIcon[], extra = {}) => ({
  data: {
    success: true,
    data: { icons, total: icons.length, updatedAt: '2026-10-01T00:00:00.000Z', stale: false, ...extra },
  },
});

const serve = ({
  suggestion = null as SelfhstIcon | null,
  search = searchResult([JELLYFIN, GHOST]) as unknown,
} = {}) => {
  mockedGet.mockImplementation(async (url: string) => {
    if (url === '/api/icons/selfhst/suggest') return { data: { success: true, data: suggestion } };
    if (url === '/api/icons/selfhst/search') {
      if (search instanceof Error) throw search;
      return search;
    }
    throw new Error(`Unexpected GET ${url}`);
  });
};

const notifications = () =>
  store.getState().notification.notifications.map((n) => n.message);

const renderPicker = (props: Partial<Parameters<typeof SelfhstPicker>[0]> = {}) => {
  const onPicked = vi.fn();

  render(
    <Provider store={store}>
      <SelfhstPicker name="Jellyfin" icon="" onPicked={onPicked} {...props} />
    </Provider>
  );

  return onPicked;
};

describe('SelfhstPicker', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedPost.mockReset();
  });

  it('suggests the icon named like the app and stores it', async () => {
    serve({ suggestion: JELLYFIN });
    mockedPost.mockResolvedValue({ data: { success: true, data: { icon: 'selfhst-jellyfin.svg' } } });
    const onPicked = renderPicker();

    expect(await screen.findByText('selfh.st has an icon for Jellyfin.')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith('/api/icons/selfhst/suggest', {
      params: { name: 'Jellyfin' },
      headers: { 'X-Flame-CSRF': '1' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Use it' }));

    await waitFor(() => expect(onPicked).toHaveBeenCalledWith('selfhst-jellyfin.svg'));
    expect(mockedPost).toHaveBeenCalledWith(
      '/api/icons/selfhst',
      { reference: 'jellyfin', format: 'svg', variant: 'standard' },
      { headers: { 'X-Flame-CSRF': '1' } }
    );
  });

  it('does not suggest anything once an icon is set', async () => {
    serve({ suggestion: JELLYFIN });
    renderPicker({ icon: 'movie' });

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(mockedGet).not.toHaveBeenCalled();
    expect(screen.queryByText(/selfh.st has an icon/)).not.toBeInTheDocument();
  });

  it('searches, offers only the variants and formats an icon has, and stores the choice', async () => {
    serve();
    mockedPost.mockResolvedValue({ data: { success: true, data: { icon: 'selfhst-ghost_light.webp' } } });
    const onPicked = renderPicker({ name: 'Ghost blog' });

    fireEvent.click(screen.getByRole('button', { name: 'Browse selfh.st icons' }));

    const search = screen.getByRole('searchbox', { name: 'Search selfh.st icons' });
    expect(search).toHaveValue('Ghost blog');

    const ghost = await screen.findByRole('button', { name: 'Ghost' });
    expect(mockedGet).toHaveBeenLastCalledWith('/api/icons/selfhst/search', {
      params: { q: 'Ghost blog', limit: 48 },
      headers: { 'X-Flame-CSRF': '1' },
    });
    expect(within(ghost).getByRole('presentation', { hidden: true })).toHaveAttribute(
      'src',
      '/api/icons/selfhst/preview/ghost'
    );

    fireEvent.click(ghost);
    expect(ghost).toHaveAttribute('aria-pressed', 'true');

    const colours = screen.getByRole('combobox', { name: 'Icon colours' });
    const formats = screen.getByRole('combobox', { name: 'Icon format' });
    expect(within(colours).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Standard colours',
      'Light (for dark themes)',
    ]);
    expect(within(formats).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'WebP',
      'PNG',
    ]);
    expect(formats).toHaveValue('webp');

    fireEvent.change(colours, { target: { value: 'light' } });
    expect(screen.getByAltText('Ghost icon preview')).toHaveAttribute(
      'src',
      '/api/icons/selfhst/preview/ghost?variant=light'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Use this icon' }));

    await waitFor(() => expect(onPicked).toHaveBeenCalledWith('selfhst-ghost_light.webp'));
    expect(mockedPost.mock.calls[0][1]).toEqual({
      reference: 'ghost',
      format: 'webp',
      variant: 'light',
    });
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('credits selfh.st and its licence', () => {
    serve();
    renderPicker({ icon: 'movie' });
    fireEvent.click(screen.getByRole('button', { name: 'Browse selfh.st icons' }));

    expect(screen.getByRole('link', { name: 'selfh.st/icons' })).toHaveAttribute(
      'href',
      'https://selfh.st/icons'
    );
    expect(screen.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by/4.0/'
    );
  });

  it('explains when the icon list cannot be downloaded', async () => {
    serve({ search: Object.assign(new Error('503'), { response: { status: 503, data: {} } }) });
    renderPicker({ icon: 'movie' });

    fireEvent.click(screen.getByRole('button', { name: 'Browse selfh.st icons' }));

    expect(
      await screen.findByText(/The selfh.st icon list can't be downloaded right now/)
    ).toBeInTheDocument();
  });

  it('shows how many icons match and when the saved list is from', async () => {
    serve({
      search: searchResult([JELLYFIN], { total: 2980, stale: true }),
    });
    renderPicker({ icon: 'movie' });

    fireEvent.click(screen.getByRole('button', { name: 'Browse selfh.st icons' }));

    const status = await screen.findByText(/Showing 1 of 2,980 icons/);
    expect(status).toHaveTextContent('saved icon list from');
  });

  it('reports errors when storing fails, and Enter does not submit the form', async () => {
    serve();
    mockedPost.mockRejectedValue({ response: { status: 422, data: { error: 'Timed out fetching the icon' } } });
    renderPicker({ icon: 'movie' });

    fireEvent.click(screen.getByRole('button', { name: 'Browse selfh.st icons' }));
    expect(fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' })).toBe(false);

    fireEvent.click(await screen.findByRole('button', { name: 'Jellyfin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use this icon' }));

    await waitFor(() => expect(notifications()).toContain('Timed out fetching the icon'));
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });
});

describe('AppsForm selfh.st icons', () => {
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
    mockedGet.mockReset();
    mockedPost.mockReset();
    act(() => {
      store.dispatch({ type: ActionType.getCategoriesSuccess, payload: [category] });
    });
  });

  it('puts the suggested icon into the icon field', async () => {
    serve({ suggestion: JELLYFIN });
    mockedPost.mockResolvedValue({ data: { success: true, data: { icon: 'selfhst-jellyfin.svg' } } });

    render(
      <Provider store={store}>
        <AppsForm modalHandler={vi.fn()} />
      </Provider>
    );

    fireEvent.change(screen.getByLabelText('App name'), {
      target: { name: 'name', value: 'Jellyfin' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Use it' }));

    await waitFor(() =>
      expect(screen.getByLabelText('App icon')).toHaveValue('selfhst-jellyfin.svg')
    );
    expect(screen.getByAltText('Current icon')).toHaveAttribute(
      'src',
      '/uploads/selfhst-jellyfin.svg'
    );
    expect(screen.queryByText(/selfh.st has an icon/)).not.toBeInTheDocument();
  });
});
