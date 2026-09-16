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
   * source's own `latLon` to its nearest coast point for every source that
   * sets this, so it resolves to its true offshore position rather than
   * being snapped to the coast. Unset (falsy) for /flow's fictional
   * sources, which are never offshore in this sense — a no-op there.
   */
  offshore?: boolean;
}

/** A point in canvas (pixel) space. */
export type Vec2 = [number, number];
