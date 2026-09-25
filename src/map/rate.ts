/**
 * Turns the farms' live output into the flow — Windfall_Map_Spec.md
 * §5.1/Part E.2, made strictly proportional (Owen): the flow shows what is on
 * the grid and nothing else.
 *
 * - How many particles: the tracked farms' combined MW on the grid as a share
 *   of their combined capacity (`flowDensity`), with no floor — a calm or
 *   fully held-down period shows correspondingly little, and nothing on the
 *   grid shows nothing.
 * - Whose particles: each farm's MW on the grid as a share of the total
 *   (`rateForMW`). A farm putting nothing on the grid — silent, idle, or held
 *   down entirely — emits none.
 *
 * Still texture, not a figure (020): the density follows the share but isn't
 * a scale anyone is meant to read MW off.
 */

/**
 * A farm's emission weight: its MW on the grid (`instructedMW`, declared
 * minus curtailed — the same quantity as the "on the grid" figure). Only
 * ratios between farms matter to the particle system, so the weight is the
 * MW itself.
 */
export function rateForMW(instructedMW: number): number {
  return Math.max(0, instructedMW);
}

/**
 * How much of the particle pool to show, 0..1: combined MW on the grid over
 * combined capacity. 0 with no farm data at all — degraded, offline and
 * waiting states show no flow.
 */
export function flowDensity(farms: { instructedMW: number; capacityMW: number }[] | null): number {
  if (!farms || farms.length === 0) return 0;
  let instructed = 0;
  let capacity = 0;
  for (const farm of farms) {
    instructed += Math.max(0, farm.instructedMW);
    capacity += Math.max(0, farm.capacityMW);
  }
  if (!(capacity > 0)) return 0;
  return Math.min(1, instructed / capacity);
}
