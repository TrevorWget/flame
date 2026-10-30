export interface MasonryItem {
  height: number;
  wide: boolean;
}

export interface MasonryPlacement {
  // null spans every column
  column: number | null;
  top: number;
  height: number;
}

export interface MasonryLayout {
  placements: MasonryPlacement[];
  height: number;
}

type Row = { wide: number } | { cells: number[] };

// Items keep the cells a `grid-auto-flow: row dense` grid would give them: a
// wide item starts a new full-width row, and every other item takes the first
// free cell from the top, so short items can fill the row above a wide one.
// Each column then stacks its items without gaps, and a wide item starts
// below the tallest column above it.
export const masonryLayout = (
  items: MasonryItem[],
  columns: number
): MasonryLayout => {
  const columnCount = Math.max(1, Math.floor(columns));
  const rows: Row[] = [];

  items.forEach((item, i) => {
    if (item.wide) {
      rows.push({ wide: i });
      return;
    }

    const row = rows.find(
      (r): r is { cells: number[] } => 'cells' in r && r.cells.length < columnCount
    );

    if (row) row.cells.push(i);
    else rows.push({ cells: [i] });
  });

  const placements: MasonryPlacement[] = new Array(items.length);
  const bottoms = new Array<number>(columnCount).fill(0);

  for (const row of rows) {
    if ('wide' in row) {
      const top = Math.max(...bottoms);
      const height = items[row.wide].height;

      placements[row.wide] = { column: null, top, height };
      bottoms.fill(top + height);
    } else {
      row.cells.forEach((i, column) => {
        const top = bottoms[column];
        const height = items[i].height;

        placements[i] = { column, top, height };
        bottoms[column] = top + height;
      });
    }
  }

  return { placements, height: Math.max(...bottoms) };
};
