import { describe, expect, it } from 'vitest';
import { fromLayout, grid, toLayout } from './seat-layout-editor';

const HIACE = { rows: [['D', null, '1', '2'], ['3', '4', null, '5'], ['6', '7', null, '8'], ['9', '10', null, '11'], ['12', '13', '14', null]], front: ['1', '2'] };
const seats = (l: { rows: (string | null)[][] }) => l.rows.flat().filter((x) => x && x !== 'D');

describe('seat layout editor', () => {
  it('round-trips the Hiace layout exactly (labels + front seats)', () => {
    const { cells, front } = fromLayout(HIACE);
    expect(toLayout(cells, front)).toEqual(HIACE);
  });
  it('templates give the expected capacity, numbered 1..N without duplicates', () => {
    for (const [g, n] of [[grid(2, 2, 11, 0, true), 45], [grid(2, 2, 7, 0, true), 29]] as const) {
      const l = toLayout(g.cells, g.front);
      expect(seats(l)).toEqual(Array.from({ length: n }, (_, i) => String(i + 1)));
      expect(l.rows.flat().filter((x) => x === 'D')).toHaveLength(1);
    }
  });
  it('renumbers after removing a seat; front seats follow their position', () => {
    const { cells, front } = fromLayout(HIACE);
    cells[1][0] = null; // seat 3 → aisle
    const l = toLayout(cells, front);
    expect(seats(l)).toHaveLength(13);
    expect(l.front).toEqual(['1', '2']);
    expect(l.rows[1]).toEqual([null, '3', null, '4']);
  });
});
