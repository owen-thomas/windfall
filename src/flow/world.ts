import gbMainland from './data/gb-mainland.json';
import { buildDistanceField, type DistanceField } from './distanceField';
import { buildDivergentField, type DivergentField } from './divergentField';
import { buildGeodesicField, type GeodesicField } from './geodesicField';
import { buildRasterMask, paintCapsule, scanlineFillMask, type RasterMask } from './mask';
import { buildProjection, type Projection, type ProjectionOptions } from './projection';
import { buildRegions, type Regions } from './regions';
import { buildTargetFields, type TargetField } from './targetField';
import { originOf } from './sources';
import type { Source, Vec2 } from './types';

export const GB_RING = (gbMainland as unknown as { ring: [number, number][] }).ring;

/** Minimum device-px clearance from the coast a snapped source is walked to. */
const SNAP_BUFFER_PX = 24;

/**
 * Default offshore-corridor radius, device px — "about twice steerThreshold"
 * per Windfall_Map_Spec.md §5.2, using DEFAULT_FIELD_PARAMS.steerThreshold
 * (18) as the reference value since buildWorld has no FieldParams of its
 * own. Callers with a live, possibly-retuned steerThreshold (the /map
 * control panel) pass their own via WorldBuildOptions.corridorWidthPx.
 */
const DEFAULT_CORRIDOR_WIDTH_PX = 36;

/** A source resolved to canvas space, snapped inside the mask if needed. */
export interface ResolvedSource {
  source: Source;
  /** Canvas (device-pixel) position particles actually emit from. */
  position: Vec2;
  /** True if the source's origin projected outside the mask and was auto-snapped. */
  wasSnapped: boolean;
}

/** A destination particles can head for (field.ts's `baseFieldMode: 'targets'`) — /map's cities. */
export interface Target {
  id: string;
  name: string;
  latLon: [number, number];
  /** Relative pull — /map passes population. Only ratios between targets matter. */
  weight: number;
}

/** A target resolved to canvas space, with its own path-over-land field. */
export interface ResolvedTarget {
  target: Target;
  position: Vec2;
  field: TargetField;
}

export interface World {
  projection: Projection;
  mask: RasterMask;
  distanceField: DistanceField;
  sources: ResolvedSource[];
  /**
   * The largest signed distance value anywhere on the mainland — i.e. the
   * single most-inland point's distance to the coast, in device px.
   * Measured directly from this world's distance field rather than
   * hardcoded, so it stays correct across viewport sizes and any future
   * coastline edits. Used by field.ts to normalise the whole-interior
   * centering term (step 2b) against an actual, current figure instead of
   * an eyeballed constant.
   */
  maxInteriorDist: number;
  /**
   * Path-aware "which way is actually south" field (see geodesicField.ts) —
   * a multi-source BFS from the southern goal band, giving every interior
   * cell its geodesic distance-to-south and gradient. Tried after both
   * field-parameter retuning and coastline-data pruning failed to move a
   * death hotspot at the Scotland/England border: that border is a genuine
   * narrow waist, and a purely local field (straight-line south + nearby-
   * coast steering) has no way to "see" it's approaching a re-entrant bay
   * rather than open coastline.
   */
  geodesicField: GeodesicField;
  /**
   * Divergent "away from sources" field (see divergentField.ts) — 2f of
   * `Flow experiment fan-out.txt`. The default base-direction field
   * (field.ts's `baseFieldMode`); `geodesicField` above is kept alongside
   * it, unused by default, purely so the two can be A/B'd against each
   * other (browser: 'f' key; harness: --baseFieldMode).
   */
  divergentField: DivergentField;
  /** Destinations for `baseFieldMode: 'targets'`, each with its own field. Empty unless WorldBuildOptions.targets is passed (/flow never does). */
  targets: ResolvedTarget[];
  /** The land cut into regions for `baseFieldMode: 'blanket'` (see regions.ts). Null unless WorldBuildOptions.regionCount is passed (/flow never does). */
  regions: Regions | null;
}

