/**
 * What is on the grid, read once from the curtailment payload
 * (Windfall_Map_Spec_4c.md §4c.2–4c.3, DECISIONS 029).
 *
 * The headline's sentence ("83% of Scotland's tracked wind is currently on the
 * grid"), the breakdown bar's label and fill, and every row of the source list
 * are all this one reading, taken from `curtailment.now` and nothing else, so
 * none of them can disagree with another. `instructedMW` is `declaredMW −
 * curtailedMW` — what the balancing mechanism is letting through — over
 * *declared* output, never installed capacity (026's reasoning: capacity counts
 * every farm idle for lack of wind, which understates the share on a windy day).
 *
 * Rounding only ever errs low, the conservative principle 003/026 established
 * and 029 applies to the new number: the percentage is floored (by the caller,
 * `formatPctFloor`), and the on-grid megawatts are floored while anything is
 * held down, so a printed figure can never claim more wind is getting through
 * than is. When nothing is held down the on-grid and declared figures are equal
 * and rounded alike, so a clear day reads "13,105 of 13,105 MW", never
 * "13,104 of 13,105". (One corner stays: when under a megawatt is held down the
 * label is exact at megawatt resolution — "5,363 of 5,363 MW" — while the
 * floored percentage reads 99%. Both are true of a 99.99% share.)
 */

import { formatMW } from '../lib/format';
import type { CurtailmentNow } from '../lib/types';

export interface OnGridReading {
  declaredMW: number;
  instructedMW: number;
  /** Exact on-grid share, 0–100 — the bar's fill. The sentence floors it (`formatPctFloor`). */
  pct: number;
  /** Nothing is being held down: the on-grid share is a true 100%. */
  allClear: boolean;
  /** The bar's label, on-grid half: "10,971". Split from `declaredLabel` so the
   *  view can set "of" in its own, smaller size between the two. */
  onGridLabel: string;
  /** The bar's label, declared half: "13,105 MW". */
  declaredLabel: string;
  /** The plain sentence for the aria-hidden bar: "10,971 of the 13,105 MW Scotland is making is on the grid." */
  sentence: string;
}

/**
 * On-grid megawatts as a bare, grouped integer. Floored while anything is held
 * down (`held`), rounded like its denominator when nothing is.
 */
export function onGridFigure(instructedMW: number, held: boolean): string {
  return (held ? Math.floor(instructedMW) : Math.round(instructedMW)).toLocaleString('en-GB');
}

export function readOnGrid(now: Pick<CurtailmentNow, 'curtailedMW' | 'farms'>): OnGridReading {
  const declaredMW = now.farms.reduce((sum, f) => sum + f.declaredMW, 0);
  const allClear = now.curtailedMW <= 0;

  // Clamped, so a curtailed figure that ran past the declared one reads as
  // none on the grid, never as a negative share.
  const instructedMW = allClear
    ? declaredMW
    : Math.min(declaredMW, Math.max(0, declaredMW - now.curtailedMW));
  const pct = declaredMW > 0 ? (instructedMW / declaredMW) * 100 : allClear ? 100 : 0;

  const onGrid = onGridFigure(instructedMW, !allClear);
  return {
    declaredMW,
    instructedMW,
    pct,
    allClear,
    onGridLabel: onGrid,
    declaredLabel: formatMW(declaredMW),
    // The first figure is bare because the second's "MW" covers both (026's phrasing).
    sentence: `${onGrid} of the ${formatMW(declaredMW)} Scotland is making is on the grid.`,
  };
}
