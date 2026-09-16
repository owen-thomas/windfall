/**
 * Build the England/Scotland/Wales geometry used by the /map page: the
 * mainland island shape, the Scotland–England border, and the three
 * country rings — modelled on build-gb-outline.ts, which builds the
 * equivalent single GB ring for /flow.
 *
 * Source: ONS Open Geography Portal, "Countries (December 2023) Boundaries
 * UK BGC" (generalised to 20m, clipped to the coastline / Mean High Water
 * mark) — the BGC (generalised-clipped) layer, per the plan's preference;
 * BUC (ultra-generalised) was not needed, BGC returns in ~17s at a
 * geometryPrecision of 6dp.
 *   Portal page: https://geoportal.statistics.gov.uk/datasets/countries-december-2023-boundaries-uk-bgc
 *   ArcGIS FeatureServer: https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Countries_December_2023_Boundaries_UK_BGC/FeatureServer/0
 *   Layer: CTRY_DEC_2023_UK_BGC, fields CTRY23CD/CTRY23NM identify the country.
 * Requested directly as WGS84 GeoJSON (`outSR=4326&f=geojson`) so no BNG
 * conversion is needed in this script — the ArcGIS server reprojects.
 * Northern Ireland is dropped by the `where` clause; England, Scotland and
 * Wales each come back as a MultiPolygon (mainland plus every island), and
 * the mainland ring is picked the same way build-gb-outline.ts picks GB
 * out of the UK feature: largest ring by area, by a wide margin.
 *
 * Four outputs, all in lat/lon like gb-mainland.json:
 *   - `island`: the union of the three mainland rings — the raster mask.
 *   - `border`: the open polyline shared by the Scotland and England
 *     mainland rings, Solway to the Tweed.
 *   - `countries`: the three mainland rings, lightly simplified.
 *   - `islands`: every non-mainland ring across the three countries whose
 *     raw shoelace area (same units as mainlandRing()'s own area-margin
 *     logging — unprojected [lon,lat] degrees²) is at or above
 *     ISLAND_AREA_THRESHOLD (step 3, Windfall_Map_Spec.md Part A.1). Named
 *     by nearest-centroid match against a curated table (ISLAND_NAMES) so a
 *     re-fetch that reorders MultiPolygon parts doesn't silently relabel an
 *     island — an unmatched ring throws rather than shipping unnamed. See
 *     DECISIONS.md 024 for the threshold's derivation and the resulting list.
 *
 * The union and the border are both found by rasterizing the three
 * mainland rings (the same primitives mask.ts already exports) rather than
 * by vector polygon boolean ops: England and Scotland's independently
 * generalised rings are not guaranteed to share exact vertices along their
 * common edge, but their filled rasters are exactly adjacent (up to a
 * pixel), which is a much easier property to compute against.
 *
 * Not part of the build — this is a one-off/rerunnable data prep step.
 * Run with: npx tsx scripts/build-gb-countries.ts
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dilate, erode, scanlineFillMask } from '../src/flow/mask';

/** The ArcGIS endpoint is slow and occasionally 504s on this query; cache the raw response outside the repo so a retry during dev doesn't re-fetch 7MB every time. Delete the file to force a re-fetch. */
const FETCH_CACHE_PATH = join(tmpdir(), 'windfall-build-gb-countries-cache.json');

const FEATURE_SERVER_URL =
  'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/' +
  'Countries_December_2023_Boundaries_UK_BGC/FeatureServer/0/query';
const OUTPUT_PATH = fileURLToPath(new URL('../src/map/data/gb-countries.json', import.meta.url));

const ISLAND_TARGET_POINTS = 1200;
/** Per spec: "lightly simplified" — far less aggressive than the island union. */
const COUNTRY_TARGET_POINTS = 600;
/** The border is short (Solway to the Tweed); this keeps it smooth without much data. */
const BORDER_TARGET_POINTS = 300;

