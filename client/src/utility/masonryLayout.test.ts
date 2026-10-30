import { describe, expect, it } from 'vitest';

import { masonryLayout } from './masonryLayout';

const short = (height: number) => ({ height, wide: false });
const wide = (height: number) => ({ height, wide: true });

describe('masonryLayout', () => {
  it('stacks each column without gaps', () => {
    const { placements, height } = masonryLayout(
      [short(100), short(40), short(60), short(80), short(30), short(50)],
      4
    );

    expect(placements).toEqual([
      { column: 0, top: 0, height: 100 },
      { column: 1, top: 0, height: 40 },
      { column: 2, top: 0, height: 60 },
      { column: 3, top: 0, height: 80 },
      { column: 0, top: 100, height: 30 },
      { column: 1, top: 40, height: 50 },
    ]);
    expect(height).toBe(130);
  });

  it('keeps every category in its column when one collapses', () => {
    const items = [short(100), short(40), short(60), short(80), short(30)];
    const expanded = masonryLayout(items, 4).placements;
    const collapsed = masonryLayout([short(20), ...items.slice(1)], 4).placements;

    expect(collapsed.map(({ column }) => column)).toEqual(
      expanded.map(({ column }) => column)
    );
    expect(collapsed[4]).toEqual({ column: 0, top: 20, height: 30 });
  });

  it('starts a wide item below the tallest column above it', () => {
    const { placements, height } = masonryLayout(
      [short(100), short(40), short(60), short(80), wide(200), short(30)],
      4
    );

    expect(placements[4]).toEqual({ column: null, top: 100, height: 200 });
    expect(placements[5]).toEqual({ column: 0, top: 300, height: 30 });
    expect(height).toBe(330);
  });

  it('fills the row above a wide item like a dense grid', () => {
    const { placements } = masonryLayout(
      [short(50), wide(200), short(70), short(30), short(40), short(10)],
      4
    );

    expect(placements.map(({ column }) => column)).toEqual([0, null, 1, 2, 3, 0]);
    expect(placements[1].top).toBe(70);
    expect(placements[5].top).toBe(270);
  });

  it('stacks everything in order in one column', () => {
    const { placements, height } = masonryLayout(
      [short(10), wide(20), short(30)],
      1
    );

    expect(placements).toEqual([
      { column: 0, top: 0, height: 10 },
      { column: null, top: 10, height: 20 },
      { column: 0, top: 30, height: 30 },
    ]);
    expect(height).toBe(60);
  });

  it('handles no items and nonsense column counts', () => {
    expect(masonryLayout([], 4)).toEqual({ placements: [], height: 0 });
    expect(masonryLayout([short(10), short(5)], 0).placements).toEqual([
      { column: 0, top: 0, height: 10 },
      { column: 0, top: 10, height: 5 },
    ]);
  });
});
