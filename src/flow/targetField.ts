import { DEFAULT_CELL_SIZE, downsampleMaskToCoarseGrid, type DistanceField } from './distanceField';
import type { GeodesicField } from './geodesicField';
import type { RasterMask } from './mask';
import type { Vec2 } from './types';

/**
 * Path-over-land distance to a single target point — the per-destination
 * field behind field.ts's `baseFieldMode: 'targets'`. Same "integration
 * field" idea as geodesicField.ts (distance across the mask, gradient
 * followed toward it), with three differences:
 *
 * - Seeded at one point (a city) rather than a southern goal band.
 * - Dijkstra with true step costs (1 orthogonal, √2 diagonal) rather than
 *   an unweighted BFS. geodesicField.ts's unweighted BFS measures
 *   chessboard distance, whose gradient snaps toward the eight grid
 *   directions — invisible behind the south field's broad goal band, but
 *   a single-point target turns it into visibly straight 0°/45° runs.
 * - Steps near the coast cost more (COAST_PENALTY within COAST_BAND_PX). A
 *   pure shortest path hugs the inside of every bend — round the head of the
 *   Solway Firth, say — and on /map, where flow is free to leave the island,
 *   any sway off such a route runs straight into the sea. The penalty
 *   keeps routes inland and down the middle of narrow necks.
 *
 * The distance is kept in device px (not cells), because particles.ts
 * also reads it to weigh how far a spawn point is from each target. With
 * the coast penalty it is a route *cost* in px, a little longer than the
 * true path — fine for both uses.
 */
const COAST_BAND_PX = 60;
const COAST_PENALTY = 4;
// With smoothing on, how far inland the smoothed gradient fully takes over
// from the sharp one — see buildTargetFields.
const SHARP_NEAR_COAST_PX = 40;

export type TargetField = GeodesicField;

/**
 * Build one field per target. Everything that doesn't depend on the target
 * — the coarse grid, each cell's coast-penalised step cost, the heap and
 * visited buffers — is computed once and shared, and the Dijkstra inner loop
 * allocates nothing: this runs on load and on every resize, for every city,
 * so it has to stay well under a frame budget per city.
 */
export function buildTargetFields(
  mask: RasterMask,
  targets: Vec2[],
  coast: DistanceField,
  cellSize: number = DEFAULT_CELL_SIZE,
  /** Blur radius for the gradient, in cells; 0 leaves it sharp. See smoothGradient. */
  smoothCells = 0,
): TargetField[] {
  const { gridWidth, gridHeight, coarseInside } = downsampleMaskToCoarseGrid(mask, cellSize);
  const n = gridWidth * gridHeight;
  const idx = (x: number, y: number) => y * gridWidth + x;

  // Per-cell step cost in device px: cellSize, raised near the coast.
  const cellCost = new Float32Array(n);
  const coastDistOf = new Float32Array(n);
  for (let gy = 0; gy < gridHeight; gy++) {
    for (let gx = 0; gx < gridWidth; gx++) {
      const i = idx(gx, gy);
      if (!coarseInside[i]) continue;
      const coastDist = coast.sample(gx * cellSize, gy * cellSize).dist;
      coastDistOf[i] = coastDist;
      cellCost[i] = cellSize * (1 + COAST_PENALTY * Math.max(0, 1 - coastDist / COAST_BAND_PX));
    }
  }

  // Lazy-deletion binary heap: a cell can be pushed more than once, so size
  // it for that; stale entries are skipped by `done` on pop.
  const heapCap = n * 4;
  const heap = new Int32Array(heapCap);
  const heapKey = new Float32Array(heapCap);
  const done = new Uint8Array(n);

  return targets.map((target) => {
    const distance = new Float32Array(n).fill(Infinity);
    const gradX = new Float32Array(n);
    const gradY = new Float32Array(n);
    function sample(x: number, y: number) {
      const gx = Math.min(gridWidth - 1, Math.max(0, Math.round(x / cellSize)));
      const gy = Math.min(gridHeight - 1, Math.max(0, Math.round(y / cellSize)));
      const i = idx(gx, gy);
      return { dist: distance[i], gx: gradX[i], gy: gradY[i] };
    }
    const field: TargetField = { gridWidth, gridHeight, cellSize, distance, gradX, gradY, sample };

    // Seed at the target's own cell, or — for a coastal city whose point the
    // simplified coastline puts in the sea (Liverpool, Cardiff) — the nearest
    // interior cell.
    const tx = Math.min(gridWidth - 1, Math.max(0, Math.round(target[0] / cellSize)));
    const ty = Math.min(gridHeight - 1, Math.max(0, Math.round(target[1] / cellSize)));
    let seed = -1;
    for (let r = 0; r <= 40 && seed < 0; r++) {
      let best = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = tx + dx;
          const y = ty + dy;
          if (x < 0 || y < 0 || x >= gridWidth || y >= gridHeight) continue;
          const d = dx * dx + dy * dy;
          if (coarseInside[idx(x, y)] && d < best) {
            best = d;
            seed = idx(x, y);
          }
        }
      }
    }
    if (seed < 0) return field;

    done.fill(0);
    let size = 0;
    const push = (i: number, key: number) => {
      let k = size++;
      while (k > 0) {
        const parent = (k - 1) >> 1;
        if (heapKey[parent] <= key) break;
        heap[k] = heap[parent];
        heapKey[k] = heapKey[parent];
        k = parent;
      }
      heap[k] = i;
      heapKey[k] = key;
    };
    const pop = (): number => {
      const top = heap[0];
      size--;
      const lastI = heap[size];
      const lastKey = heapKey[size];
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        if (l >= size) break;
        const r = l + 1;
        const m = r < size && heapKey[r] < heapKey[l] ? r : l;
        if (heapKey[m] >= lastKey) break;
        heap[k] = heap[m];
        heapKey[k] = heapKey[m];
        k = m;
      }
      heap[k] = lastI;
      heapKey[k] = lastKey;
      return top;
    };

    distance[seed] = 0;
    push(seed, 0);
    while (size > 0) {
      const i = pop();
      if (done[i]) continue;
      done[i] = 1;
      const x0 = i % gridWidth;
      const y0 = (i / gridWidth) | 0;
      const d0 = distance[i];
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y0 + dy;
        if (ny < 0 || ny >= gridHeight) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x0 + dx;
          if (nx < 0 || nx >= gridWidth) continue;
          const j = ny * gridWidth + nx;
          if (!coarseInside[j] || done[j]) continue;
          const nd = d0 + (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1) * cellCost[j];
          if (nd < distance[j] && size < heapCap) {
            distance[j] = nd;
            push(j, nd);
          }
        }
      }
    }

    // Gradient toward decreasing distance, by central differences — the same
    // treatment as geodesicField.ts, including substituting the centre value
    // for an outside neighbour so a coastal cell doesn't read a false slope.
    for (let gy = 0; gy < gridHeight; gy++) {
      for (let gx = 0; gx < gridWidth; gx++) {
        const i = idx(gx, gy);
        const center = distance[i];
        if (center === Infinity) continue;
        let l = distance[idx(Math.max(0, gx - 1), gy)];
        let r = distance[idx(Math.min(gridWidth - 1, gx + 1), gy)];
        let u = distance[idx(gx, Math.max(0, gy - 1))];
        let d = distance[idx(gx, Math.min(gridHeight - 1, gy + 1))];
        if (l === Infinity) l = center;
        if (r === Infinity) r = center;
        if (u === Infinity) u = center;
        if (d === Infinity) d = center;
        const vx = l - r;
        const vy = u - d;
        const len = Math.hypot(vx, vy);
        if (len > 1e-6) {
          gradX[i] = vx / len;
          gradY[i] = vy / len;
        }
      }
    }

    if (smoothCells > 0) {
      const sharpX = gradX.slice();
      const sharpY = gradY.slice();
      smoothGradient(gradX, gradY, distance, gridWidth, gridHeight, smoothCells);
      // Near the coast, a blurred gradient averages in cells across a bay or
      // firth and can point out to sea; there the sharp route (which keeps
      // off the coast by construction) is blended back in, fully at the
      // shore and not at all from SHARP_NEAR_COAST_PX inland.
      for (let i = 0; i < n; i++) {
        if (distance[i] === Infinity) continue;
        const w = Math.min(1, Math.max(0, coastDistOf[i] / SHARP_NEAR_COAST_PX));
        if (w >= 1) continue;
        const bx = gradX[i] * w + sharpX[i] * (1 - w);
        const by = gradY[i] * w + sharpY[i] * (1 - w);
        const len = Math.hypot(bx, by);
        gradX[i] = len > 1e-6 ? bx / len : 0;
        gradY[i] = len > 1e-6 ? by / len : 0;
      }
    }
    return field;
  });
}

