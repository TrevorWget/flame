import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';

import { Bookmark, Category } from '../../../interfaces';
import { ActionType } from '../../../store/action-types';
import { store } from '../../../store/store';
import { BookmarkCard } from './BookmarkCard';

const model = { createdAt: new Date(), updatedAt: new Date() };

const bookmark = (id: number, name: string, fields: Partial<Bookmark>): Bookmark => ({
  ...model,
  id,
  name,
  url: `https://${name.toLowerCase()}.example.com`,
  categoryId: 1,
  icon: '',
  isPublic: true,
  orderId: id,
  ...fields,
});

const setTheme = (background: string, primary: string) =>
  act(() => {
    store.dispatch({
      type: ActionType.setTheme,
      payload: { background, primary, accent: '#6ee2ff' },
    });
  });

describe('BookmarkCard icons', () => {
  afterEach(() => setTheme('#242b33', '#effbff'));

  it('follow the theme, and fall back to the standard icon', () => {
    const category: Category = {
      ...model,
      id: 1,
      name: 'Links',
      type: 'bookmarks',
      isPublic: true,
      isPinned: true,
      orderId: 1,
      apps: [],
      bookmarks: [
        bookmark(1, 'GitHub', {
          icon: 'selfhst-github.png',
          iconOnDark: 'selfhst-github_light.png',
          iconOnLight: 'selfhst-github_dark.png',
        }),
        bookmark(2, 'Docs', { icon: 'favicon-0123.png' }),
      ],
    };

    setTheme('#ffffff', '#222222');
    render(
      <Provider store={store}>
        <BookmarkCard category={category} fromHomepage />
      </Provider>
    );
    const src = (name: string) => screen.getByAltText(`${name} icon`).getAttribute('src');

    expect(src('GitHub')).toBe('/uploads/selfhst-github_dark.png');
    expect(src('Docs')).toBe('/uploads/favicon-0123.png');

    setTheme('#091833', '#effbff');
    expect(src('GitHub')).toBe('/uploads/selfhst-github_light.png');
    expect(src('Docs')).toBe('/uploads/favicon-0123.png');
  });
});