export interface WorldBuildOptions {
  /** Overrides divergentField.ts's default anisotropic BFS cost — see its docs. */
  divergentNorthwardCostMultiplier?: number;
  /** Offshore-corridor diameter, device px — see DEFAULT_CORRIDOR_WIDTH_PX's own docs. Only used when at least one source sets `offshore: true`. */
  corridorWidthPx?: number;
  /**
   * Named island rings (gb-countries.json's `islands`, step 3) — the ring a
   * source's `islandName` points at is rasterized into the mask before its
   * corridor is painted, so an island farm is born on real land rather than
   * at the empty mainland end of an invisible line (Windfall_Map_Spec.md
   * Part A.4). Only ever read for sources that set `islandName`; /flow and
   * the flow-harness's fictional-source runs never pass this.
   */
  islands?: { name: string; ring: [number, number][] }[];
  /**
   * Fit the Projection's extent to a different set of lat/lon points than
   * the mask itself is built from — step 3's "true extent" mode fits the
   * projection to mainland-plus-islands (so Shetland sits where it is) while
   * the mask still only ever contains the mainland ring plus whatever
   * corridors/islands the sources above add. Defaults to `ring` (the
   * existing, pre-step-3 behaviour) when omitted.
   */
  projectionRing?: [number, number][];
  /**
   * Overrides the Projection's padding — see `ProjectionOptions`. Map step 4b
   * passes an exact `paddingPx`; /flow and the harness omit it and keep the
   * fractional default.
   */
  projectionOptions?: ProjectionOptions;
  /** Destinations for `baseFieldMode: 'targets'` — see `Target`. One field is built per target, after corridors are painted. */
  targets?: Target[];
  /** How many regions to cut the land into for `baseFieldMode: 'blanket'` — see regions.ts. Omit to skip building them. */
  regionCount?: number;
}

/**
 * Walk from a point toward the GB interior along the distance field's
 * gradient until it lands inside the mask. Used to auto-snap a source
 * whose origin falls just outside the simplified coastline (an artefact
 * of Douglas-Peucker tolerance, e.g. a narrow spur like Kyle of Lochalsh
 * being shaved off) rather than hard-failing on it.
 *
 * The gradient of the signed distance field points from low values
 * (further outside / nearer coast) toward high values (interior), so
 * following it — even from an outside starting point — heads inward.
 *
 * Walks past the first inside pixel to `buffer` device px of clearance,
 * not just past distance zero. A source that lands exactly on the
 * waterline has no margin at all — a particle emitted there dies to
 * mask-exit on its very first steps, before the field has any distance to
 * steer it. This is the same reason real wind farms aren't built in the
 * intertidal zone; a snapped source should behave like an inland one.
 */
function snapInside(
  start: Vec2,
  mask: RasterMask,
  distanceField: DistanceField,
  buffer: number,
): Vec2 {
  let [x, y] = start;
  const step = distanceField.cellSize;
  const maxSteps = Math.ceil((mask.width + mask.height) / step) + 50;

  for (let i = 0; i < maxSteps; i++) {
    if (mask.isInside(x, y) && distanceField.sample(x, y).dist >= buffer) return [x, y];
    const { gx, gy } = distanceField.sample(x, y);
    if (gx === 0 && gy === 0) {
      // No local gradient (flat/interior of a large uniform region this
      // shouldn't happen near a boundary) — nudge toward canvas centre as
      // a last resort so the walk doesn't stall.
      const cx = mask.width / 2;
      const cy = mask.height / 2;
      const dx = cx - x;
      const dy = cy - y;
      const len = Math.hypot(dx, dy) || 1;
      x += (dx / len) * step;
      y += (dy / len) * step;
      continue;
    }
    x += gx * step;
    y += gy * step;
  }
  return [x, y];
}