/**
 * Blur a route field's gradient across its neighbours (two box passes each
 * way, interior cells only), then renormalise. A shortest-path gradient
 * points every cell toward the one best route, so flow following it merges
 * onto that line — through a narrow neck like the Scotland/England border,
 * distinct parallel channels, one per route. Averaged over a radius
 * comparable to the neck's half-width, the gradient points *along* the neck
 * rather than in toward its best line, and the flow crosses at its full width.
 */
function smoothGradient(
  gradX: Float32Array,
  gradY: Float32Array,
  distance: Float32Array,
  gridWidth: number,
  gridHeight: number,
  radius: number,
): void {
  const n = gridWidth * gridHeight;
  const inside = (i: number) => distance[i] !== Infinity;
  const tmpX = new Float32Array(n);
  const tmpY = new Float32Array(n);
  const pass = (srcX: Float32Array, srcY: Float32Array, dstX: Float32Array, dstY: Float32Array, horizontal: boolean) => {
    const outer = horizontal ? gridHeight : gridWidth;
    const inner = horizontal ? gridWidth : gridHeight;
    const at = (o: number, k: number) => (horizontal ? o * gridWidth + k : k * gridWidth + o);
    for (let o = 0; o < outer; o++) {
      for (let k = 0; k < inner; k++) {
        const i = at(o, k);
        if (!inside(i)) continue;
        let sx = 0;
        let sy = 0;
        for (let d = -radius; d <= radius; d++) {
          const kk = k + d;
          if (kk < 0 || kk >= inner) continue;
          const j = at(o, kk);
          if (!inside(j)) continue;
          sx += srcX[j];
          sy += srcY[j];
        }
        dstX[i] = sx;
        dstY[i] = sy;
      }
    }
  };
  for (let round = 0; round < 2; round++) {
    pass(gradX, gradY, tmpX, tmpY, true);
    pass(tmpX, tmpY, gradX, gradY, false);
  }
  for (let i = 0; i < n; i++) {
    if (!inside(i)) continue;
    const len = Math.hypot(gradX[i], gradY[i]);
    if (len > 1e-6) {
      gradX[i] /= len;
      gradY[i] /= len;
    } else {
      gradX[i] = 0;
      gradY[i] = 0;
    }
  }
}
