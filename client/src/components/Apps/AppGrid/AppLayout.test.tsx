import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App, Category, Config } from '../../../interfaces';
import { ActionType } from '../../../store/action-types';
import { store } from '../../../store/store';
import { configTemplate } from '../../../utility';
import { WIDE_CATEGORY_MIN_APPS } from '../AppCard/AppCard';
import { AppGrid } from './AppGrid';

vi.mock('axios');

const model = { createdAt: new Date(), updatedAt: new Date() };

const app = (categoryId: number, i: number, fields: Partial<App> = {}): App => ({
  ...model,
  id: categoryId * 100 + i,
  name: `App ${categoryId}-${i}`,
  url: `http://app${categoryId}-${i}.local`,
  categoryId,
  icon: 'docker',
  isPublic: true,
  description: '',
  statusCheck: true,
  statusUrl: null,
  orderId: i,
  isPinned: true,
  ...fields,
});

const category = (id: number, apps: App[]): Category => ({
  ...model,
  id,
  name: `Category ${id}`,
  type: 'apps',
  isPublic: true,
  isPinned: true,
  orderId: id,
  apps,
  bookmarks: [],
});

const many = (id: number, count: number) =>
  category(id, Array.from({ length: count }, (_, i) => app(id, i)));

const MIXED = [
  category(1, [
    app(1, 0, { description: 'Movies' }),
    app(1, 1),
    app(1, 2, { icon: '' }),
  ]),
  many(2, WIDE_CATEGORY_MIN_APPS),
];

const setConfig = (changes: Partial<Config> = {}) =>
  act(() => {
    store.dispatch({
      type: ActionType.getConfig,
      payload: { ...configTemplate, ...changes },
    });
  });

const renderGrid = (categories: Category[], fromHomepage = true) =>
  render(
    <Provider store={store}>
      <MemoryRouter>
        <AppGrid categories={categories} searching={false} fromHomepage={fromHomepage} />
      </MemoryRouter>
    </Provider>
  );

const grid = () => document.querySelector<HTMLElement>('[class*=AppGrid]')!;
const card = (name: string) => screen.getByText(name).closest('h3')!.parentElement!;
const link = (name: string) => screen.getByText(name).closest('a')!;

describe('app layout settings', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(axios.get).mockReset();
  });

  afterEach(() => {
    setConfig();
    localStorage.clear();
  });

  it("keeps Flame's original look by default", () => {
    setConfig();
    renderGrid(MIXED);

    expect(card('Category 1').className).not.toMatch(/TileAppCard/);
    expect(grid().className).not.toMatch(/FixedColumns/);
    expect(grid().style.getPropertyValue('--app-icon-size')).toBe('35px');
    expect(link('App 1-0')).toHaveTextContent('Movies');
    expect(link('App 1-1')).toHaveTextContent('app1-1.local');
    // Only tiles give apps without an icon a placeholder
    expect(link('App 1-2').querySelector('[class*=AppIcon]')).toBeNull();
    expect(link('App 1-0')).not.toHaveAttribute('title');
  });

  it('lays apps out as icon tiles, wide categories included', () => {
    setConfig({ appTileStyle: 'tiles', appIconScale: 150 });
    renderGrid(MIXED);

    expect(card('Category 1').className).toMatch(/TileAppCard/);
    expect(card('Category 2').className).toMatch(/WideAppCard/);
    expect(card('Category 2').className).toMatch(/TileAppCard/);
    expect(grid().style.getPropertyValue('--app-icon-size')).toBe('84px');
    expect(link('App 1-2').querySelector('[class*=IconLetter]')).toHaveTextContent('A');
    // Long names and descriptions are cut short in tiles, so they're in the tooltip
    expect(link('App 1-0')).toHaveAttribute('title', 'App 1-0\nMovies');
  });

  it('collapses tiled categories on the homepage', async () => {
    setConfig({ appTileStyle: 'tiles' });
    renderGrid(MIXED);

    await userEvent.click(screen.getByRole('button', { name: 'Category 1' }));

    expect(card('Category 1').className).toMatch(/Collapsed/);
    expect(card('Category 1').className).toMatch(/TileAppCard/);
  });

  it('uses the column count of each page', () => {
    setConfig({ homeAppColumns: 6, appsPageColumns: 0, appDensity: 'roomy' });
    const { unmount } = renderGrid(MIXED);

    expect(grid().className).toMatch(/FixedColumns/);
    expect(grid().style.getPropertyValue('--app-columns')).toBe('6');
    expect(grid().style.getPropertyValue('--app-column-gap')).toBe('24px');
    unmount();

    renderGrid(MIXED, false);
    expect(grid().className).not.toMatch(/FixedColumns/);
    expect(grid().style.getPropertyValue('--app-columns')).toBe('');
  });

  it('hides URLs and descriptions', () => {
    setConfig({ hideAppUrls: true });
    const { unmount } = renderGrid(MIXED);

    expect(link('App 1-0')).toHaveTextContent('Movies');
    expect(link('App 1-1')).toHaveTextContent(/^App 1-1$/);
    unmount();

    setConfig({ hideAppDescriptions: true });
    renderGrid(MIXED);
    expect(link('App 1-0')).toHaveTextContent('app1-0.local');
    expect(link('App 1-0')).not.toHaveTextContent('Movies');
  });

  it('hides status dots and stops polling for them', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        success: true,
        data: {
          enabled: true,
          statuses: { 100: { status: 'up', detail: 'HTTP 200', since: model.createdAt } },
        },
      },
    });

    setConfig({ statusChecks: true });
    const { unmount } = renderGrid(MIXED);
    expect(await screen.findByRole('img', { name: /^Up/ })).toBeInTheDocument();
    unmount();

    vi.mocked(axios.get).mockClear();
    setConfig({ statusChecks: true, hideStatusDots: true });
    renderGrid(MIXED);
    await act(async () => {});

    expect(screen.queryByRole('img', { name: /^Up/ })).not.toBeInTheDocument();
    expect(axios.get).not.toHaveBeenCalled();
  });
});