export function buildWorld(
  ring: [number, number][],
  sourceList: Source[],
  viewportWidth: number,
  viewportHeight: number,
  options: WorldBuildOptions = {},
): World {
  const projection = buildProjection(
    options.projectionRing ?? ring,
    viewportWidth,
    viewportHeight,
    options.projectionOptions,
  );
  const mask = buildRasterMask(ring, projection, viewportWidth, viewportHeight);

  // Step 3 Part A.4: fold in the island a source sits on, for every source
  // that names one, *before* any corridor is painted — so the corridor's
  // island-side endpoint lands on real rasterized land rather than empty
  // sea/nothing. A name with no entry in options.islands is skipped rather
  // than erroring (see Source.islandName's own docs).
  const islandsByName = new Map((options.islands ?? []).map((i) => [i.name, i.ring]));
  for (const source of sourceList) {
    if (!source.islandName) continue;
    const islandRing = islandsByName.get(source.islandName);
    if (!islandRing) continue;
    const islandMask = scanlineFillMask(islandRing.map(projection.project), mask.width, mask.height);
    for (let i = 0; i < mask.data.length; i++) {
      if (islandMask[i]) mask.data[i] = 1;
    }
  }

  // Step 2 Part F, extended in step 3 Part A.4: paint a corridor — a
  // capsule from the source's own projected position to its landing point
  // — into the mask for every source that sets `offshore` or `islandName`,
  // *before* the distance, geodesic and divergent fields are built below,
  // so a corridor cell is simply interior to every one of them
  // (Windfall_Map_Spec.md §5.2). The SVG island drawn on top is untouched —
  // this only ever extends the canvas mask into the sea (or, for an island
  // farm, connects the now-rasterized island to the mainland). A no-op when
  // no source sets either flag (/flow's fictional sources never do).
  const corridorSources = sourceList.filter((s) => s.offshore || s.islandName);
  if (corridorSources.length > 0) {
    const preCorridorDistanceField = buildDistanceField(mask);
    const radius = (options.corridorWidthPx ?? DEFAULT_CORRIDOR_WIDTH_PX) / 2;
    for (const source of corridorSources) {
      const projected = projection.project(originOf(source));
      let landing: Vec2;
      if (source.landing) {
        const projectedLanding = projection.project(source.landing);
        // A named landing point should already sit on the mainland; snap it
        // in only if the simplified coastline puts it just outside (the
        // same Douglas-Peucker artefact snapInside exists for elsewhere in
        // this function), rather than always re-walking from scratch.
        landing = mask.isInside(projectedLanding[0], projectedLanding[1])
          ? projectedLanding
          : snapInside(projectedLanding, mask, preCorridorDistanceField, 0);
      } else {
        // No named landing (shouldn't happen for a real farm past step 3 —
        // see DECISIONS 024 — but kept as a fallback for any future source
        // that sets `offshore`/`islandName` without one): walk from the
        // source's own position to the nearest coast, as step 2 always did.
        // buffer=0: walk exactly to the first inside pixel — "where the
        // cable lands" — not past it with the source-snap's clearance
        // margin, which would shorten the corridor's coast end for no reason.
        landing = snapInside(projected, mask, preCorridorDistanceField, 0);
      }
      paintCapsule(mask.data, mask.width, mask.height, projected, landing, radius);
    }
  }

  const distanceField = buildDistanceField(mask);
  const geodesicField = buildGeodesicField(mask);

  const sources: ResolvedSource[] = sourceList.map((source) => {
    const origin = originOf(source);
    const projected = projection.project(origin);
    if (mask.isInside(projected[0], projected[1])) {
      return { source, position: projected, wasSnapped: false };
    }
    const snapped = snapInside(projected, mask, distanceField, SNAP_BUFFER_PX);
    console.warn(
      `[flow] Source "${source.id}" (${source.name}) origin projects outside the GB ` +
        `mask at [${projected[0].toFixed(1)}, ${projected[1].toFixed(1)}]; ` +
        `auto-snapped to [${snapped[0].toFixed(1)}, ${snapped[1].toFixed(1)}]. ` +
        `Likely a coastline-simplification artefact — check this source's coordinates ` +
        `if the snap distance looks large.`,
    );
    return { source, position: snapped, wasSnapped: true };
  });

  let maxInteriorDist = 0;
  for (let i = 0; i < distanceField.distance.length; i++) {
    const d = distanceField.distance[i];
    if (d > maxInteriorDist) maxInteriorDist = d;
  }

  // Built from the sources' final resolved (post-snap) positions, so a
  // snapped source (Edinbane, Seagreen) diverges from its actual mainland
  // anchor, not its off-mainland raw coordinate.
  const divergentField = buildDivergentField(
    mask,
    sources.map((s) => s.position),
    undefined,
    options.divergentNorthwardCostMultiplier,
  );

  const targetList = options.targets ?? [];
  const targetPositions = targetList.map((target) => projection.project(target.latLon));
  const targetFields = buildTargetFields(mask, targetPositions, distanceField);
  const targets: ResolvedTarget[] = targetList.map((target, i) => ({
    target,
    position: targetPositions[i],
    field: targetFields[i],
  }));

  const regions = options.regionCount ? buildRegions(mask, distanceField, options.regionCount) : null;

  return {
    projection,
    mask,
    distanceField,
    sources,
    maxInteriorDist,
    geodesicField,
    divergentField,
    targets,
    regions,
  };
}
