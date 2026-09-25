/**
 * Farm markers: one dot per farm, its area the farm's capacity, its look the
 * farm's state right now (Owen) — the same three states as the dot beside the
 * farm in the source list:
 *
 * - `on`: anything on the grid — solid navy (--bar-on).
 * - `held`: nothing on the grid, something held back — solid periwinkle
 *   (--bar-off), outlined in the darker held-back blue (--held-text): the fill
 *   alone is ~2.2:1 on the land, under WCAG's 3:1 for a meaningful graphic.
 * - `silent`: nothing on the grid and nothing held back — a navy keyline,
 *   no fill.
 * - `unknown`: no reading at all (waiting, offline) — a grey keyline, so the
 *   map never claims a farm is silent when it simply hasn't been read.
 *
 * A farm that changes state between readings fades to its new look and
 * sends out one ring in the new colour, so what moved this half hour is seen.
 *
 * Sizes run from RADIUS_MIN (6px across, the smallest a point symbol reliably
 * reads as a state) to RADIUS_MAX (16px across, Seagreen), area in proportion
 * to capacity between them. A picked farm grows and takes a --highlight ring.
 *
 * Built once per world rebuild (positions depend on the live Projection),
 * restyled on every data landing via `styleFarmMarker`.
 */
import type { Projection } from '../flow/projection';
import type { FarmSite } from './farmSources';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The largest farm's radius, css px; every other farm's area is its share of that farm's capacity. */
const RADIUS_MAX = 8;
/** Floor, css px: 6px across. By area alone the smallest farms would be under a pixel. */
const RADIUS_MIN = 3;
/** A farm with no capacity to go by is drawn this size. */
const RADIUS_UNKNOWN = 3.5;
/**
 * The selection ring's radius past the dot's, css px (before the picked
 * marker's own grow): a fixed step, so every farm gets the same clear space
 * between dot and ring — Seagreen's, whatever its size.
 */
const RING_OFFSET = 3;

/** What a marker draws: the farm's capacity and how it splits right now. */
export interface FarmReading {
  capacityMW: number;
  instructedMW: number;
  curtailedMW: number;
  /** False when only the capacity is known (no live reading yet, or none to be had). */
  read?: boolean;
}

export type FarmState = 'on' | 'held' | 'silent' | 'unknown';

/** The one rule for a farm's state, shared by its marker and its dot in the source list. */
export function farmStateOf(reading: FarmReading | null | undefined): FarmState {
  if (!reading || reading.read === false) return 'unknown';
  if (reading.instructedMW > 0) return 'on';
  if (reading.curtailedMW > 0) return 'held';
  return 'silent';
}

interface MarkerModel {
  x: number;
  y: number;
  reading: FarmReading | null;
  maxCapacityMW: number;
  /** The state last drawn, to tell a real change from a redraw. */
  state: FarmState | null;
}

const models = new WeakMap<SVGGElement, MarkerModel>();

/** Create an (unpositioned, unknown) marker: a group of the dot, the ring a selection draws, and the pulse a change of state sends out. */
export function createFarmMarker(farm: string): SVGGElement {
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'map__farm-marker');
  g.dataset.farm = farm;
  const dot = document.createElementNS(SVG_NS, 'circle');
  dot.setAttribute('class', 'map__farm-dot');
  const ring = document.createElementNS(SVG_NS, 'circle');
  ring.setAttribute('class', 'map__farm-ring');
  const pulse = document.createElementNS(SVG_NS, 'circle');
  pulse.setAttribute('class', 'map__farm-pulse');
  g.append(pulse, dot, ring);
  models.set(g, { x: 0, y: 0, reading: null, maxCapacityMW: 0, state: null });
  draw(g);
  return g;
}

export function positionFarmMarker(g: SVGGElement, x: number, y: number): void {
  const model = models.get(g);
  if (!model) return;
  model.x = x;
  model.y = y;
  draw(g);
}

/** Restyle one marker for a reading (null: no data for it). `maxCapacityMW` is the largest farm's, which sets the scale. */
export function styleFarmMarker(g: SVGGElement, reading: FarmReading | null, maxCapacityMW: number): void {
  const model = models.get(g);
  if (!model) return;
  model.reading = reading;
  model.maxCapacityMW = maxCapacityMW;
  draw(g);
}

