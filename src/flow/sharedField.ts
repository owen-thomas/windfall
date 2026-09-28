import { downsampleMaskToCoarseGrid } from './distanceField';
import type { RasterMask } from './mask';
import type { Vec2 } from './types';

/**
 * One direction for every point of the land — field.ts's `baseFieldMode:
 * 'shared'` (DECISIONS 049). Under 'blanket' each particle heads for its own
 * destination, so particles at the same point go different ways and the flow
 * swirls and crosses around the farms; a wind map's particles move together
 * because their velocity depends only on where they are.
 *
 * The shape is the flow of power itself, in aggregate: each farm a source,
 * weighted by its output, and the land a sink spread evenly over it (power
 * used everywhere), joined by the smoothest flow there is — a potential flow,
 * the solution of Poisson's equation with no flow across the coast. Because
 * every cell soaks some up, the lines fan out to cover the land rather than
 * converging into one river (the averaged-destination field would: every
 * point would aim at the middle of the land south of it).
 *
 * A particle's chance of ending, per cell it travels, is the local sink over
 * the local flux (particles.ts): a stream tube loses exactly that fraction of
 * its flux to the land it crosses, so the particles end where the flow is
 * used and none pile up where it runs out.
 *
 * `crossing` (the Scotland–England border's limit, main.ts) scales the sink
 * beyond the line so that the flux crossing it is `share` of what it would
 * be with the line open: England soaks up `share` times its open share of the
 * total, Scotland the rest.
 */
export interface SharedField {
  cellSize: number;
  gridWidth: number;
  gridHeight: number;
  /** Unit direction of the flow per cell, smoothed; 0 where there is none (sea, land no source reaches). */
  dirX: Float32Array;
  dirY: Float32Array;
  /** Flux magnitude per cell, in units where the total source is 1 per cell edge. */
  flux: Float32Array;
  /** Sink per cell, same units: what a particle's chance of ending is measured against. */
  sink: Float32Array;
  /** Bilinear direction at a device-px point; (0, 0) where the field has none. */
  sample(x: number, y: number): { dx: number; dy: number };
  /** The chance a particle ends over `distancePx` of travel from (x, y). */
  endChance(x: number, y: number, distancePx: number): number;
}

export interface SharedSource {
  position: Vec2;
  weight: number;
}

export interface SharedCrossing {
  isAcross(x: number, y: number): boolean;
  share: number;
}

const DEFAULT_CELL_SIZE = 12;
/** Successive over-relaxation: factor and sweeps. Against 4,000 sweeps at /map's desktop size (4,306 land cells), 1,200 differ in direction by 0.07° on average, 3.6° at most, and take ~86ms. */
const SOR_OMEGA = 1.93;
const SOR_SWEEPS = 1200;
/** Blur of the flux vectors before normalising, cells — smooths the grid's staircase into sweeping lines. */
const SMOOTH_CELLS = 2;

