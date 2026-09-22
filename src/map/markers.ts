/**
 * Farm markers (Windfall_Map_Spec.md §5.5/Part G): a small mark at every
 * farm, in one of three states — declaring, held down, silent (no PN) —
 * never carried by colour alone. Provisional styling; step 4 sets the
 * final look. Held-down farms get no special motion in this step (§5.5's
 * sputtering emission is step 6).
 *
 * Built once per world rebuild (positions depend on the live Projection),
 * restyled on every data landing via `setFarmMarkerStates`.
 */
import type { Projection } from '../flow/projection';
import type { FarmSite, FarmMarkerState } from './farmSources';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Radius per state, device px — held-down reads slightly larger as a shape carrier, not only a colour one. */
export const RADIUS: Record<FarmMarkerState, number> = {
  declaring: 3.5,
  'held-down': 5,
  silent: 3.5,
};

export const HATCH_PATTERN_ID = 'map-farm-hatch';

/**
 * Style one `.map__farm-marker` circle for a state — the single place this
 * mapping lives, reused by both the main-stage layer below and the
 * Shetland inset's own markers (step 3b Part A), which need exactly the
 * same declaring/held-down/silent shape language, not a second convention.
 */
export function styleFarmMarker(circle: SVGCircleElement, state: FarmMarkerState): void {
  circle.dataset.state = state;
  circle.setAttribute('r', String(RADIUS[state]));
}

/** The hatch pattern is a page-level def, created once and reused by every held-down marker — matches tokens.css's `--hatch` convention (diagonal stripes) but as an SVG pattern, since a `fill` attribute can't reference a CSS background-image. */
export function ensureHatchDef(svg: SVGSVGElement): void {
  if (svg.querySelector(`#${HATCH_PATTERN_ID}`)) return;
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(SVG_NS, 'defs');
    svg.prepend(defs);
  }
  const pattern = document.createElementNS(SVG_NS, 'pattern');
  pattern.setAttribute('id', HATCH_PATTERN_ID);
  pattern.setAttribute('width', '4');
  pattern.setAttribute('height', '4');
  pattern.setAttribute('patternUnits', 'userSpaceOnUse');
  pattern.setAttribute('patternTransform', 'rotate(45)');
  const bg = document.createElementNS(SVG_NS, 'rect');
  bg.setAttribute('width', '4');
  bg.setAttribute('height', '4');
  bg.setAttribute('fill', 'var(--curtailed)');
  const stripe = document.createElementNS(SVG_NS, 'line');
  stripe.setAttribute('x1', '0');
  stripe.setAttribute('y1', '0');
  stripe.setAttribute('x2', '0');
  stripe.setAttribute('y2', '4');
  stripe.setAttribute('stroke', 'var(--curtailed-edge)');
  stripe.setAttribute('stroke-width', '1.5');
  pattern.append(bg, stripe);
  defs.append(pattern);
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
  markers: Iterable<[string, SVGCircleElement]>,
  farm: string | null
): void {
  if (farm === null) svg.removeAttribute('data-highlighting');
  else svg.setAttribute('data-highlighting', '');
  for (const [name, circle] of markers) {
    if (name === farm) {
      circle.setAttribute('data-highlight', '');
      svg.append(circle);
    } else {
      circle.removeAttribute('data-highlight');
    }
  }
}

export interface FarmMarkerLayer {
  /** Recompute every marker's cx/cy from the current Projection — call after buildWorld() on boot and every rebuild(). */
  reposition(project: Projection['project']): void;
  /** Restyle every marker to its current state — call on every data landing (live refresh, fixture switch, [ / ] cycle). */
  setStates(statesByFarm: Map<string, FarmMarkerState>): void;
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
  ensureHatchDef(svg);

  const circles = new Map<string, SVGCircleElement>();
  for (const site of sites) {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('class', 'map__farm-marker');
    circle.dataset.farm = site.farm;
    circle.dataset.state = 'silent';
    circle.setAttribute('r', String(RADIUS.silent));
    svg.append(circle);
    circles.set(site.farm, circle);
  }

  return {
    reposition(project) {
      for (const site of sites) {
        const circle = circles.get(site.farm);
        if (!circle) continue;
        const [x, y] = project(site.latLon);
        circle.setAttribute('cx', x.toFixed(1));
        circle.setAttribute('cy', y.toFixed(1));
      }
    },
    setStates(statesByFarm) {
      for (const [farm, circle] of circles) {
        styleFarmMarker(circle, statesByFarm.get(farm) ?? 'silent');
      }
    },
    setHidden(hidden) {
      for (const [farm, circle] of circles) {
        circle.style.display = hidden.has(farm) ? 'none' : '';
      }
    },
    setHighlight(farm) {
      setMarkerHighlight(svg, circles, farm);
    },
  };
}
