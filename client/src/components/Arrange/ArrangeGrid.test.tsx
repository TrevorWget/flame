import { act, fireEvent, render, screen } from '@testing-library/react';
import axios from 'axios';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App, Bookmark, Category } from '../../interfaces';
import { ActionType } from '../../store/action-types';
import { store } from '../../store/store';
import { configTemplate } from '../../utility';
import { Apps } from '../Apps/Apps';
import { Bookmarks } from '../Bookmarks/Bookmarks';

vi.mock('axios');

const put = vi.mocked(axios.put);

const model = { createdAt: new Date(), updatedAt: new Date() };

const app = (id: number, categoryId: number): App => ({
  ...model,
  id,
  name: `App ${id}`,
  url: `http://app${id}.local`,
  categoryId,
  icon: '',
  isPublic: id !== 3,
  description: '',
  statusCheck: true,
  statusUrl: null,
  orderId: id,
  isPinned: false,
});

const category = (
  id: number,
  type: string,
  items: (App | Bookmark)[]
): Category => ({
  ...model,
  id,
  name: `Category ${id}`,
  type,
  isPublic: true,
  isPinned: false,
  orderId: id,
  apps: type === 'apps' ? (items as App[]) : [],
  bookmarks: type === 'bookmarks' ? (items as Bookmark[]) : [],
});

const rect = (left: number, top: number, width: number, height: number) =>
  ({
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  }) as DOMRect;

// jsdom has no layout: put each category in its own 300px wide column with
// its items stacked 45px apart, so keyboard dragging has somewhere to go.
// Anything else (like the drag overlay) is tile sized at the top left.
const fakeLayout = function (this: Element): DOMRect {
  const column = this.closest('[data-testid^="arrange-category-"]');
  if (!column?.parentElement) return rect(0, 40, 250, 40);

  const left = Array.from(column.parentElement.children).indexOf(column) * 300;
  const testId = this.getAttribute('data-testid') ?? '';

  if (testId.startsWith('arrange-item-') && this.parentElement) {
    const index = Array.from(this.parentElement.children).indexOf(this);
    return rect(left, 40 + index * 45, 250, 40);
  }

  if (this.parentElement === column && this.tagName === 'DIV') {
    return rect(left, 40, 250, Math.max(this.children.length, 1) * 45);
  }

  return rect(left, 0, 250, 500);
};

const tick = () => act(() => new Promise((resolve) => setTimeout(resolve, 10)));

const press = async (
  code: string,
  target: Element = document.activeElement!
) => {
  fireEvent.keyDown(target, { code, key: code === 'Space' ? ' ' : code });
  await tick();
};

const setup = ({ loggedIn = true, useOrdering = 'orderId' } = {}) => {
  store.dispatch({
    type: ActionType.getConfig,
    payload: { ...configTemplate, useOrdering },
  });
  store.dispatch({
    type: ActionType.getCategoriesSuccess,
    payload: [
      category(1, 'apps', [app(1, 1), app(2, 1)]),
      category(2, 'apps', [app(3, 2)]),
      category(3, 'bookmarks', [{ ...app(4, 3), name: 'Docs' }]),
      category(4, 'bookmarks', []),
    ],
  });
  store.dispatch(
    loggedIn
      ? {
          type: ActionType.login,
          payload: {
            isAuthenticated: true,
            expiresAt: Date.now() + 60_000,
            method: 'password',
            user: null,
            logoutUrl: null,
          },
        }
      : { type: ActionType.logout }
  );
};

const renderPage = (page: JSX.Element) =>
  render(
    <Provider store={store}>
      <MemoryRouter>{page}</MemoryRouter>
    </Provider>
  );

beforeEach(() => {
  put.mockReset();
  put.mockResolvedValue({ data: { success: true, data: {} } });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    fakeLayout
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('arranging apps', () => {
  it('is not offered to guests', () => {
    setup({ loggedIn: false });
    renderPage(<Apps searching={false} />);

    expect(screen.queryByText('Arrange Apps')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Move/ })
    ).not.toBeInTheDocument();
    expect(screen.getByText('App 1').closest('a')).toHaveAttribute('href');
  });

  it('turns the grid into draggable tiles with quick edit', () => {
    setup();
    renderPage(<Apps searching={false} />);

    fireEvent.click(screen.getByText('Arrange Apps'));

    expect(screen.getByRole('button', { name: 'Move App 1' })).toHaveAttribute(
      'aria-roledescription',
      'sortable'
    );
    expect(screen.getByText('App 1').closest('a')).toBeNull();
    expect(screen.getAllByTitle('Hidden from guests')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Edit App 2' }));

    expect(
      screen.getByRole('button', { name: 'Update app' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('App name')).toHaveValue('App 2');

    fireEvent.click(screen.getByText('Done Arranging'));

    expect(
      screen.queryByRole('button', { name: /^Move/ })
    ).not.toBeInTheDocument();
  });

  it('moves an app to another category with the keyboard', async () => {
    setup();
    renderPage(<Apps searching={false} />);
    fireEvent.click(screen.getByText('Arrange Apps'));

    const handle = screen.getByRole('button', { name: 'Move App 2' });
    handle.focus();

    await press('Space', handle);
    await press('ArrowRight');
    await press('Space');

    expect(put).toHaveBeenCalledWith(
      '/api/apps/2',
      { categoryId: 2 },
      expect.anything()
    );
    expect(
      store.getState().apps.categories.map((c) => c.apps.map(({ id }) => id))
    ).toEqual([[1], expect.arrayContaining([2, 3])]);
    expect(screen.getByTestId('arrange-category-2')).toHaveTextContent('App 2');
  });

  it('cancels a keyboard drag with Escape', async () => {
    setup();
    renderPage(<Apps searching={false} />);
    fireEvent.click(screen.getByText('Arrange Apps'));

    const handle = screen.getByRole('button', { name: 'Move App 1' });
    handle.focus();

    await press('Space', handle);
    await press('ArrowRight');
    await press('Escape');

    expect(put).not.toHaveBeenCalled();
    expect(screen.getByTestId('arrange-category-1')).toHaveTextContent('App 1');
  });
});

describe('arranging bookmarks', () => {
  it('moves a bookmark into an empty category', async () => {
    setup({ useOrdering: 'createdAt' });
    renderPage(<Bookmarks searching={false} />);

    fireEvent.click(screen.getByText('Arrange Bookmarks'));
    expect(screen.getByText('Drop bookmarks here')).toBeInTheDocument();

    const handle = screen.getByRole('button', { name: 'Move Docs' });
    handle.focus();

    await press('Space', handle);
    await press('ArrowRight');
    await press('Space');

    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith(
      '/api/bookmarks/4',
      { categoryId: 4 },
      expect.anything()
    );
    expect(screen.getByTestId('arrange-category-4')).toHaveTextContent('Docs');
  });
});