/**
 * Raw shoelace area (unprojected [lon,lat] degrees², matching mainlandRing's
 * own area-margin logging), at or above which a non-mainland ring is drawn
 * as an island. Chosen empirically (see scratch exploration logged in
 * DECISIONS.md 024): 0.015 yields exactly the ring the plan names —
 * Shetland Mainland, Yell, Unst, Orkney Mainland, Hoy, Lewis and Harris,
 * Skye, Raasay, Mull, Islay, Jura, Arran, Bute, North Uist, South Uist
 * (Scotland), Anglesey (Wales) and Isle of Wight (England) — 17 rings, none
 * of them a skerry, with the next-largest excluded ring (Isle of Sheppey,
 * Kent) well below it.
 */
const ISLAND_AREA_THRESHOLD = 0.015;
/** Island ring point-count scales with sqrt(area) so a big island (Lewis
 * and Harris) gets meaningfully more detail than a small one (Raasay)
 * without a bespoke target per ring. */
const ISLAND_POINTS_PER_SQRT_AREA = 800;
const ISLAND_MIN_POINTS = 60;
const ISLAND_MAX_POINTS = 400;

function islandTargetPoints(area: number): number {
  const raw = Math.round(ISLAND_POINTS_PER_SQRT_AREA * Math.sqrt(area));
  return Math.max(ISLAND_MIN_POINTS, Math.min(ISLAND_MAX_POINTS, raw));
}

/**
 * Curated name for every ring ISLAND_AREA_THRESHOLD is expected to select,
 * matched by nearest centroid rather than by MultiPolygon part index (which
 * ArcGIS gives no ordering guarantee over). `near` is [lat, lon], read off
 * the same exploration that picked the threshold.
 */
const ISLAND_NAMES: { name: string; near: [number, number] }[] = [
  { name: 'Lewis and Harris', near: [58.11, -6.67] },
  { name: 'Skye', near: [57.33, -6.27] },
  { name: 'Shetland Mainland', near: [60.25, -1.35] },
  { name: 'Mull', near: [56.42, -6.08] },
  { name: 'Orkney Mainland', near: [58.95, -3.03] },
  { name: 'Islay', near: [55.75, -6.31] },
  { name: 'Arran', near: [55.57, -5.21] },
  { name: 'Jura', near: [55.98, -5.89] },
  { name: 'North Uist', near: [57.6, -7.25] },
  { name: 'South Uist', near: [57.26, -7.29] },
  { name: 'Yell', near: [60.63, -1.09] },
  { name: 'Hoy', near: [58.83, -3.28] },
  { name: 'Unst', near: [60.77, -0.87] },
  { name: 'Bute', near: [55.81, -5.09] },
  { name: 'Raasay', near: [57.0, -6.35] },
  { name: 'Anglesey', near: [53.3, -4.39] },
  { name: 'Isle of Wight', near: [50.7, -1.37] },
];
/** A named-island centroid may drift a little between ONS releases; this is generous margin without risking a cross-match between two real islands (the closest pair, Yell/Unst, are ~0.4° apart). */
const ISLAND_NAME_MATCH_RADIUS_DEG = 0.3;

// Proxy viewport for the raster union/border extraction — same convention
// as build-gb-outline.ts's spur-pruning pass (a plausible mid-range-laptop
// scale), though this pass isn't sensitive to that specific tuning; it's
// reused here only for consistency, not because the two must match.
const PROXY_VIEWPORT_WIDTH = 2400;
const PROXY_VIEWPORT_HEIGHT = 1600;
/** Device px (at the proxy resolution) an England boundary point may be from a Scotland pixel and still count as "on the border". Covers independent-generalisation seam gaps between the two rings. */
const BORDER_ADJACENCY_RADIUS_PX = 3;

type LonLat = [number, number];

// --- Shared geometry primitives (duplicated from build-gb-outline.ts; both
// scripts are deliberately self-contained one-offs, per that file's own
// docs, rather than sharing a build-time-only module). ------------------

