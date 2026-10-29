import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  COLLAPSED_CATEGORIES_KEY,
  pruneCollapsedCategories,
  toggleCollapsedCategory,
  useCollapsedCategory,
} from './collapsedCategories';

const stored = () => localStorage.getItem(COLLAPSED_CATEGORIES_KEY);

describe('collapsedCategories', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts with every category expanded', () => {
    const { result } = renderHook(() => useCollapsedCategory(1));

    expect(result.current[0]).toBe(false);
  });

  it('saves collapsed category ids to localStorage', () => {
    const { result } = renderHook(() => useCollapsedCategory(3));

    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);

    act(() => toggleCollapsedCategory(1));
    expect(stored()).toBe('[1,3]');

    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
    expect(stored()).toBe('[1]');

    act(() => toggleCollapsedCategory(1));
    expect(stored()).toBeNull();
  });

  it('reads the saved state back', () => {
    localStorage.setItem(COLLAPSED_CATEGORIES_KEY, '[2,5]');

    expect(renderHook(() => useCollapsedCategory(2)).result.current[0]).toBe(true);
    expect(renderHook(() => useCollapsedCategory(4)).result.current[0]).toBe(false);
  });

  it.each(['not json', '{"2":true}', '"2"', '[null,"2",-1,2.5]'])(
    'ignores a malformed saved value: %s',
    (value) => {
      localStorage.setItem(COLLAPSED_CATEGORIES_KEY, value);

      expect(renderHook(() => useCollapsedCategory(2)).result.current[0]).toBe(false);

      act(() => toggleCollapsedCategory(7));
      expect(stored()).toBe('[7]');
    }
  );

  it('follows changes made in another tab', () => {
    const { result } = renderHook(() => useCollapsedCategory(4));

    act(() => {
      localStorage.setItem(COLLAPSED_CATEGORIES_KEY, '[4]');
      window.dispatchEvent(
        new StorageEvent('storage', { key: COLLAPSED_CATEGORIES_KEY })
      );
    });

    expect(result.current[0]).toBe(true);
  });

  it('forgets categories that no longer exist', () => {
    localStorage.setItem(COLLAPSED_CATEGORIES_KEY, '[1,2,3]');

    pruneCollapsedCategories([1, 3, 4]);
    expect(stored()).toBe('[1,3]');

    pruneCollapsedCategories([]);
    expect(stored()).toBeNull();
  });
});
