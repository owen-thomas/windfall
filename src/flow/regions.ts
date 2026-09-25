import type { DistanceField } from './distanceField';
import { downsampleMaskToCoarseGrid } from './distanceField';
import type { RasterMask } from './mask';
import { buildTargetFields, type TargetField } from './targetField';
import type { Vec2 } from './types';

/**
 * The land cut into regions, each with its own route field — the machinery
 * behind field.ts's `baseFieldMode: 'blanket'`. A particle heads for a
 * destination drawn evenly across the land (not a city), so flow covers the
 * island rather than converging on a few points. A route field per
 * destination point would be one Dijkstra per particle; instead each
 * destination falls in a region, the particle follows that region's field
 * across the country, and near the end heads straight for its own point
 * (sampleField's directness blend).
 *
 * Built on a coarser grid than the other fields (REGION_CELL_SIZE): a few
 * dozen fields at full resolution would be tens of MB and too slow to
 * rebuild on resize, and a route only needs to know the general way.
 */
export interface Regions {
  cellSize: number;
  gridWidth: number;
  gridHeight: number;
  /** One route field per region, toward its anchor. */
  fields: TargetField[];
  /** Each region's anchor, device px — where its field leads. */
  anchors: Vec2[];
  /** Coarse cell index of every interior cell — sampled uniformly for an even destination draw. */
  insideCells: Int32Array;
  /** Region index of each coarse cell (-1 outside). */
  cellRegion: Int16Array;
}

const REGION_CELL_SIZE = 12;

export function buildRegions(
  mask: RasterMask,
  coast: DistanceField,
  regionCount: number,
  /**
   * Route-gradient blur radius in region cells — see targetField.ts's
   * smoothGradient. 8 (~96 device px, about half the border neck at /map's
   * size) measured the most even border crossing: particle counts across the
   * neck varied 0.70x their mean, against 1.16x unsmoothed, for ~40% more
   * particles leaving over the coast.
   */
  smoothCells = 8,
): Regions {
  const cellSize = REGION_CELL_SIZE;
  const { gridWidth, gridHeight, coarseInside } = downsampleMaskToCoarseGrid(mask, cellSize);
  const cells: number[] = [];
  for (let i = 0; i < coarseInside.length; i++) if (coarseInside[i]) cells.push(i);
  const insideCells = Int32Array.from(cells);

  // Anchors: a square grid sized so about `regionCount` squares hold land,
  // one anchor per square at the interior cell nearest the square's land
  // centroid. Squares that are mostly sea (a sliver of coast) are skipped,
  // so an anchor never sits on a thin spit where its field would be poor.
  const spacing = Math.max(2, Math.round(Math.sqrt(insideCells.length / Math.max(1, regionCount))));
  const squares = new Map<number, { sx: number; sy: number; n: number }>();
  const squareCols = Math.ceil(gridWidth / spacing);
  for (const i of insideCells) {
    const gx = i % gridWidth;
    const gy = (i / gridWidth) | 0;
    const key = Math.floor(gy / spacing) * squareCols + Math.floor(gx / spacing);
    const sq = squares.get(key) ?? { sx: 0, sy: 0, n: 0 };
    sq.sx += gx;
    sq.sy += gy;
    sq.n++;
    squares.set(key, sq);
  }
  const anchorCells: number[] = [];
  for (const sq of squares.values()) {
    if (sq.n < spacing * spacing * 0.25) continue;
    const cx = sq.sx / sq.n;
    const cy = sq.sy / sq.n;
    let best = -1;
    let bestD = Infinity;
    for (const i of insideCells) {
      const d = ((i % gridWidth) - cx) ** 2 + (((i / gridWidth) | 0) - cy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) anchorCells.push(best);
  }
  const anchors: Vec2[] = anchorCells.map((i) => [(i % gridWidth) * cellSize, ((i / gridWidth) | 0) * cellSize]);

  // Region of each cell: its nearest anchor, straight-line. (A Voronoi split
  // can hand a cell across a firth to an anchor it has no short route to;
  // the particle's route field still gets it there, just the long way.)
  const cellRegion = new Int16Array(gridWidth * gridHeight).fill(-1);
  for (const i of insideCells) {
    const gx = i % gridWidth;
    const gy = (i / gridWidth) | 0;
    let best = -1;
    let bestD = Infinity;
    for (let a = 0; a < anchorCells.length; a++) {
      const d = ((anchorCells[a] % gridWidth) - gx) ** 2 + (((anchorCells[a] / gridWidth) | 0) - gy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    cellRegion[i] = best;
  }

  const fields = buildTargetFields(mask, anchors, coast, cellSize, smoothCells);
  return { cellSize, gridWidth, gridHeight, fields, anchors, insideCells, cellRegion };
}