/** Shoelace formula, absolute value — good enough to compare ring sizes. */
function ringArea(ring: LonLat[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** Perpendicular distance from point p to the line through a-b. */
function perpDistance(p: LonLat, a: LonLat, b: LonLat): number {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * Douglas-Peucker over a point list — open, not ring-aware, so it works
 * unchanged on both a closed ring (first === last, both endpoints kept)
 * and an open polyline like the border. Iterative via an explicit work
 * stack (see build-gb-outline.ts's identical docs on why).
 */
function douglasPeucker(points: LonLat[], tolerance: number): LonLat[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [startIdx, endIdx] = stack.pop()!;
    if (endIdx - startIdx < 2) continue;

    const first = points[startIdx];
    const last = points[endIdx];
    let maxDist = 0;
    let maxIndex = -1;
    for (let i = startIdx + 1; i < endIdx; i++) {
      const dist = perpDistance(points[i], first, last);
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }
    if (maxDist > tolerance && maxIndex !== -1) {
      keep[maxIndex] = 1;
      stack.push([startIdx, maxIndex]);
      stack.push([maxIndex, endIdx]);
    }
  }

  const result: LonLat[] = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) result.push(points[i]);
  }
  return result;
}

/** Binary-search a DP tolerance (in projected-space units) landing near targetCount points. */
function simplifyToCount(projected: LonLat[], targetCount: number): number[] {
  let lo = 0;
  let hi = 5;
  let bestIndices: number[] | null = null;
  const tagged = projected.map((p, i) => [p[0], p[1], i] as unknown as LonLat);

  for (let iter = 0; iter < 30; iter++) {
    const tolerance = (lo + hi) / 2;
    const simplified = douglasPeucker(tagged, tolerance);
    const count = simplified.length;
    if (Math.abs(count - targetCount) <= 5 || hi - lo < 1e-7) {
      bestIndices = simplified.map((p) => (p as unknown as [number, number, number])[2]);
      break;
    }
    if (count > targetCount) lo = tolerance;
    else hi = tolerance;
    bestIndices = simplified.map((p) => (p as unknown as [number, number, number])[2]);
  }
  return bestIndices ?? projected.map((_, i) => i);
}

/** 4-connected flood-fill labelling. Returns each pixel's component label (0 = background) and each label's pixel count. */
function labelConnectedComponents(
  data: Uint8Array,
  width: number,
  height: number,
): { label: Int32Array; sizes: Map<number, number> } {
  const label = new Int32Array(width * height);
  const sizes = new Map<number, number>();
  const queue = new Int32Array(width * height);
  let nextLabel = 1;

  for (let start = 0; start < data.length; start++) {
    if (data[start] !== 1 || label[start] !== 0) continue;
    let qHead = 0;
    let qTail = 0;
    queue[qTail++] = start;
    label[start] = nextLabel;
    let size = 0;
    while (qHead < qTail) {
      const idx = queue[qHead++];
      size++;
      const x = idx % width;
      const y = (idx / width) | 0;
      const neighbours: [number, number][] = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];
      for (const [nx, ny] of neighbours) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (data[nIdx] === 1 && label[nIdx] === 0) {
          label[nIdx] = nextLabel;
          queue[qTail++] = nIdx;
        }
      }
    }
    sizes.set(nextLabel, size);
    nextLabel++;
  }
  return { label, sizes };
}

const TRACE_DIRS: [number, number][] = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

/** Moore-neighbour boundary tracing — see build-gb-outline.ts's identical function for the full rationale. */
function traceBoundary(data: Uint8Array, width: number, height: number): [number, number][] {
  const isInside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && data[y * width + x] === 1;

  let startX = -1;
  let startY = -1;
  outer: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isInside(x, y)) {
        startX = x;
        startY = y;
        break outer;
      }
    }
  }
  if (startX === -1) throw new Error('traceBoundary: no foreground pixels found');

  const boundary: [number, number][] = [[startX, startY]];
  let cx = startX;
  let cy = startY;
  let backtrackDir = 6;
  const maxSteps = width * height;

  for (let step = 0; step < maxSteps; step++) {
    let foundDir = -1;
    for (let k = 1; k <= 8; k++) {
      const d = (backtrackDir + k) % 8;
      const [dx, dy] = TRACE_DIRS[d];
      if (isInside(cx + dx, cy + dy)) {
        foundDir = d;
        break;
      }
    }
    if (foundDir === -1) break;

    backtrackDir = (foundDir + 4) % 8;
    cx += TRACE_DIRS[foundDir][0];
    cy += TRACE_DIRS[foundDir][1];

    if (cx === startX && cy === startY) break;
    boundary.push([cx, cy]);
  }

  return boundary;
}

