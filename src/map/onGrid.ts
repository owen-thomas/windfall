/**
 * What is on the grid, read once from the curtailment payload
 * (Windfall_Map_Spec_4c.md §4c.2–4c.3, DECISIONS 029).
 *
 * The headline's sentence ("At least 17% of Scotland's tracked wind is currently
 * being held back from the grid", 4d), the bar's two labels and fill, and every
 * row of the source list are all this one reading, taken from `curtailment.now` and nothing else, so
 * none of them can disagree with another. `instructedMW` is `declaredMW −
 * curtailedMW` — what the balancing mechanism is letting through — over
 * *declared* output, never installed capacity (026's reasoning: capacity counts
 * every farm idle for lack of wind, which understates the share on a windy day).
 *
 * Rounding (4d): what is held back is the lower bound — Windfall counts only
 * instructed turn-downs — so it is floored, both as the headline's percentage
 * (by the caller, `formatPctFloor`) and as the bar's megawatts. The on-grid
 * label is the rounded declared total minus that floor, so the two labels
 * always add up to the declared output and neither overstates the other's
 * claim. `onGridFigure` below is the per-farm row's figure, unchanged from 4c.
 */

import { formatMW } from '../lib/format';
import type { CurtailmentNow } from '../lib/types';

export interface OnGridReading {
  declaredMW: number;
  instructedMW: number;
  /** Megawatts held back (curtailed), clamped to 0–declared. */
  heldMW: number;
  /** Exact on-grid share, 0–100 — the bar's fill. */
  pct: number;
  /** Exact held-back share, 0–100. The headline floors it (4d). */
  heldPct: number;
  /** Nothing is being held down: the on-grid share is a true 100%. */
  allClear: boolean;
  /** The bar's on-grid label: "10,877 MW". */
  onGridLabel: string;
  /** The bar's held-back label: "2,228 MW", floored ("at least"). */
  heldLabel: string;
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
  const heldMW = allClear ? 0 : Math.min(declaredMW, Math.max(0, now.curtailedMW));
  const instructedMW = declaredMW - heldMW;
  const pct = declaredMW > 0 ? (instructedMW / declaredMW) * 100 : 100;
  const heldPct = declaredMW > 0 ? (heldMW / declaredMW) * 100 : 0;

  // 4d: the held-back figure is the lower bound ("at least"), so it is floored;
  // the on-grid figure is what is left of the rounded declared total, so the two
  // labels always add up to it and the on-grid one never undercounts the floor.
  const declaredWhole = Math.round(declaredMW);
  const heldWhole = Math.floor(heldMW);
  return {
    declaredMW,
    instructedMW,
    heldMW,
    pct,
    heldPct,
    allClear,
    onGridLabel: formatMW(declaredWhole - heldWhole),
    heldLabel: formatMW(heldWhole),
  };
}
