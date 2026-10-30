import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { store } from '../../../store/store';
import { App, Category } from '../../../interfaces';
import { WIDE_CATEGORY_MIN_APPS } from '../AppCard/AppCard';
import { AppGrid } from './AppGrid';

const model = { createdAt: new Date(), updatedAt: new Date() };

const apps = (categoryId: number, count: number): App[] =>
  Array.from({ length: count }, (_, i) => ({
    ...model,
    id: categoryId * 100 + i,
    name: `App ${categoryId}-${i}`,
    url: `http://app${categoryId}-${i}.local`,
    categoryId,
    icon: '',
    isPublic: true,
    description: '',
    orderId: i,
    isPinned: true,
  }));

const category = (id: number, appCount: number): Category => ({
  ...model,
  id,
  name: `Category ${id}`,
  type: 'apps',
  isPublic: true,
  isPinned: true,
  orderId: id,
  apps: apps(id, appCount),
  bookmarks: [],
});

const renderGrid = (categories: Category[]) =>
  render(
    <Provider store={store}>
      <MemoryRouter>
        <AppGrid categories={categories} searching={false} fromHomepage />
      </MemoryRouter>
    </Provider>
  );

const card = (name: string) => screen.getByText(name).closest('h3')!.parentElement!;

describe('AppGrid', () => {
  it('spreads a long category over the whole grid', () => {
    renderGrid([category(1, 29)]);

    expect(card('Category 1').className).toMatch(/WideAppCard/);
    expect(screen.getAllByRole('link')).toHaveLength(29);
  });

  it('keeps short categories in one column each, side by side', () => {
    renderGrid([
      category(1, 4),
      category(2, WIDE_CATEGORY_MIN_APPS - 1),
      category(3, 1),
    ]);

    for (const name of ['Category 1', 'Category 2', 'Category 3']) {
      expect(card(name).className).toMatch(/AppCard/);
      expect(card(name).className).not.toMatch(/WideAppCard/);
    }
  });

  it('only widens the long categories in a mixed grid', () => {
    renderGrid([
      category(1, 3),
      category(2, WIDE_CATEGORY_MIN_APPS),
      category(3, 2),
    ]);

    expect(card('Category 1').className).not.toMatch(/WideAppCard/);
    expect(card('Category 2').className).toMatch(/WideAppCard/);
    expect(card('Category 3').className).not.toMatch(/WideAppCard/);
  });

  it('keeps a collapsed long category spread over the whole grid', async () => {
    localStorage.clear();
    renderGrid([category(1, WIDE_CATEGORY_MIN_APPS), category(2, 2)]);

    await userEvent.click(screen.getByRole('button', { name: 'Category 1' }));

    expect(card('Category 1').className).toMatch(/WideAppCard/);
    expect(card('Category 1').className).toMatch(/Collapsed/);
    expect(card('Category 2').className).not.toMatch(/Collapsed/);
    localStorage.clear();
  });

  it('only collapses categories on the homepage', () => {
    render(
      <Provider store={store}>
        <MemoryRouter>
          <AppGrid categories={[category(1, 2)]} searching={false} />
        </MemoryRouter>
      </Provider>
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Category 1' })).toBeInTheDocument();
  });
});