/**
 * Spur pruning, ported unchanged from build-gb-outline.ts and defaulted
 * off for the same reason: a harness before/after on the Natural Earth
 * ring found it measurably worse for throughput, not better (see that
 * file's ENABLE_SPUR_PRUNING docs). Not independently re-evaluated against
 * this ONS ring — carried over as available infrastructure, per the plan,
 * not re-tuned.
 */
const ENABLE_SPUR_PRUNING = false;
const OPENING_RADIUS_PX = 10;

function pruneThinSpurs(
  ring: [number, number][],
  project: (latLon: [number, number]) => [number, number],
  unproject: (x: number, y: number) => [number, number],
  width: number,
  height: number,
): [number, number][] {
  const projectedPoints = ring.map(project);
  let mask = scanlineFillMask(projectedPoints, width, height);
  mask = erode(mask, width, height, OPENING_RADIUS_PX);
  mask = dilate(mask, width, height, OPENING_RADIUS_PX);

  const { label, sizes } = labelConnectedComponents(mask, width, height);
  let largestLabel = 0;
  let largestSize = 0;
  for (const [lbl, size] of sizes) {
    if (size > largestSize) {
      largestSize = size;
      largestLabel = lbl;
    }
  }
  const largestOnly = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) largestOnly[i] = label[i] === largestLabel ? 1 : 0;

  const boundary = traceBoundary(largestOnly, width, height);
  const latLonRing: [number, number][] = boundary.map(([x, y]) => unproject(x, y));
  latLonRing.push(latLonRing[0]);

  const asLonLat: LonLat[] = latLonRing.map(([lat, lon]) => [lon, lat]);
  let minLatSeen = Infinity;
  let maxLatSeen = -Infinity;
  for (const [lat] of latLonRing) {
    if (lat < minLatSeen) minLatSeen = lat;
    if (lat > maxLatSeen) maxLatSeen = lat;
  }
  const meanLat = (minLatSeen + maxLatSeen) / 2;
  const lonScale = Math.cos((meanLat * Math.PI) / 180);
  const projectedForSimplify: LonLat[] = asLonLat.map(([lon, lat]) => [lon * lonScale, lat]);
  const keepIndices = simplifyToCount(projectedForSimplify, ISLAND_TARGET_POINTS);
  return keepIndices.map((i) => latLonRing[i]);
}

// --- ArcGIS fetch --------------------------------------------------------

interface ArcGISFeature {
  properties: { CTRY23CD: string; CTRY23NM: string };
  geometry: { type: 'MultiPolygon'; coordinates: LonLat[][][] };
}

interface ArcGISFeatureCollection {
  features: ArcGISFeature[];
}

