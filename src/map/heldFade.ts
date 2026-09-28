/**
 * Where the held-back wind fades out: short of the Scotland–England border.
 * Wind held back from the grid is held back because the network can't carry
 * it south (the border is the constraint the page explains), so its flow thins
 * as it nears the border and is gone before it reaches the line.
 *
 * Built on a coarse grid over the world's mask: the drawn border is a wall
 * across the land, England is whatever a flood fill from an English point
 * reaches without crossing it, and every other land cell fades by its distance
 * to the border. England rather than Scotland is the fill, because Scotland is
 * many pieces (islands, offshore corridors) and England, for this purpose, one.
 */
import { squaredDistanceTransform, INF } from '../flow/edt';
import type { World } from '../flow/world';

/** Grid cell, device px. */
const CELL_PX = 3;
/** A point well inside England, the flood fill's seed. */
const ENGLAND_SEED: [number, number] = [52.5, -1.5];
/**
 * The border carried on from its Solway end down the middle of the firth to
 * open sea, [lat, lon], roughly the line between Scottish and English waters
 * (Robin Rigg, at 54.76 N 3.71 W, on the Scottish side). On land the mask
 * doesn't need it, but Robin Rigg's offshore corridor to Seaton bridges the
 * firth in the mask, and without it England's fill crosses there into
 * Galloway and on through all of Scotland. Read off the map, not surveyed.
 */
const SOLWAY_LINE: [number, number][] = [
  [54.9, -3.35],
  [54.8, -3.6],
  [54.68, -3.85],
  [54.55, -4.1],
];

/** The line's direction at an end is read over this much of it, device px — its last few segments are a staircase (borderLine.ts). */
const END_DIRECTION_PX = 30;
/** How far past the land each end's wall is carried, device px, and the most it is carried at all. */
const END_CLEAR_PX = 6;
const END_MAX_PX = 60;

/**
 * The wall's extension past one end of the line (`points` runs from that end
 * inward): on along the line's direction until it is END_CLEAR_PX clear of the
 * mask, so the fill can't slip round the end through the pixel or two of land
 * the raster keeps past the drawn coast.
 */
function endOverrun(points: [number, number][], mask: World['mask']): [number, number] {
  const [ex, ey] = points[0];
  let [bx, by] = points[points.length - 1];
  for (const p of points) {
    if (Math.hypot(p[0] - ex, p[1] - ey) >= END_DIRECTION_PX) {
      [bx, by] = p;
      break;
    }
  }
  const len = Math.hypot(ex - bx, ey - by) || 1;
  const ux = (ex - bx) / len;
  const uy = (ey - by) / len;
  let clear = 0;
  for (let d = 1; d <= END_MAX_PX; d++) {
    clear = mask.isInside(ex + ux * d, ey + uy * d) ? 0 : clear + 1;
    if (clear >= END_CLEAR_PX) return [ex + ux * d, ey + uy * d];
  }
  return [ex + ux * END_MAX_PX, ey + uy * END_MAX_PX];
}

export interface HeldFadeOptions {
  /** The flow is gone this far north of the border, device px. */
  gonePx: number;
  /** And fully drawn from this far north of it, device px. */
  fullPx: number;
}

/** 0..1 at a device-px point, for ParticleSystemOptions.fade. */
export type FadeField = (x: number, y: number) => number;

export interface HeldFade {
  fade: FadeField;
  /** Whether a device-px point is on England's side of the border — the same fill the fade uses, so the two always agree (the on-grid flow's crossing share, main.ts). */
  inEngland(x: number, y: number): boolean;
}

export function buildHeldFade(world: World, border: [number, number][], options: HeldFadeOptions): HeldFade {
  const { mask, projection } = world;
  const gw = Math.ceil(mask.width / CELL_PX);
  const gh = Math.ceil(mask.height / CELL_PX);
  const cellOf = (x: number, y: number) => {
    const cx = Math.floor(x / CELL_PX);
    const cy = Math.floor(y / CELL_PX);
    return cx < 0 || cy < 0 || cx >= gw || cy >= gh ? -1 : cy * gw + cx;
  };

  // The border as a wall: stepped at half a cell, so it is 8-connected and a
  // 4-connected fill can't slip through it diagonally.
  const wall = new Uint8Array(gw * gh);
  // West to east, then led in from the Solway.
  const line = border.length > 1 && border[0][1] > border[border.length - 1][1] ? [...border].reverse() : border;
  const points = [...[...SOLWAY_LINE].reverse(), ...line].map((p) => projection.project(p));
  // The line ends on the drawn coast, but the rasterised land runs a pixel or
  // two past it (mask.ts's closing), so each end is carried on out to sea.
  if (points.length >= 2) {
    const west = endOverrun(points, mask);
    const east = endOverrun([...points].reverse(), mask);
    points.unshift(west);
    points.push(east);
  }
  for (let k = 1; k < points.length; k++) {
    const [x0, y0] = points[k - 1];
    const [x1, y1] = points[k];
    const steps = Math.max(1, Math.ceil((Math.hypot(x1 - x0, y1 - y0) / CELL_PX) * 2));
    for (let s = 0; s <= steps; s++) {
      const c = cellOf(x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps);
      if (c >= 0) wall[c] = 1;
    }
  }

  const land = new Uint8Array(gw * gh);
  for (let cy = 0; cy < gh; cy++) {
    for (let cx = 0; cx < gw; cx++) {
      if (mask.isInside((cx + 0.5) * CELL_PX, (cy + 0.5) * CELL_PX)) land[cy * gw + cx] = 1;
    }
  }

  const england = new Uint8Array(gw * gh);
  const [sx, sy] = projection.project(ENGLAND_SEED);
  const seed = cellOf(sx, sy);
  if (seed >= 0 && land[seed] && !wall[seed]) {
    const stack = [seed];
    england[seed] = 1;
    while (stack.length > 0) {
      const c = stack.pop()!;
      const cx = c % gw;
      const neighbours = [cx > 0 ? c - 1 : -1, cx < gw - 1 ? c + 1 : -1, c - gw, c + gw];
      for (const n of neighbours) {
        if (n < 0 || n >= gw * gh || england[n] || wall[n] || !land[n]) continue;
        england[n] = 1;
        stack.push(n);
      }
    }
  }

  const grid = new Float64Array(gw * gh);
  for (let c = 0; c < grid.length; c++) grid[c] = wall[c] ? 0 : INF;
  const distSq = squaredDistanceTransform(grid, gw, gh);

  const span = Math.max(1e-6, options.fullPx - options.gonePx);
  return {
    fade(x, y) {
      const c = cellOf(x, y);
      if (c < 0) return 1;
      if (england[c] || wall[c]) return 0;
      const t = Math.min(1, Math.max(0, (Math.sqrt(distSq[c]) * CELL_PX - options.gonePx) / span));
      return t * t * (3 - 2 * t);
    },
    inEngland(x, y) {
      const c = cellOf(x, y);
      return c >= 0 && england[c] === 1;
    },
  };
}
