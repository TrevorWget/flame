import { RefObject, useLayoutEffect, useRef } from 'react';

import { masonryLayout } from '../../../utility/masonryLayout';
import classes from './Masonry.module.css';

const DURATION = 250;
const EASING = 'cubic-bezier(0.2, 0, 0, 1)';

export const prefersReducedMotion = (): boolean =>
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// The computed track list includes implicit columns, which cards placed in
// a column that no longer exists would create, so it's read unplaced
const columnCount = (grid: HTMLElement, cards: HTMLElement[]): number => {
  for (const card of cards) {
    card.style.gridColumn = '';
    card.style.gridRow = '';
  }

  return getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean)
    .length;
};

const outerHeight = (el: HTMLElement): number => {
  const { marginTop, marginBottom } = getComputedStyle(el);

  return (
    el.getBoundingClientRect().height +
    (parseFloat(marginTop) || 0) +
    (parseFloat(marginBottom) || 0)
  );
};

// Lays a grid's cards out in columns that each stack their cards without
// gaps, and slides the cards (and the grid's height) to their new places
// whenever a card changes size. The grid's CSS still decides the columns.
class Masonry {
  readonly grid: HTMLElement;
  private readonly isWide: () => boolean[];
  private readonly observer: ResizeObserver;
  private readonly observed = new Set<Element>();
  private readonly placed = new WeakSet<Element>();
  private animations = new Map<Element, Animation>();
  private lastKey = '';
  private lastWidth = -1;
  private layoutKey = '';
  private columns = 0;

  constructor(grid: HTMLElement, isWide: () => boolean[]) {
    this.grid = grid;
    this.isWide = isWide;
    this.observer = new ResizeObserver((entries) => {
      // The grid's own height changes with every layout and animation frame;
      // only a new width can change its columns
      const relevant = entries.some(
        ({ target, contentRect }) =>
          target !== grid || Math.round(contentRect.width) !== this.lastWidth
      );

      if (relevant) this.layout();
    });
    this.observer.observe(grid);
  }

  // A new layoutKey means the CSS columns may have changed at the same width
  update(layoutKey = ''): void {
    const cards = new Set(this.grid.children);

    if (layoutKey !== this.layoutKey) {
      this.layoutKey = layoutKey;
      this.lastWidth = -1;
    }

    for (const card of this.observed) {
      if (!cards.has(card)) {
        this.observer.unobserve(card);
        this.observed.delete(card);
      }
    }

    for (const card of cards) {
      if (!this.observed.has(card)) {
        this.observer.observe(card);
        this.observed.add(card);
      }
    }

    this.layout();
  }

  private layout(): void {
    const { grid } = this;
    const cards = [...grid.children] as HTMLElement[];
    const width = Math.round(grid.getBoundingClientRect().width);
    const resized = width !== this.lastWidth;

    if (resized) {
      this.lastWidth = width;
      this.columns = columnCount(grid, cards);
    }

    const { columns } = this;

    if (!columns) return;

    const wide = this.isWide();
    const heights = cards.map((card) => Math.ceil(outerHeight(card)));
    const key = `${columns}:${wide.join()}:${heights.join()}`;

    if (
      !resized &&
      key === this.lastKey &&
      cards.every((card) => this.placed.has(card))
    ) {
      return;
    }
    this.lastKey = key;

    const animate =
      !resized && !prefersReducedMotion() && typeof grid.animate === 'function';

    // Where everything is on screen now, mid-animation included
    const origin = grid.getBoundingClientRect();
    const before = cards.map((card) => {
      if (!animate || !this.placed.has(card)) return null;

      const { left, top } = card.getBoundingClientRect();

      return { x: left - origin.left, y: top - origin.top };
    });

    const { placements } = masonryLayout(
      cards.map((_, i) => ({ height: heights[i], wide: !!wide[i] })),
      columns
    );

    cards.forEach((card, i) => {
      const { column, top, height } = placements[i];

      card.style.gridColumn = column === null ? '1 / -1' : `${column + 1}`;
      card.style.gridRow = `${top + 1} / span ${Math.max(1, height)}`;
      this.placed.add(card);
    });

    this.animations.forEach((animation) => animation.cancel());
    this.animations = new Map();

    if (!animate) return;

    const after = grid.getBoundingClientRect();
    const moves = cards.map((card, i) => {
      const from = before[i];

      if (!from) return null;

      const { left, top } = card.getBoundingClientRect();
      const dx = from.x - (left - after.left);
      const dy = from.y - (top - after.top);

      return Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 ? null : { card, dx, dy };
    });

    for (const move of moves) {
      if (!move) continue;

      this.animations.set(
        move.card,
        move.card.animate(
          [
            { transform: `translate(${move.dx}px, ${move.dy}px)` },
            { transform: 'none' },
          ],
          { duration: DURATION, easing: EASING }
        )
      );
    }

    // Lets the content below the grid slide too instead of jumping
    if (Math.abs(after.height - origin.height) >= 0.5) {
      this.animations.set(
        grid,
        grid.animate(
          [{ height: `${origin.height}px` }, { height: `${after.height}px` }],
          { duration: DURATION, easing: EASING }
        )
      );
    }
  }

  destroy(): void {
    this.observer.disconnect();
    this.animations.forEach((animation) => animation.cancel());

    for (const card of this.grid.children as HTMLCollectionOf<HTMLElement>) {
      card.style.gridColumn = '';
      card.style.gridRow = '';
    }
  }
}

// Wide cards span every column. Needs ResizeObserver; without it the grid
// keeps its normal row layout. `layoutKey` changes with the grid's settings.
export const useMasonry = <T extends HTMLElement>(
  enabled: boolean,
  wide: boolean[],
  layoutKey = ''
): { ref: RefObject<T>; className: string } => {
  const ref = useRef<T>(null);
  const masonry = useRef<Masonry | null>(null);
  const wideRef = useRef(wide);
  const active = enabled && typeof ResizeObserver !== 'undefined';

  wideRef.current = wide;

  // Every render, as the cards or the grid element itself may have changed
  useLayoutEffect(() => {
    const grid = active ? ref.current : null;

    if (masonry.current?.grid !== grid) {
      masonry.current?.destroy();
      masonry.current = grid ? new Masonry(grid, () => wideRef.current) : null;
    }

    masonry.current?.update(layoutKey);
  });

  useLayoutEffect(
    () => () => {
      masonry.current?.destroy();
      masonry.current = null;
    },
    []
  );

  return { ref, className: active ? classes.Masonry : '' };
};