async function fetchCountries(): Promise<Record<'England' | 'Scotland' | 'Wales', LonLat[][][]>> {
  let data: ArcGISFeatureCollection;
  if (existsSync(FETCH_CACHE_PATH)) {
    console.log(`Using cached response at ${FETCH_CACHE_PATH}`);
    data = JSON.parse(readFileSync(FETCH_CACHE_PATH, 'utf8'));
  } else {
    const url =
      `${FEATURE_SERVER_URL}?where=${encodeURIComponent("CTRY23NM IN ('England','Scotland','Wales')")}` +
      `&outFields=CTRY23CD,CTRY23NM&returnGeometry=true&outSR=4326&geometryPrecision=6&f=geojson`;
    console.log(`Fetching ${url} ...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    data = (await res.json()) as ArcGISFeatureCollection;
    writeFileSync(FETCH_CACHE_PATH, JSON.stringify(data));
  }

  const byName = {} as Record<'England' | 'Scotland' | 'Wales', LonLat[][][]>;
  for (const feature of data.features) {
    const name = feature.properties.CTRY23NM as 'England' | 'Scotland' | 'Wales';
    byName[name] = feature.geometry.coordinates;
  }
  for (const name of ['England', 'Scotland', 'Wales'] as const) {
    if (!byName[name]) throw new Error(`Missing feature for ${name} in ArcGIS response`);
  }
  return byName;
}

/** Pick the largest-area outer ring from a MultiPolygon's parts — the mainland, dropping every island. */
function mainlandRing(parts: LonLat[][][], countryName: string): LonLat[] {
  const outerRings = parts.map((part) => part[0]);
  const areas = outerRings.map(ringArea);
  const bestIdx = areas.indexOf(Math.max(...areas));
  const sortedAreas = [...areas].sort((a, b) => b - a);
  console.log(
    `${countryName}: picked ring ${bestIdx} of ${outerRings.length} (area ${sortedAreas[0].toFixed(4)}) ` +
      `over next-largest (area ${(sortedAreas[1] ?? 0).toFixed(4)}) — ` +
      `${sortedAreas[1] ? (sortedAreas[0] / sortedAreas[1]).toFixed(1) : '∞'}x margin.`,
  );
  return outerRings[bestIdx]; // [lon, lat][], closed
}

/** Equirectangular projection matching src/flow/projection.ts's math, fit to a combined bounding box (not a single ring). */
function buildProjectionFromLatLonPoints(
  points: [number, number][],
  width: number,
  height: number,
) {
  const padding = 0.06;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const [lat, lon] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  const midLat = (minLat + maxLat) / 2;
  const lonScale = Math.cos((midLat * Math.PI) / 180);
  const spanX = (maxLon - minLon) * lonScale;
  const spanY = maxLat - minLat;
  const padPx = padding * Math.min(width, height);
  const availW = width - 2 * padPx;
  const availH = height - 2 * padPx;
  const scale = Math.min(availW / spanX, availH / spanY);
  const drawW = spanX * scale;
  const drawH = spanY * scale;
  const offsetX = (width - drawW) / 2;
  const offsetY = (height - drawH) / 2;

  return {
    lonScale,
    project([lat, lon]: [number, number]): [number, number] {
      const x = (lon * lonScale - minLon * lonScale) * scale + offsetX;
      const y = (maxLat - lat) * scale + offsetY;
      return [x, y];
    },
    unproject(x: number, y: number): [number, number] {
      const lon = ((x - offsetX) / scale + minLon * lonScale) / lonScale;
      const lat = maxLat - (y - offsetY) / scale;
      return [lat, lon];
    },
  };
}

/** Douglas-Peucker in projected (lonScale-corrected) space, to a target point count — for a closed ring. */
function simplifyRing(ring: [number, number][], lonScale: number, target: number): [number, number][] {
  const asLonLat: LonLat[] = ring.map(([lat, lon]) => [lon, lat]);
  const projected: LonLat[] = asLonLat.map(([lon, lat]) => [lon * lonScale, lat]);
  const keepIndices = simplifyToCount(projected, target);
  return keepIndices.map((i) => ring[i]);
}

/** Same, for an open polyline (the border) — douglasPeucker itself is already open/ring-agnostic; simplifyToCount just needs the right endpoints preserved, which it does regardless. */
function simplifyPolyline(
  line: [number, number][],
  lonScale: number,
  target: number,
): [number, number][] {
  return simplifyRing(line, lonScale, target);
}

/**
 * Trace `subjectMask`'s boundary and keep only the longest contiguous run
 * of boundary points that sit within `radiusPx` of a foreground pixel in
 * `neighbourMask` — i.e. the stretch of subject's perimeter that borders
 * neighbour, as opposed to the rest of its coastline (and, for England,
 * as opposed to its separate border with Wales).
 */
function extractSharedBorder(
  subjectMask: Uint8Array,
  neighbourMask: Uint8Array,
  width: number,
  height: number,
  radiusPx: number,
): [number, number][] {
  const boundary = traceBoundary(subjectMask, width, height);

  const isNeighbourNearby = (x: number, y: number): boolean => {
    for (let dy = -radiusPx; dy <= radiusPx; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= height) continue;
      for (let dx = -radiusPx; dx <= radiusPx; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= width) continue;
        if (neighbourMask[ny * width + nx] === 1) return true;
      }
    }
    return false;
  };

  const flags = boundary.map(([x, y]) => isNeighbourNearby(x, y));

  // Rotate the circular list to start at a `false` point (the border is a
  // short stretch of a much longer coastline, so one is guaranteed to
  // exist) so the longest-run scan below never has to handle wraparound.
  const falseStart = flags.indexOf(false);
  if (falseStart === -1) throw new Error('extractSharedBorder: entire boundary flagged as border');
  const rotated = [...boundary.slice(falseStart), ...boundary.slice(0, falseStart)];
  const rotatedFlags = [...flags.slice(falseStart), ...flags.slice(0, falseStart)];

  let bestStart = -1;
  let bestLen = 0;
  let runStart = -1;
  for (let i = 0; i <= rotatedFlags.length; i++) {
    const on = i < rotatedFlags.length && rotatedFlags[i];
    if (on && runStart === -1) runStart = i;
    if (!on && runStart !== -1) {
      const len = i - runStart;
      if (len > bestLen) {
        bestLen = len;
        bestStart = runStart;
      }
      runStart = -1;
    }
  }
  if (bestStart === -1) throw new Error('extractSharedBorder: no border run found');

  return rotated.slice(bestStart, bestStart + bestLen);
}

async function main() {
  const byName = await fetchCountries();

  const rawRings = {
    england: mainlandRing(byName.England, 'England'),
    scotland: mainlandRing(byName.Scotland, 'Scotland'),
    wales: mainlandRing(byName.Wales, 'Wales'),
  };

  // This repo's convention is [lat, lon] (Source.latLon, gb-mainland.json);
  // ArcGIS GeoJSON comes back [lon, lat].
  const latLonRings = {
    england: rawRings.england.map(([lon, lat]) => [lat, lon] as [number, number]),
    scotland: rawRings.scotland.map(([lon, lat]) => [lat, lon] as [number, number]),
    wales: rawRings.wales.map(([lon, lat]) => [lat, lon] as [number, number]),
  };

  const allPoints = [...latLonRings.england, ...latLonRings.scotland, ...latLonRings.wales];
  const { project, unproject, lonScale } = buildProjectionFromLatLonPoints(
    allPoints,
    PROXY_VIEWPORT_WIDTH,
    PROXY_VIEWPORT_HEIGHT,
  );

  console.log('Rasterizing England, Scotland, Wales mainlands...');
  const englandMask = scanlineFillMask(
    latLonRings.england.map(project),
    PROXY_VIEWPORT_WIDTH,
    PROXY_VIEWPORT_HEIGHT,
  );
  const scotlandMask = scanlineFillMask(
    latLonRings.scotland.map(project),
    PROXY_VIEWPORT_WIDTH,
    PROXY_VIEWPORT_HEIGHT,
  );
  const walesMask = scanlineFillMask(
    latLonRings.wales.map(project),
    PROXY_VIEWPORT_WIDTH,
    PROXY_VIEWPORT_HEIGHT,
  );

  // --- Island: union of the three, closed with a 1px-radius morphological
  // close (matching mask.ts's runtime convention) so the seam between two
  // independently-rasterized, independently-generalised adjacent country
  // polygons can't fracture the union into separate components.
  console.log('Building island union...');
  let unionMask: Uint8Array = new Uint8Array(PROXY_VIEWPORT_WIDTH * PROXY_VIEWPORT_HEIGHT);
  for (let i = 0; i < unionMask.length; i++) {
    unionMask[i] = englandMask[i] || scotlandMask[i] || walesMask[i] ? 1 : 0;
  }
  unionMask = erode(
    dilate(unionMask, PROXY_VIEWPORT_WIDTH, PROXY_VIEWPORT_HEIGHT, 2),
    PROXY_VIEWPORT_WIDTH,
    PROXY_VIEWPORT_HEIGHT,
    2,
  );
  const { label: unionLabel, sizes: unionSizes } = labelConnectedComponents(
    unionMask,
    PROXY_VIEWPORT_WIDTH,
    PROXY_VIEWPORT_HEIGHT,
  );
  let unionLargestLabel = 0;
  let unionLargestSize = 0;
  for (const [lbl, size] of unionSizes) {
    if (size > unionLargestSize) {
      unionLargestSize = size;
      unionLargestLabel = lbl;
    }
  }
  if (unionSizes.size > 1) {
    const sorted = [...unionSizes.values()].sort((a, b) => b - a);
    console.warn(
      `[island] union split into ${unionSizes.size} components after closing — ` +
        `keeping the largest (${unionLargestSize}px of ${PROXY_VIEWPORT_WIDTH * PROXY_VIEWPORT_HEIGHT} total). ` +
        `Component sizes: ${sorted.slice(0, 8).join(', ')}${sorted.length > 8 ? ', ...' : ''}.`,
    );
  }
  const unionLargestOnly = new Uint8Array(unionMask.length);
  for (let i = 0; i < unionMask.length; i++) {
    unionLargestOnly[i] = unionLabel[i] === unionLargestLabel ? 1 : 0;
  }
  const islandBoundary = traceBoundary(unionLargestOnly, PROXY_VIEWPORT_WIDTH, PROXY_VIEWPORT_HEIGHT);
  let islandRing: [number, number][] = islandBoundary.map(([x, y]) => unproject(x, y));
  islandRing.push(islandRing[0]);
  islandRing = simplifyRing(islandRing, lonScale, ISLAND_TARGET_POINTS);

  if (ENABLE_SPUR_PRUNING) {
    console.log('Spur pruning enabled — re-tracing after a morphological opening...');
    islandRing = pruneThinSpurs(
      islandRing,
      project,
      unproject,
      PROXY_VIEWPORT_WIDTH,
      PROXY_VIEWPORT_HEIGHT,
    );
  } else {
    console.log('Spur pruning disabled (ENABLE_SPUR_PRUNING = false), matching build-gb-outline.ts.');
  }

  // --- Border: the stretch of England's own perimeter that borders
  // Scotland — Solway to the Tweed, not the English coastline or the
  // England/Wales border.
  console.log('Extracting the Scotland–England border...');
  const borderPixels = extractSharedBorder(
    englandMask,
    scotlandMask,
    PROXY_VIEWPORT_WIDTH,
    PROXY_VIEWPORT_HEIGHT,
    BORDER_ADJACENCY_RADIUS_PX,
  );
  let borderLine: [number, number][] = borderPixels.map(([x, y]) => unproject(x, y));
  // Orient west (Solway, ~-3.4°) to east (mouth of the Tweed, ~-2.0°).
  if (borderLine[0][1] > borderLine[borderLine.length - 1][1]) borderLine.reverse();
  borderLine = simplifyPolyline(borderLine, lonScale, BORDER_TARGET_POINTS);
  console.log(
    `Border: ${borderPixels.length} raster points -> ${borderLine.length}, ` +
      `from [${borderLine[0][0].toFixed(3)}, ${borderLine[0][1].toFixed(3)}] to ` +
      `[${borderLine[borderLine.length - 1][0].toFixed(3)}, ${borderLine[borderLine.length - 1][1].toFixed(3)}].`,
  );

  // --- Countries: each mainland ring, lightly simplified.
  const countries = {
    england: simplifyRing(latLonRings.england, lonScale, COUNTRY_TARGET_POINTS),
    scotland: simplifyRing(latLonRings.scotland, lonScale, COUNTRY_TARGET_POINTS),
    wales: simplifyRing(latLonRings.wales, lonScale, COUNTRY_TARGET_POINTS),
  };

  // --- Islands (step 3, Windfall_Map_Spec.md Part A.1): every non-mainland
  // ring across all three countries at or above ISLAND_AREA_THRESHOLD,
  // named by nearest-centroid match. Extracted from the raw ArcGIS rings
  // directly (not via the raster union above) — a standalone ring needs no
  // adjacency handling, so plain Douglas-Peucker on the vector ring is both
  // simpler and higher-fidelity than the mainland/border's raster-trace
  // detour, which exists only to resolve the seam between two independently
  // generalised, independently rasterized *adjacent* polygons.
  console.log(`Selecting islands at area >= ${ISLAND_AREA_THRESHOLD}...`);
  function centroidOf(ring: LonLat[]): [number, number] {
    let sx = 0;
    let sy = 0;
    for (const [x, y] of ring) {
      sx += x;
      sy += y;
    }
    return [sy / ring.length, sx / ring.length]; // -> [lat, lon]
  }

  const islandCandidates: { ring: [number, number][]; area: number; centroid: [number, number] }[] = [];
  for (const country of ['England', 'Scotland', 'Wales'] as const) {
    const parts = byName[country];
    const outerRings = parts.map((part) => part[0]);
    const areas = outerRings.map(ringArea);
    const mainlandArea = Math.max(...areas);
    outerRings.forEach((ring, i) => {
      if (areas[i] >= mainlandArea || areas[i] < ISLAND_AREA_THRESHOLD) return;
      const latLonRing = ring.map(([lon, lat]) => [lat, lon] as [number, number]);
      islandCandidates.push({ ring: latLonRing, area: areas[i], centroid: centroidOf(ring) });
    });
  }

  const namedIslands: { name: string; area: number; pointCount: number; ring: [number, number][] }[] = [];
  const usedNames = new Set<string>();
  for (const candidate of islandCandidates) {
    let best: { name: string } | null = null;
    let bestDist = Infinity;
    for (const { name, near } of ISLAND_NAMES) {
      const dist = Math.hypot(candidate.centroid[0] - near[0], candidate.centroid[1] - near[1]);
      if (dist < bestDist) {
        bestDist = dist;
        best = { name };
      }
    }
    if (!best || bestDist > ISLAND_NAME_MATCH_RADIUS_DEG) {
      throw new Error(
        `Unnamed island ring at centroid [${candidate.centroid[0].toFixed(2)}, ` +
          `${candidate.centroid[1].toFixed(2)}], area ${candidate.area.toFixed(5)} — add it to ` +
          `ISLAND_NAMES (nearest known name "${best?.name ?? 'none'}" is ${bestDist.toFixed(2)}° away).`,
      );
    }
    if (usedNames.has(best.name)) {
      throw new Error(`Two island rings matched the name "${best.name}" — check ISLAND_NAMES for ambiguity.`);
    }
    usedNames.add(best.name);
    const target = islandTargetPoints(candidate.area);
    const simplified = simplifyRing(candidate.ring, lonScale, target);
    namedIslands.push({ name: best.name, area: candidate.area, pointCount: simplified.length, ring: simplified });
  }
  const missingNames = ISLAND_NAMES.map((n) => n.name).filter((n) => !usedNames.has(n));
  if (missingNames.length > 0) {
    throw new Error(
      `ISLAND_NAMES entries never matched a ring above the threshold: ${missingNames.join(', ')}. ` +
        'Either the threshold moved or the ONS data changed — check before shipping.',
    );
  }
  namedIslands.sort((a, b) => b.area - a.area);
  console.log(
    `Islands: ${namedIslands.length} — ${namedIslands.map((i) => `${i.name} (${i.pointCount}pt)`).join(', ')}.`,
  );

  console.log(
    `Island: ${islandRing.length} points. Border: ${borderLine.length} points. ` +
      `Countries: england ${countries.england.length}, scotland ${countries.scotland.length}, ` +
      `wales ${countries.wales.length}. Islands: ${namedIslands.length}.`,
  );

  writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(
      {
        name: 'GB countries (England, Scotland, Wales mainlands, plus named islands)',
        source:
          'ONS Open Geography Portal, Countries (December 2023) Boundaries UK BGC ' +
          '(services1.arcgis.com/ESMARspQHYMw9BZ9, layer CTRY_DEC_2023_UK_BGC), ' +
          'Northern Ireland dropped, mainland ring per country plus every non-mainland ring at or ' +
          `above area ${ISLAND_AREA_THRESHOLD} (see DECISIONS.md 024)`,
        island: { pointCount: islandRing.length, ring: islandRing },
        border: { pointCount: borderLine.length, line: borderLine },
        countries: {
          england: { pointCount: countries.england.length, ring: countries.england },
          scotland: { pointCount: countries.scotland.length, ring: countries.scotland },
          wales: { pointCount: countries.wales.length, ring: countries.wales },
        },
        islands: namedIslands.map(({ name, pointCount, ring }) => ({ name, pointCount, ring })),
      },
      null,
      0,
    ),
  );
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
