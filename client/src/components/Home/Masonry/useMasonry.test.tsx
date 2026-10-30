import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App, Category } from '../../../interfaces';
import { ActionType } from '../../../store/action-types';
import { store } from '../../../store/store';
import { configTemplate } from '../../../utility';
import { AppGrid } from '../../Apps/AppGrid/AppGrid';
import { WIDE_CATEGORY_MIN_APPS } from '../../Apps/AppCard/AppCard';

// jsdom has no layout, so cards get a height from their visible apps and the
// grid reports the columns its CSS would have
const HEADER = 30;
const APP = 40;
let columns = 4;
let gridWidth = 1000;
let observers: MockResizeObserver[] = [];

class MockResizeObserver {
  callback: ResizeObserverCallback;
  targets = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    observers.push(this);
  }

  observe(target: Element) {
    this.targets.add(target);
  }

  unobserve(target: Element) {
    this.targets.delete(target);
  }

  disconnect() {
    this.targets.clear();
  }
}

const isGrid = (el: Element) => /AppGrid/.test(el.className);
const isCard = (el: Element) => !!el.parentElement && isGrid(el.parentElement);

const resize = (targets: Element[]) =>
  act(() => {
    for (const observer of observers) {
      observer.callback(
        targets
          .filter((target) => observer.targets.has(target))
          .map(
            (target) =>
              ({
                target,
                contentRect: { width: isGrid(target) ? gridWidth : 250 },
              }) as unknown as ResizeObserverEntry
          ),
        observer as unknown as ResizeObserver
      );
    }
  });

const model = { createdAt: new Date(), updatedAt: new Date() };

const category = (id: number, appCount: number): Category => ({
  ...model,
  id,
  name: `Category ${id}`,
  type: 'apps',
  isPublic: true,
  isPinned: true,
  orderId: id,
  bookmarks: [],
  apps: Array.from(
    { length: appCount },
    (_, i): App => ({
      ...model,
      id: id * 100 + i,
      name: `App ${id}-${i}`,
      url: `http://app${id}-${i}.local`,
      categoryId: id,
      icon: '',
      isPublic: true,
      description: '',
      statusCheck: true,
      statusUrl: null,
      orderId: i,
      isPinned: true,
    })
  ),
});

const renderGrid = (categories: Category[], fromHomepage = true) =>
  render(
    <Provider store={store}>
      <MemoryRouter>
        <AppGrid
          categories={categories}
          searching={false}
          fromHomepage={fromHomepage}
        />
      </MemoryRouter>
    </Provider>
  );

const card = (name: string) =>
  screen.getByText(name).closest('h3')!.parentElement!;

const placement = (name: string) => ({
  column: card(name).style.gridColumn,
  row: card(name).style.gridRow,
});

describe('useMasonry', () => {
  beforeEach(() => {
    localStorage.clear();
    observers = [];
    columns = 4;
    gridWidth = 1000;
    vi.stubGlobal('ResizeObserver', MockResizeObserver);

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        let height = 0;

        if (isGrid(this)) {
          height = 1000;
        } else if (isCard(this)) {
          const collapsed = /Collapsed/.test(this.className);
          height = HEADER + (collapsed ? 0 : this.querySelectorAll('a').length * APP);
        }

        const width = isGrid(this) ? gridWidth : 250;

        return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}) };
      }
    );

    const getComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
      const style = getComputedStyle(el, pseudo);

      if (!isGrid(el)) return style;

      return new Proxy(style, {
        get: (target, prop) =>
          prop === 'gridTemplateColumns'
            ? Array(columns).fill('250px').join(' ')
            : Reflect.get(target, prop),
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('stacks each column of the homepage grid without gaps', () => {
    renderGrid([category(1, 3), category(2, 1), category(3, 2), category(4, 1), category(5, 2)]);

    expect(placement('Category 1')).toEqual({ column: '1', row: '1 / span 150' });
    expect(placement('Category 4')).toEqual({ column: '4', row: '1 / span 70' });
    expect(placement('Category 5')).toEqual({ column: '1', row: '151 / span 110' });
  });

  it('moves the cards below a category up when it collapses', async () => {
    renderGrid([category(1, 3), category(2, 1), category(3, 2), category(4, 1), category(5, 2)]);

    await userEvent.click(screen.getByRole('button', { name: 'Category 1' }));
    resize([card('Category 1')]);

    expect(placement('Category 1')).toEqual({ column: '1', row: '1 / span 30' });
    expect(placement('Category 5')).toEqual({ column: '1', row: '31 / span 110' });

    await userEvent.click(screen.getByRole('button', { name: 'Category 1' }));
    resize([card('Category 1')]);

    expect(placement('Category 5')).toEqual({ column: '1', row: '151 / span 110' });
  });

  it('spreads wide categories over every column, below the ones above', () => {
    renderGrid([category(1, 3), category(2, WIDE_CATEGORY_MIN_APPS), category(3, 1)]);

    expect(placement('Category 2')).toEqual({
      column: '1 / -1',
      row: `151 / span ${HEADER + WIDE_CATEGORY_MIN_APPS * APP}`,
    });
    expect(placement('Category 3')).toEqual({ column: '2', row: '1 / span 70' });
  });

  it('follows the column count when the window is resized', () => {
    renderGrid([category(1, 3), category(2, 1), category(3, 2)]);

    columns = 1;
    gridWidth = 400;
    resize([document.querySelector('[class*=AppGrid]')!]);

    expect(placement('Category 1')).toEqual({ column: '1', row: '1 / span 150' });
    expect(placement('Category 2')).toEqual({ column: '1', row: '151 / span 70' });
    expect(placement('Category 3')).toEqual({ column: '1', row: '221 / span 110' });
  });

  it('follows a new column setting without a resize', () => {
    renderGrid([category(1, 3), category(2, 1), category(3, 2)]);
    expect(placement('Category 3')).toEqual({ column: '3', row: '1 / span 110' });

    columns = 2;
    act(() => {
      store.dispatch({
        type: ActionType.getConfig,
        payload: { ...configTemplate, homeAppColumns: 2 },
      });
    });

    expect(placement('Category 3')).toEqual({ column: '1', row: '151 / span 110' });

    act(() => {
      store.dispatch({ type: ActionType.getConfig, payload: configTemplate });
    });
  });

  it('places cards that appear later', () => {
    const { rerender } = renderGrid([category(1, 3)]);

    rerender(
      <Provider store={store}>
        <MemoryRouter>
          <AppGrid categories={[category(1, 3), category(2, 1)]} searching={false} fromHomepage />
        </MemoryRouter>
      </Provider>
    );

    expect(placement('Category 2')).toEqual({ column: '2', row: '1 / span 70' });
  });

  it('leaves the /applications grid alone', () => {
    renderGrid([category(1, 3), category(2, 1)], false);

    expect(placement('Category 1')).toEqual({ column: '', row: '' });
    expect(document.querySelector('[class*=Masonry]')).toBeNull();
  });
});