function radiusFor(model: MarkerModel): number {
  const cap = model.reading?.capacityMW ?? 0;
  if (!(cap > 0) || !(model.maxCapacityMW > 0)) return RADIUS_UNKNOWN;
  // Area in proportion to capacity above the floor: r² runs linearly from
  // RADIUS_MIN² (a farm of no capacity) to RADIUS_MAX² (the largest).
  const share = Math.min(1, cap / model.maxCapacityMW);
  return Math.sqrt(RADIUS_MIN ** 2 + share * (RADIUS_MAX ** 2 - RADIUS_MIN ** 2));
}

function draw(g: SVGGElement): void {
  const model = models.get(g);
  if (!model) return;
  const r = radiusFor(model);
  const state = farmStateOf(model.reading);
  g.dataset.state = state;
  const [pulse, dot, ring] = g.children as unknown as [SVGCircleElement, SVGCircleElement, SVGCircleElement];
  for (const c of [pulse, dot, ring]) {
    c.setAttribute('cx', model.x.toFixed(1));
    c.setAttribute('cy', model.y.toFixed(1));
  }
  pulse.setAttribute('r', r.toFixed(2));
  dot.setAttribute('r', r.toFixed(2));
  ring.setAttribute('r', (r + RING_OFFSET).toFixed(2));

  // A farm whose state has changed between two real readings (on / held /
  // silent — not to or from unknown) sends out one ring in its new colour,
  // while the dot fades across (map.css): a change worth noticing, marked
  // once. A redraw in the same state, or the first reading, sends nothing.
  const changed = model.state !== null && model.state !== state && model.state !== 'unknown' && state !== 'unknown';
  model.state = state;
  if (changed) {
    pulse.classList.remove('is-pulsing');
    // Restart the animation: a reflow between removing and re-adding the class.
    void pulse.getBoundingClientRect();
    pulse.classList.add('is-pulsing');
  }
}

/**
 * Pick one farm's marker out from the rest (Windfall_Map_Spec_4c.md §4c.3,
 * DECISIONS 029): `data-highlight` on its circle, `data-highlighting` on the
 * svg so CSS can dim the others. Used by the main-stage layer below and by the
 * Shetland inset's own markers (main.ts), which are a separate svg. The picked
 * marker is moved to the end of its svg so it draws above its neighbours.
 */
export function setMarkerHighlight(
  svg: SVGSVGElement,
  markers: Iterable<[string, SVGGElement]>,
  farm: string | null
): void {
  if (farm === null) svg.removeAttribute('data-highlighting');
  else svg.setAttribute('data-highlighting', '');
  for (const [name, marker] of markers) {
    if (name === farm) {
      marker.setAttribute('data-highlight', '');
      svg.append(marker);
    } else {
      marker.removeAttribute('data-highlight');
    }
  }
}

export interface FarmMarkerLayer {
  /** Recompute every marker's position from the current Projection — call after buildWorld() on boot and every rebuild(). */
  reposition(project: Projection['project']): void;
  /** Redraw every marker for the latest readings (a farm with none draws idle, at the default size) — call on every data landing. */
  setReadings(readingsByFarm: Map<string, FarmReading>, maxCapacityMW: number): void;
  /**
   * Hide the main-stage marker for any farm not part of the current
   * projection's fit (step 3b Part A: a Shetland-archipelago farm in inset
   * mode) rather than showing it wherever its true, off-canvas position
   * happens to project to. The farm's marker still exists — it moves to the
   * inset instead (main.ts's `drawInset`).
   */
  setHidden(hidden: ReadonlySet<string>): void;
  /** Light one farm's marker and dim the rest, or (null) put them all back. */
  setHighlight(farm: string | null): void;
}

export function createFarmMarkerLayer(svg: SVGSVGElement, sites: FarmSite[]): FarmMarkerLayer {
  const markers = new Map<string, SVGGElement>();
  for (const site of sites) {
    const marker = createFarmMarker(site.farm);
    svg.append(marker);
    markers.set(site.farm, marker);
  }

  return {
    reposition(project) {
      for (const site of sites) {
        const marker = markers.get(site.farm);
        if (!marker) continue;
        const [x, y] = project(site.latLon);
        positionFarmMarker(marker, x, y);
      }
    },
    setReadings(readingsByFarm, maxCapacityMW) {
      for (const [farm, marker] of markers) {
        styleFarmMarker(marker, readingsByFarm.get(farm) ?? null, maxCapacityMW);
      }
    },
    setHidden(hidden) {
      for (const [farm, marker] of markers) {
        marker.style.display = hidden.has(farm) ? 'none' : '';
      }
    },
    setHighlight(farm) {
      setMarkerHighlight(svg, markers, farm);
    },
  };
}