export function buildSharedField(
  mask: RasterMask,
  sources: SharedSource[],
  crossing: SharedCrossing | null = null,
  cellSize = DEFAULT_CELL_SIZE,
): SharedField {
  const { gridWidth: gw, gridHeight: gh, coarseInside } = downsampleMaskToCoarseGrid(mask, cellSize);
  const n = gw * gh;
  const cellOf = (x: number, y: number) => {
    const cx = Math.round(x / cellSize);
    const cy = Math.round(y / cellSize);
    return cx < 0 || cy < 0 || cx >= gw || cy >= gh ? -1 : cy * gw + cx;
  };

  // Each source on its nearest land cell.
  const source = new Float64Array(n);
  let total = 0;
  for (const s of sources) total += Math.max(0, s.weight);
  const equal = total <= 0;
  for (const s of sources) {
    const w = equal ? 1 : Math.max(0, s.weight);
    if (w <= 0) continue;
    const c = nearestInside(cellOf(s.position[0], s.position[1]), s.position, coarseInside, gw, gh, cellSize);
    if (c >= 0) source[c] += w;
  }
  const sourceTotal = source.reduce((a, b) => a + b, 0) || 1;
  for (let c = 0; c < n; c++) source[c] /= sourceTotal;

  // Only land a source can reach carries flow: a sink with no source in its
  // piece of land has no solution (Orkney, most of the islands).
  const reached = new Uint8Array(n);
  const stack: number[] = [];
  for (let c = 0; c < n; c++) if (source[c] > 0) (reached[c] = 1), stack.push(c);
  while (stack.length) {
    const c = stack.pop()!;
    const cx = c % gw;
    for (const m of [cx > 0 ? c - 1 : -1, cx < gw - 1 ? c + 1 : -1, c - gw, c + gw]) {
      if (m < 0 || m >= n || reached[m] || !coarseInside[m]) continue;
      reached[m] = 1;
      stack.push(m);
    }
  }

  // The sink, even over reached land — England's share scaled by the crossing.
  const sink = new Float32Array(n);
  let across = 0;
  let near = 0;
  const isAcross = new Uint8Array(n);
  for (let c = 0; c < n; c++) {
    if (!reached[c]) continue;
    if (crossing?.isAcross((c % gw) * cellSize, ((c / gw) | 0) * cellSize)) {
      isAcross[c] = 1;
      across++;
    } else near++;
  }
  const reachedCount = across + near || 1;
  const openAcrossShare = across / reachedCount;
  const acrossShare = crossing ? openAcrossShare * Math.min(1, Math.max(0, crossing.share)) : openAcrossShare;
  for (let c = 0; c < n; c++) {
    if (!reached[c]) continue;
    sink[c] = isAcross[c] ? acrossShare / Math.max(1, across) : (1 - acrossShare) / Math.max(1, near);
  }

  // Solve sum over land neighbours of (phi_n - phi_c) = sink_c - source_c,
  // no flow across the coast (a neighbour off the land isn't in the sum).
  const phi = new Float64Array(n);
  const deg = new Uint8Array(n);
  const cells: number[] = [];
  for (let c = 0; c < n; c++) {
    if (!reached[c]) continue;
    const cx = c % gw;
    deg[c] = (cx > 0 && reached[c - 1] ? 1 : 0) + (cx < gw - 1 && reached[c + 1] ? 1 : 0) +
      (c - gw >= 0 && reached[c - gw] ? 1 : 0) + (c + gw < n && reached[c + gw] ? 1 : 0);
    if (deg[c] > 0) cells.push(c);
  }
  for (let sweep = 0; sweep < SOR_SWEEPS; sweep++) {
    for (const c of cells) {
      const cx = c % gw;
      let sum = 0;
      if (cx > 0 && reached[c - 1]) sum += phi[c - 1];
      if (cx < gw - 1 && reached[c + 1]) sum += phi[c + 1];
      if (c - gw >= 0 && reached[c - gw]) sum += phi[c - gw];
      if (c + gw < n && reached[c + gw]) sum += phi[c + gw];
      const target = (sum + source[c] - sink[c]) / deg[c];
      phi[c] += SOR_OMEGA * (target - phi[c]);
    }
  }

  // Flux = -grad(phi): downhill, away from the sources.
  const fx = new Float32Array(n);
  const fy = new Float32Array(n);
  const flux = new Float32Array(n);
  for (const c of cells) {
    const cx = c % gw;
    const l = cx > 0 && reached[c - 1] ? phi[c - 1] : phi[c];
    const r = cx < gw - 1 && reached[c + 1] ? phi[c + 1] : phi[c];
    const u = c - gw >= 0 && reached[c - gw] ? phi[c - gw] : phi[c];
    const d = c + gw < n && reached[c + gw] ? phi[c + gw] : phi[c];
    fx[c] = -(r - l) / 2;
    fy[c] = -(d - u) / 2;
    flux[c] = Math.hypot(fx[c], fy[c]);
  }

  // Smooth the vectors over land, then normalise.
  const dirX = new Float32Array(n);
  const dirY = new Float32Array(n);
  for (const c of cells) {
    const cx = c % gw;
    const cy = (c / gw) | 0;
    let sx = 0;
    let sy = 0;
    for (let dy = -SMOOTH_CELLS; dy <= SMOOTH_CELLS; dy++) {
      for (let dx = -SMOOTH_CELLS; dx <= SMOOTH_CELLS; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
        const m = y * gw + x;
        if (!reached[m]) continue;
        const w = 1 / (1 + dx * dx + dy * dy);
        sx += fx[m] * w;
        sy += fy[m] * w;
      }
    }
    const len = Math.hypot(sx, sy);
    if (len > 0) {
      dirX[c] = sx / len;
      dirY[c] = sy / len;
    }
  }

  function sample(x: number, y: number): { dx: number; dy: number } {
    const gx = x / cellSize;
    const gy = y / cellSize;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const tx = gx - x0;
    const ty = gy - y0;
    let sx = 0;
    let sy = 0;
    for (let j = 0; j <= 1; j++) {
      for (let i = 0; i <= 1; i++) {
        const cx = x0 + i;
        const cy = y0 + j;
        if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) continue;
        const w = (i ? tx : 1 - tx) * (j ? ty : 1 - ty);
        const c = cy * gw + cx;
        sx += dirX[c] * w;
        sy += dirY[c] * w;
      }
    }
    const len = Math.hypot(sx, sy);
    return len > 1e-6 ? { dx: sx / len, dy: sy / len } : { dx: 0, dy: 0 };
  }

  function endChance(x: number, y: number, distancePx: number): number {
    const c = cellOf(x, y);
    if (c < 0 || !reached[c]) return 1;
    const f = flux[c];
    if (f <= 1e-9) return 1;
    return Math.min(1, (sink[c] * (distancePx / cellSize)) / f);
  }

  return { cellSize, gridWidth: gw, gridHeight: gh, dirX, dirY, flux, sink, sample, endChance };
}

/** `c` if it's land, else the nearest land cell to `position` within a few cells, else -1. */
function nearestInside(
  c: number,
  position: Vec2,
  inside: Uint8Array,
  gw: number,
  gh: number,
  cellSize: number,
): number {
  if (c >= 0 && inside[c]) return c;
  const px = position[0] / cellSize;
  const py = position[1] / cellSize;
  let best = -1;
  let bestD = Infinity;
  const r = 6;
  for (let y = Math.floor(py) - r; y <= Math.ceil(py) + r; y++) {
    for (let x = Math.floor(px) - r; x <= Math.ceil(px) + r; x++) {
      if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
      const m = y * gw + x;
      if (!inside[m]) continue;
      const d = (x - px) ** 2 + (y - py) ** 2;
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
  }
  return best;
}
