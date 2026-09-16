/**
 * Turns a farm's live output into an emission weight for the particle
 * system — Windfall_Map_Spec.md §5.1/Part E.2. One named function, per the
 * spec, so the mapping from MW to "how many particles a second" is a single
 * place to read and to retune, not folded into the source-building loop.
 *
 * Emission rate is texture, not a figure (020): the floor and cap below
 * exist so 76 real farms read as a tapestry with real proportion between
 * them, not a data readout. Neither end is calibrated to a physical unit —
 * "twice the output" does not have to mean "twice the particles" for the
 * map to be honest, only "more output, more visible thread", which a linear
 * map from 0..capacity delivers.
 */
export interface RateParams {
  /** Particles/sec a farm emits at zero output — a silent or fully curtailed farm still shows a thread, per the spec. */
  floor: number;
  /** Particles/sec cap at full declared capacity — keeps Seagreen (2 GW) from drowning every farm around it. */
  cap: number;
}

export const DEFAULT_RATE_PARAMS: RateParams = { floor: 1, cap: 20 };

/**
 * `instructedMW` is what the farm is actually being allowed to put out
 * (declared minus curtailed) — the honest quantity to drive the flow with,
 * per §4.3: a farm held fully down reads at the floor, not at its declared
 * output. `capacityMW` of 0 (should not occur for a tracked farm, but
 * guards div-by-zero) reads as the floor.
 */
export function rateForMW(
  instructedMW: number,
  capacityMW: number,
  params: RateParams = DEFAULT_RATE_PARAMS,
): number {
  if (!(capacityMW > 0)) return params.floor;
  const fraction = Math.min(1, Math.max(0, instructedMW / capacityMW));
  return params.floor + fraction * (params.cap - params.floor);
}
