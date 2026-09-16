/**
 * Shared shapes for the flow visual. Kept separate from `src/lib/types.ts` —
 * this page shares no data or types with the dashboard, only conventions.
 */

/** A wind farm (or later, other generation) that particles are born at. */
export interface Source {
  id: string;
  name: string;
  /** Raw lat/lon of the physical site. */
  latLon: [number, number];
  /** Snapped-to-mainland override, for sources off the GB mainland polygon. */
  anchor?: [number, number];
  /** Later: 'solar' | 'gas' | 'nuclear' | ... */
  type: 'wind';
  /** Particles/sec. V1: a fixed per-source constant, later live output. */
  rate: number;
  /** Per-source colour channel key, for palette lookup. */
  palette?: string;
  /**
   * True for a source sited at sea (Windfall_Map_Spec.md §5.2 / step 2
   * Part F). buildWorld paints a corridor into the raster mask from this
   * source's own `latLon` to its landing point (see `landing` below) for
   * every source that sets this, so it resolves to its true offshore
   * position rather than being snapped to the coast. Unset (falsy) for
   * /flow's fictional sources, which are never offshore in this sense — a
   * no-op there.
   */
  offshore?: boolean;
  /**
   * [lat, lon] where this source's export cable comes ashore — step 3,
   * Windfall_Map_Spec.md Part A.4. buildWorld paints the corridor to this
   * point rather than to the nearest coast when it's set, for a source that
   * is `offshore` or that names an `islandName`. Falls back to the old
   * nearest-coast walk when unset (harmless for /flow's fictional sources,
   * which never set `offshore` or `islandName` either).
   */
  landing?: [number, number];
  /**
   * Name of a ring in gb-countries.json's `islands` array (step 3) that this
   * source's true position sits on — Viking (Shetland Mainland), Edinbane
   * (Skye). buildWorld folds that island's raster into the mask before
   * painting the corridor, so the source is born on real land rather than
   * at the mainland end of an invisible line. Requires the caller to pass
   * `WorldBuildOptions.islands`; a name with no matching entry there is
   * silently skipped (the source still gets a corridor to `landing`, just
   * without the island rasterized in) rather than erroring, since /flow and
   * the harness's non-`ons` ring runs never pass `islands` at all.
   */
  islandName?: string;
}

/** A point in canvas (pixel) space. */
export type Vec2 = [number, number];
