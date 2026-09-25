/**
 * Boot for /map — step 4: the simplified information layer and foundations
 * (Windfall_Map_Spec.md, DECISIONS 026/027).
 *
 * Step 4 cuts the information layer to one headline, two mixes and a border
 * affordance (026), and replaces the step-1 provisional type/colour with a
 * built system (Part B). Concretely, against step 3b:
 *
 * - The narration view, the wind note, and every eyebrow heading are gone
 *   from this page (narrate.ts and narrationView stay in the repo for `/`).
 * - mastheadView, headlineView and bandView (../view/*) are no longer used
 *   here — their DOM carries chrome (eyebrows, a strapline, a hidden legend,
 *   a capacity-denominator percentage) this page doesn't want, so the map
 *   gets its own leaner views under ./views/*, sharing only the copy and
 *   tense/state logic that must never drift between the two pages
 *   (constraint.ts's three-state strings, band.ts's SCOTLAND/ENGLAND specs).
 * - The border's constraint sentence moves from a permanently visible
 *   caption card to a tooltip on hover/tap/focus of a wide hit area, with a
 *   small always-on label so the affordance is discoverable, and the same
 *   sentence printed in the method note for touch/screen-reader visitors.
 * - Eczar and Mukta replace the provisional system font; the fuel/signal
 *   palette in tokens-light.css is rebuilt as a role system rather than
 *   picked colour by colour.
 * - A dev-only `?plate=tokens` route renders the type scale, every colour
 *   token and the two bars in two fixtures, for the Figma gate.
 *
 * Everything about the geometry — islands, the shared projection, farm
 * sources and markers, the Shetland inset, the field/particle system itself
 * — is untouched from step 3b; none of that is in scope for step 4 (§5.3 of
 * the plan: the drawn-island retune waits for step 6, after the border
 * spike).
 *
 * Step 4b (Windfall_Map_Spec_4b.md, DECISIONS 028) reverses the composition:
 * the full-bleed map with panels floated over it becomes a 12-column grid
 * (styles/grid.css) — a clean text column and a contained map cell side by
 * side from 1280px, stacked below it. The map is fit to its own cell with an
 * exact 24px padding; the mix panels sit on the grid's columns horizontally
 * and track the projected coastline vertically; the border label is still
 * placed by the projection alone. What moved in the DOM, and why, is noted
 * where it happens below.
 *
 * Step 4c (Windfall_Map_Spec_4c.md, DECISIONS 029) changes what the page says
 * and does rather than how it is laid out. 4c.1, here: the border becomes a
 * passive line (no hit area, label, tooltip or pointer logic), the Shetland
 * inset moves above the Scotland mix and loses its caption (its square, with
 * a 1px outline and the name in the corner, is the frame's), the freshness dot
 * pulses between the bar's two blues, and the colophon and byline are re-cut.
 * 4c.2 reframes the headline (views/headline.ts). 4c.3: the bar and the
 * tracked farms under it are one disclosure (views/sources.ts), open on desktop
 * and shut on mobile, and selecting a farm in it lights that farm's marker and
 * flow on the map and dims the rest — a paint change only. 4c.4, here: the
 * settlement row and the page's one consolidated explanation are a second
 * disclosure (views/settlement.ts), replacing colophon.ts's own "How this
 * number is worked out" toggle (retired from this page, still built for `/`)
 * and the border's old tooltip sentence.
 */

import '../styles/tokens.css';
import '../styles/tokens-light.css';
import '../styles/grid.css';
import '../styles/app.css';
import '@fontsource-variable/eczar';
import '@fontsource/mukta/300.css';
import '@fontsource/mukta/400.css';
import '@fontsource/mukta/500.css';
import '@fontsource/mukta/700.css';
import './map.css';

import { DEFAULT_FIELD_PARAMS, type FieldParams } from '../flow/field';
import { DEFAULT_PARTICLE_STYLE, ParticleSystem, type ParticleStyle } from '../flow/particles';
import { renderDebugOverlay, type DebugLayer } from '../flow/debug';
import { LIGHT_PALETTE } from '../flow/palette';
import { buildWorld, type World } from '../flow/world';
import type { Source } from '../flow/types';
import gbCountries from './data/gb-countries.json';
import {
  applyFarmRates,
  buildFarmSources,
  FARM_SITES,
  isOffMainFit,
} from './farmSources';
import {
  createFarmMarker,
  createFarmMarkerLayer,
  positionFarmMarker,
  setMarkerHighlight,
  styleFarmMarker,
  type FarmMarkerLayer,
  type FarmReading,
} from './markers';
import { flowDensity } from './rate';
import { prefersReducedMotion } from '../lib/motion';
import { createMapControlPanel } from './controls';
import { CITIES } from './cities';
import { FARM_CAPACITY_MW } from './farmCapacity';
import { renderSwatchPlate } from './swatchPlate';
import { fetchCoreFeeds } from '../lib/client';
import { msUntilRolloverCheck } from '../lib/settlement';
import { scenarioByName, SCENARIOS } from '../lib/scenarios';
import { emptyFeeds, type AppState } from '../lib/state';
import type { FarmNow } from '../lib/types';

import { el, type View } from '../view/dom';
import { SCOTLAND, ENGLAND } from '../view/band';
import { colophonView } from '../view/colophon';
import { toggleView } from '../view/toggle';
import { mapMastheadView } from './views/masthead';
import { mapHeadlineView } from './views/headline';
import { mapSourcesView } from './views/sources';
import { mapSettlementView } from './views/settlement';
import { mapBandView } from './views/band';
import { buildProjection } from '../flow/projection';
import { extendToCoast } from './borderLine';

const params = new URLSearchParams(location.search);

// Part B.4: the swatch plate is a completely separate render path — no
// projection, no canvas, no live fetch. Checked before anything else boots.
if (params.get('plate') === 'tokens') {
  renderSwatchPlate(document.querySelector<HTMLDivElement>('#map-app')!);
} else {
  bootMap();
}

function bootMap(): void {
  interface IslandRing {
    name: string;
    ring: [number, number][];
  }

  const ISLAND_RING = (gbCountries as unknown as { island: { ring: [number, number][] } }).island
    .ring;
  // 4c: a plain divider drawn coast to coast — the source line stops short of
  // the drawn coast at both ends (borderLine.ts).
  const BORDER_LINE = extendToCoast(
    (gbCountries as unknown as { border: { line: [number, number][] } }).border.line,
    ISLAND_RING,
  );
  const ALL_ISLANDS = (gbCountries as unknown as { islands: IslandRing[] }).islands;

  /**
   * True extent draws Shetland where it actually is, at the cost of shrinking
   * the mainland ~20% to fit it in; inset keeps the mainland at full size and
   * shows Shetland in a small, separately-projected box (buildInset below).
   * Unchanged from step 3b (DECISIONS 025) — not in scope for step 4. Toggle
   * with 't' for the gate screenshot pair; inset is the shipped default.
   */
  type ExtentMode = 'trueExtent' | 'inset';
  let extentMode: ExtentMode = 'inset';
  /** The Shetland square: this share of the drawn map's width, with a floor
   *  that keeps its 12px name legible, and the gap kept under it (4d). */
  const INSET_SCALE = 0.2;
  const INSET_MIN_PX = 72;
  const INSET_CLEARANCE_PX = 16;
  const INSET_STROKE_PX = 1;
  const FOOT_CLEARANCE_PX = 24;
  const SHETLAND_ARCHIPELAGO = new Set(['Shetland Mainland', 'Yell', 'Unst']);

  function islandsForFit(): IslandRing[] {
    return extentMode === 'trueExtent'
      ? ALL_ISLANDS
      : ALL_ISLANDS.filter((i) => !SHETLAND_ARCHIPELAGO.has(i.name));
  }

  // --- Build the whole page from here (src/main.ts's own pattern), rather
  // than from static markup — most of what's on screen is a reused or
  // map-specific view module now, not bespoke HTML. -------------------------

  const app = document.querySelector<HTMLDivElement>('#map-app')!;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('class', 'map__svg');
  svg.setAttribute('aria-hidden', 'true');
  const canvas = document.createElement('canvas');
  canvas.className = 'map__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d')!;

  // Island paths (mainland + every drawn island) are rebuilt per rebuild()
  // since which islands are in play depends on extentMode; the border line is
  // a stable element reused across rebuilds. It is passive (4c, DECISIONS 029):
  // no hit area, label or tooltip — its explanation lives in the one disclosure.
  let islandPaths: SVGPathElement[] = [];
  const borderPath = document.createElementNS(SVG_NS, 'path');
  borderPath.setAttribute('class', 'map__border-line');
  borderPath.setAttribute('aria-hidden', 'true');
  svg.append(borderPath);

  // The inset (step 3b's default path — DECISIONS 025): a small, separately-
  // projected SVG box for Shetland, shown only in 'inset' extent mode.
  const insetSvg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  insetSvg.setAttribute('class', 'map__inset');
  insetSvg.setAttribute('aria-hidden', 'true');
  const insetIslandPaths: SVGPathElement[] = [];
  const insetMarkers = new Map<string, SVGGElement>();
  const insetBox = el(
    'div',
    { class: 'map__inset-box' },
    insetSvg,
    el('p', { class: 'map__inset-label', text: 'Shetland' }),
  );

  const stage = el('div', { class: 'map__stage', id: 'map-stage' }, svg, canvas);

  // --- Views (Part A/C) ------------------------------------------------------
  const masthead = mapMastheadView();
  const scotlandBand = mapBandView(SCOTLAND);
  const englandBand = mapBandView(ENGLAND);
  const headline = mapHeadlineView();
  const colophon = colophonView();

  // Picking a farm in the source list picks it out on the map (4c.3): its flow
  // in the --highlight blue with the rest dimmed, and its marker likewise. Held
  // here, so a rebuild that redraws the inset's markers can re-apply it.
  let highlightedFarm: string | null = null;
  const sources = mapSourcesView({ onSelect: highlightFarm });

  // The two mix panels are grid items of the map cell (map.css): their columns
  // come from the grid tokens, their vertical position from positionOverlays()
  // below. Hidden until that has run, so neither ever flashes at row 0.
  // The Shetland inset (built above, drawn by drawInset) is its own overlay
  // since 4d: pinned to the top-right corner of the drawn map and scaled with
  // it (positionOverlays), no longer the first thing in Scotland's panel.
  const scotlandPanel = el('section', { class: 'map__overlay panel panel--scotland' }, scotlandBand.el);
  const englandPanel = el('section', { class: 'map__overlay panel panel--england' }, englandBand.el);

  // Part A.8: stagger, headline 0/breakdown 1 (set inside views/headline.ts
  // itself, two steps within one view's root), Scotland 2, England 3 (the
  // border, which used to be 3, is a plain line now and takes no part).
  [scotlandPanel, englandPanel].forEach((node, i) => {
    node.style.setProperty('--i', String(i + 2));
  });

  // The map cell: the stage plus the two geography-anchored overlays. It is
  // the containing block positionOverlays() measures against.
  const composition = el(
    'div',
    { class: 'composition', id: 'composition' },
    stage,
    englandPanel,
    scotlandPanel,
    insetBox
  );
  // A country's "Show summary" changes its panel's height, and the panels are
  // placed by their heights (positionOverlays). `toggle` doesn't bubble, hence
  // the capture.
  composition.addEventListener('toggle', () => positionOverlays(), true);

  // --- Step 4b: three pieces of the old chrome move into the text column. ------
  // Each is a re-parent, not a rewrite: the view that renders it keeps
  // building and updating it exactly as before, so its freshness, notice and
  // state rules travel with it.
  //
  // 1. The bar and its list, then the settlement-period row — the frame's own
  //    order (§1): sentence, bar, list, settlement row, explanation. Since 4d
  //    the list is always shown (views/sources.ts grows it in batches) rather
  //    than a disclosure open on desktop and shut on mobile.
  headline.el.append(sources.el);

  // The settlement heading: the masthead view still owns and keeps fresh the
  // clock element itself, it just isn't rendered in the masthead any more. It
  // is the summary of the method disclosure (views/settlement.ts). Its
  // freshness dot and age are a separate element since 4d, seated in the
  // footer below.
  const settlement = mapSettlementView(masthead.clock);
  headline.el.append(settlement.el);

  // 2. The old "How this number is worked out" toggle — colophonView's own
  //    <details>, reused unchanged on `/` — is retired from this page (4c.4):
  //    everything it said lives in the settlement disclosure above, once.
  //    Detached rather than edited, since colophon.ts is shared with `/`.
  colophon.el.querySelector<HTMLElement>('.method')!.remove();
  const textBlock = el('div', { class: 'map-text' }, headline.el);

  // 3. The byline reads as the Figma frames have it: "Built by Owen Thomas ✺
  //    owenthomas.work", the domain a link. The "figures are lower bounds"
  //    clause is dropped from the screen (the method note says it), not from
  //    colophon.ts, which `/` still uses unchanged. The glyph is U+273A and its
  //    clear space is CSS on the separator (`.byline__sep`), not literal spaces
  //    a browser would collapse; it is decorative, so hidden from assistive tech.
  colophon.el
    .querySelector('.colophon__byline')!
    .replaceChildren(
      // 4d (Owen): "Built by owenthomas.work".
      'Built by ',
      el('a', { class: 'byline__link', href: 'https://owenthomas.work', text: 'owenthomas.work' }),
    );

  // 4. The coloured source squares go on /map. Health is still stated in words
  //    beside each source ("answering", "not answering", …) — the mark was
  //    only ever a second, redundant cue — so nothing is lost. Removed here,
  //    not in colophon.ts, which `/` uses unchanged.
  colophon.el.querySelectorAll('.source__mark').forEach((mark) => mark.remove());

  // 5. 4d: the footer reads "Carbon Intensity • Elexon Insights ● Updated 6
  //    minutes ago" — the freshness moves here from the settlement row, after
  //    the two sources and before the byline. Each source's health word stays
  //    in the DOM but only shows when that source isn't answering (map.css).
  //    The two sources are grouped so that, when the line wraps on a phone,
  //    the freshness drops to its own line flush left rather than indented.
  //    Each source says what it gives the page, not just its product name —
  //    "Carbon Intensity" and "Elexon Insights" meant nothing on their own
  //    (Owen) — with the organisation linked.
  const [carbonRow, elexonRow] = colophon.el.querySelectorAll('.source');
  carbonRow
    .querySelector('.source__name')!
    .replaceChildren(
      'Grid mix from ',
      el('a', { class: 'map-foot__link', href: 'https://carbonintensity.org.uk', text: 'NESO' })
    );
  elexonRow
    .querySelector('.source__name')!
    .replaceChildren(
      'Switch-offs from ',
      el('a', { class: 'map-foot__link', href: 'https://bmrs.elexon.co.uk', text: 'Elexon' })
    );
  const feeds = el('span', { class: 'map-foot__feeds' }, carbonRow, elexonRow);
  colophon.el.querySelector('.colophon__byline')!.before(feeds, masthead.freshness);

  // The footer sits in the same grid row as the map and overlays its bottom-
  // left corner, as the Figma frames do; the dev state toggle rides in it so
  // scaffolding never adds a row to the layout.
  const foot = el('div', { class: 'map-foot' }, colophon.el);

  app.classList.add('grid', 'map-page');
  app.replaceChildren(masthead.el, textBlock, composition, foot);

  // Part C.6 (step 3 numbering retained): the state toggle and its
  // colophon-flow position, as on `/`.
  let scenarioName = scenarioByName(params.get('state')).name;
  const showToggle = params.has('dev') || params.has('state') || import.meta.env.DEV;
  const toggle = showToggle ? toggleView(scenarioName, selectScenario) : null;
  if (toggle) foot.append(toggle.el);

  // Map wind tuning: /flow's defaults were tuned for a field that had to draw
  // the island's silhouette on its own (§5.3). With the island drawn, the map
  // wants calmer air — slower, longer and finer trails, wider turns, and no
  // per-particle wobble (the fine noise octave), so neighbours move together
  // the way wind does rather than each wriggling on its own. The density push
  // is capped lower so spacing corrections read as drift, not shoves. The
  // coast is drawn, so the flow no longer traces it: particles keep their
  // course and run off the edge (coastMode 'exit').
  const fieldParams: FieldParams = {
    ...DEFAULT_FIELD_PARAMS,
    noiseScale: 2,
    noiseWeight: 0.3,
    noiseSpeed: 0.03,
    fineNoiseWeight: 0,
    densityMaxPush: 30,
    coastMode: 'exit',
    // Prototype: 'blanket' — each particle heads for a point drawn evenly
    // across the land south of its farm, and most are born partway along
    // that route, so flow covers the island instead of running as a river
    // from Scotland. 'targets' (the cities, cities.ts) is the previous
    // prototype, still on the panel's field button. Without the coast
    // rescue, the divergent field (away from the farms) has a sink at the
    // border and never reaches England.
    baseFieldMode: 'blanket',
    pathWeight: 0.9,
    targetDirectness: 0.8,
    // Recycling respawns a particle that lingers somewhere crowded. The farms
    // cluster in the central belt, which is crowded by construction, so it
    // was killing half the flow there before any reached England.
    densityRecycleThreshold: Infinity,
  };
  const particleStyle: ParticleStyle = {
    ...DEFAULT_PARTICLE_STYLE,
    jitterAmount: 0.5,
    spawnJitterRadius: 8,
    speed: 45,
    turnRate: 0.1,
    // Lower farm births and a lean toward the far end of the journey measured
    // most even: every Scottish route squeezes through the border, so births
    // spread evenly along each route still crowd that corridor.
    farmBirthShare: 0.15,
    midJourneyBias: 1.5,
  };
  const palette = { ...LIGHT_PALETTE, washAlpha: 0.03, baseStrokeWidth: 1.1 };
  // The pool at full capacity: strictly proportional density (rate.ts) shows
  // the on-grid share of it, so a typical ~30% period draws ~600.
  const particleCount = 2000;

  // Rebuilt in rebuild() from the current extent's available islands — see
  // `isOffMainFit`'s docs — so the object identities (and hence which farms
  // are landing-only sources) always match what's actually drawn.
  let farmSources: Source[] = [];
  /** Farms currently rendered only in the inset, not on the main stage. */
  let offMainStageFarms = new Set<string>();
  let lastFarmsNow: FarmNow[] | null = null;
  /** The first reading with any flow has landed (its arrival ramp has started) — see landFarms. */
  let flowArrived = false;

  let world: World;
  let particles: ParticleSystem;
  let currentDpr = 1;
  /** The stage's height when last built, css px: the floor panels are kept above. */
  let stageCssHeight = 0;
  /** The drawn map's bounding box in the stage, css px — where the inset pins. */
  let fitBounds = { left: 0, top: 0, right: 0, bottom: 0 };
  let debugCanvas: HTMLCanvasElement | null = null;
  let debugLayers = new Set<DebugLayer>(['mask']);
  let debugVisible = false;
  let markerLayer: FarmMarkerLayer;

  function sizeStage(): { width: number; height: number } {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    currentDpr = dpr;
    const rect = stage.getBoundingClientRect();
    const cssWidth = Math.max(1, rect.width);
    const cssHeight = Math.max(1, rect.height);
    stageCssHeight = cssHeight;
    const width = Math.round(cssWidth * dpr);
    const height = Math.round(cssHeight * dpr);

    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.width = `${cssWidth}px`;
    svg.style.height = `${cssHeight}px`;

    return { width, height };
  }

  function ringToPath(ring: [number, number][], project: World['projection']['project']): string {
    let d = '';
    for (let i = 0; i < ring.length; i++) {
      const [x, y] = project(ring[i]);
      d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)} `;
    }
    return `${d}Z`;
  }

  function lineToPath(line: [number, number][], project: World['projection']['project']): string {
    let d = '';
    for (let i = 0; i < line.length; i++) {
      const [x, y] = project(line[i]);
      d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)} `;
    }
    return d.trim();
  }

  function drawIslands(project: World['projection']['project']) {
    for (const path of islandPaths) path.remove();
    islandPaths = [];

    const mainlandPath = document.createElementNS(SVG_NS, 'path');
    mainlandPath.setAttribute('class', 'map__island');
    mainlandPath.setAttribute('d', ringToPath(ISLAND_RING, project));
    svg.insertBefore(mainlandPath, borderPath);
    islandPaths.push(mainlandPath);

    for (const island of islandsForFit()) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', 'map__island');
      path.dataset.island = island.name;
      path.setAttribute('d', ringToPath(island.ring, project));
      svg.insertBefore(path, borderPath);
      islandPaths.push(path);
    }
  }

  /** The inset square's side the last time it was drawn, css px. */
  let insetSide = 0;

  function drawInset(side = insetSide) {
    if (extentMode !== 'inset') {
      insetBox.style.display = 'none';
      return;
    }
    insetBox.style.display = 'block';
    const shetlandIslands = ALL_ISLANDS.filter((i) => SHETLAND_ARCHIPELAGO.has(i.name));
    if (shetlandIslands.length === 0 || side <= 0) return;
    insetSide = side;

    // 4d: the svg is the whole square, drawn at its own pixel size. The
    // archipelago is fitted into the space under the name's strip (so it keeps
    // its shape at every size — Owen), at 90% of it so there's room to move,
    // then slid so its farm's dot is as near the square's centre as the
    // island's own extent allows without running under the name or off the
    // square.
    const band = 26;
    const pad = 6;
    insetSvg.setAttribute('viewBox', `0 0 ${side} ${side}`);

    const allPoints = shetlandIslands.flatMap((i) => i.ring);
    const areaW = side - 2 * pad;
    const areaH = Math.max(1, side - band - pad);
    const fitted = buildProjection(allPoints, areaW, areaH * 0.9, { padding: 0 });
    let minY = Infinity;
    let maxY = -Infinity;
    for (const point of allPoints) {
      const [, y] = fitted.project(point);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const anchorSite = FARM_SITES.find((s) => offMainStageFarms.has(s.farm));
    const [ax, ay] = anchorSite ? fitted.project(anchorSite.latLon) : [areaW / 2, (minY + maxY) / 2];
    const dx = side / 2 - ax;
    // Centre the dot, then clamp: the island's top no higher than the strip's
    // foot, its bottom no lower than the square's padding.
    const dy = Math.min(Math.max(side / 2 - ay, band - minY), side - pad - maxY);
    const insetProjection = {
      project: (p: [number, number]): [number, number] => {
        const [x, y] = fitted.project(p);
        return [x + dx, y + dy];
      },
    };

    for (const p of insetIslandPaths) p.remove();
    insetIslandPaths.length = 0;
    for (const island of shetlandIslands) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', 'map__island');
      path.setAttribute('d', ringToPath(island.ring, insetProjection.project));
      insetSvg.append(path);
      insetIslandPaths.push(path);
    }

    for (const marker of insetMarkers.values()) marker.remove();
    insetMarkers.clear();

    const shetlandFarms = FARM_SITES.filter((s) => offMainStageFarms.has(s.farm));
    const { readings, maxCapacityMW } = farmReadings();
    for (const site of shetlandFarms) {
      const marker = createFarmMarker(site.farm);
      const [x, y] = insetProjection.project(site.latLon);
      positionFarmMarker(marker, x, y);
      styleFarmMarker(marker, readings.get(site.farm) ?? null, maxCapacityMW);
      insetSvg.append(marker);
      insetMarkers.set(site.farm, marker);
    }
    setMarkerHighlight(insetSvg, insetMarkers, highlightedFarm);
  }

  function drawGeometry() {
    drawIslands(world.projection.project);
    borderPath.setAttribute('d', lineToPath(BORDER_LINE, world.projection.project));
    markerLayer.reposition(world.projection.project);
    markerLayer.setHidden(offMainStageFarms);
    drawInset();
  }

  /** A number-valued custom property off the map cell — the tier tokens in styles/grid.css. */
  function tokenNumber(name: string, fallback: number): number {
    const raw = parseFloat(getComputedStyle(composition).getPropertyValue(name));
    return Number.isFinite(raw) ? raw : fallback;
  }

  /**
   * The mix panels sit in the map's own coordinate space (the same Projection
   * that draws the coast), not a hand-placed CSS position — so they track the
   * map cell's actual fit rather than an assumed one.
   *
   * The two mix panels split the job with the grid
   * (spec 4b §4): *which columns* they occupy is CSS — Scotland the last N of
   * the map cell's, England the first N, N being the tier's `--mix-span` — and
   * only the *vertical* position is the projection's, the panel's top edge
   * sitting at the latitude in `--anchor-scotland-lat` / `--anchor-england-lat`.
   * That is what the Figma frames do: the panels are flush to the columns but
   * level with the country they describe, at every fit.
   *
   * It is the *mix band's* top edge that sits at the anchor, not the panel's
   * (`lead-in` below; 0 since 4d moved the Shetland inset out of Scotland's
   * panel to the map's top-right corner, placed here too).
   *
   * Measured against `.composition` rather than `.map__stage` itself via
   * getBoundingClientRect, in css px (world.projection deals in device px).
   */
  function positionOverlays() {
    const stageRect = stage.getBoundingClientRect();
    const compRect = composition.getBoundingClientRect();
    const offsetY = stageRect.top - compRect.top;
    const offsetX = stageRect.left - compRect.left;

    // 4d: the Shetland square pins to the top-right corner of the drawn map
    // (the fitted island's bounding box) and scales with it: a fifth of the
    // map's width, never so small the name won't fit (Owen).
    let inset: { left: number; right: number; top: number; bottom: number } | null = null;
    if (extentMode === 'inset') {
      const fitWidth = fitBounds.right - fitBounds.left;
      const side = Math.max(INSET_MIN_PX, fitWidth * INSET_SCALE);
      const left = offsetX + fitBounds.right - side;
      const top = offsetY + fitBounds.top;
      insetBox.style.left = `${left}px`;
      insetBox.style.top = `${top}px`;
      insetBox.style.width = `${side}px`;
      // Drawn at its own size: the stroke is inside the box, so the svg's.
      const inner = side - 2 * INSET_STROKE_PX;
      if (Math.abs(inner - insetSide) > 0.5) drawInset(inner);
      inset = { left, right: left + side, top, bottom: top + side };
    }

    // Stacked, the footer sits over or right under the map cell's bottom-left
    // corner; a panel over the same columns (England's, with its summary open)
    // ends a clear 24px above it rather than running into it (4d).
    const footRect = document.querySelector('.map-foot')?.getBoundingClientRect();
    // The floor is the stage as it was built, not the cell's live height: stacked,
    // the cell grows with a panel that runs past it, so its height would move
    // with the very panel being placed.
    const cellFloor = offsetY + stageCssHeight;
    function floorFor(panel: HTMLElement): number {
      const left = compRect.left + panel.offsetLeft;
      const sharesColumns = footRect && left < footRect.right && left + panel.offsetWidth > footRect.left;
      const footTop = footRect ? footRect.top - compRect.top : Infinity;
      // Whether it overlays the cell or starts right under it, keep the gap.
      // (Its own live position can't be trusted either — it sits under a cell
      // the panel may be stretching — so the built floor bounds it.)
      return sharesColumns ? Math.min(cellFloor, footTop) - FOOT_CLEARANCE_PX : cellFloor;
    }

    /** Top edge of a panel whose band starts `leadIn` px below it, so the band sits at a latitude; kept inside the cell (and clear of the footer) so a low anchor on a short map never clips it. */
    function panelTop(panel: HTMLElement, lat: number, leadIn: number): number {
      const [, y] = world.projection.project([lat, 0]);
      const wanted = offsetY + y / currentDpr - leadIn;
      return Math.max(0, Math.min(wanted, floorFor(panel) - panel.offsetHeight));
    }

    for (const [panel, band, token, fallback] of [
      [scotlandPanel, scotlandBand.el, '--anchor-scotland-lat', 57.2],
      [englandPanel, englandBand.el, '--anchor-england-lat', 54.4],
    ] as const) {
      let top = panelTop(panel, tokenNumber(token, fallback), band.offsetTop);
      // A panel sharing columns with the Shetland square (a phone: Scotland's
      // hangs from the top of the cell) starts clear below it.
      const overlaps = inset && panel.offsetLeft < inset.right && panel.offsetLeft + panel.offsetWidth > inset.left;
      if (inset && overlaps && top < inset.bottom + INSET_CLEARANCE_PX) {
        top = Math.min(inset.bottom + INSET_CLEARANCE_PX, floorFor(panel) - panel.offsetHeight);
      }
      // Sitting above the panel's content, the square lines up with its left
      // edge rather than the map's corner (Owen).
      if (inset && overlaps && top >= inset.bottom) insetBox.style.left = `${panel.offsetLeft}px`;
      // Beside it in one row (a tablet), the panel drops so the cap height of
      // "Scotland" is level with the square's top edge (Owen). The name is
      // trimmed to its cap height (text-box), so its box top is the cap.
      if (inset && !overlaps && panel === scotlandPanel && top < inset.bottom) {
        const place = band.querySelector('.map-band__place');
        const capOffset = place ? place.getBoundingClientRect().top - panel.getBoundingClientRect().top : 0;
        top = Math.max(0, Math.min(inset.top - capOffset, floorFor(panel) - panel.offsetHeight));
      }
      panel.style.setProperty('--anchor-y', `${top}px`);
      panel.style.visibility = 'visible';
    }
  }

  function paintTransparent() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  /** A colour token, resolved — the canvas takes a colour string, not a var(). */
  function tokenColor(name: string, fallback: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  /**
   * Pick one farm out on the map, or (null) put everything back. The
   * particles draw its flow in --highlight and the rest dimmed (and, under
   * 'blanket', its particles are born at the farm while it is picked), and its
   * marker (on the main stage or in the Shetland inset, wherever it is drawn)
   * lights while the others fade. No relayout, no rebuild.
   */
  function highlightFarm(farm: string | null) {
    highlightedFarm = farm;
    // Dimmed well down (the flow default is 0.22): at the map's fine line
    // weight, the picked farm's thread was lost among the rest at that level.
    // Its share of the flow is its honest one — a farm making a few MW shows a
    // particle or none (Owen).
    particles.setHighlightSource(farm, {
      color: tokenColor('--highlight', '#0a7cff'),
      dimAlpha: 0.07,
      // The flow dims and returns at the markers' own pace (--dur-quick).
      fadeSeconds: prefersReducedMotion() ? 0 : 0.06,
    });
    markerLayer.setHighlight(farm);
    setMarkerHighlight(insetSvg, insetMarkers, farm);
  }

  /** The stage's css size and the DPR it is drawn at — what a rebuild is a function of. */
  function stageSizeKey(): string {
    const rect = stage.getBoundingClientRect();
    return `${Math.round(rect.width)}x${Math.round(rect.height)}@${window.devicePixelRatio}`;
  }
  let builtStageSize = '';

  function rebuild() {
    const { width, height } = sizeStage();
    builtStageSize = stageSizeKey();
    const fitIslands = islandsForFit();
    // Step 4b (DECISIONS 028): the fit extent is everything the stage draws —
    // the mainland plus every island in play — in *both* extent modes. Before
    // 4b the inset mode fit the mainland alone and let Orkney and the Outer
    // Hebrides poke into a generous fractional margin; with the map now
    // asked to sit inside its cell with an exact 24px padding, that would
    // clip them (Orkney by ~13px at 1280x720). The inset mode still keeps
    // Shetland out of it — that is the whole point of the inset.
    const projectionRing = [...ISLAND_RING, ...fitIslands.flatMap((i) => i.ring)];

    const availableIslandNames = new Set(fitIslands.map((i) => i.name));
    farmSources = buildFarmSources(FARM_SITES, availableIslandNames);
    offMainStageFarms = new Set(
      FARM_SITES.filter((s) => isOffMainFit(s, availableIslandNames)).map((s) => s.farm),
    );

    world = buildWorld(ISLAND_RING, farmSources, width, height, {
      corridorWidthPx: fieldParams.steerThreshold * 2,
      islands: ALL_ISLANDS,
      projectionRing,
      // Spec 4b §5.3: the padding is the `--map-pad` token, in css px, scaled
      // to the device px the world is built in — exact at every cell size and DPR.
      projectionOptions: { paddingPx: tokenNumber('--map-pad', 24) * currentDpr },
      targets: CITIES,
      regionCount: 32,
    });

    if (particles) {
      particles.setWorld(world);
    } else {
      particles = new ParticleSystem(world, particleCount, { style: particleStyle, fieldParams, allocation: 'quota' });
      // Nothing flows until farm data lands (landFarms sets the real density).
      particles.setActiveFraction(flowDensity(lastFarmsNow));
    }
    if (!markerLayer) markerLayer = createFarmMarkerLayer(svg, FARM_SITES);
    fitBounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    for (const point of projectionRing) {
      const [x, y] = world.projection.project(point);
      fitBounds.left = Math.min(fitBounds.left, x / currentDpr);
      fitBounds.right = Math.max(fitBounds.right, x / currentDpr);
      fitBounds.top = Math.min(fitBounds.top, y / currentDpr);
      fitBounds.bottom = Math.max(fitBounds.bottom, y / currentDpr);
    }
    debugCanvas = null;
    landFarms(lastFarmsNow);
    drawGeometry();
    positionOverlays();
    paintTransparent();
  }

  // Rebuild whenever the map cell's own size changes, not just the window's:
  // stacked, the cell is whatever height is left under the text block, so a
  // web font landing (and re-wrapping the headline) moves it without any
  // window resize. Compared against the size rebuild() last built for, so the
  // observer's initial callback (and any no-op layout pass) costs nothing.
  let resizeTimer: number | undefined;
  new ResizeObserver(() => {
    if (stageSizeKey() === builtStageSize) return;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(rebuild, 200);
  }).observe(stage);

  // Field-tuning tools — the rate panel ('h'), debug layers ('d', 1–4), the
  // extent and panel-style toggles ('t', 'c') — exist only in dev or with
  // ?dev. On production they were live keys on a public page, and the rate
  // panel sat in the DOM as a hidden <h2> (4d).
  const devTools = import.meta.env.DEV || params.has('dev');
  window.addEventListener('keydown', (e) => {
    if (!devTools) return;
    if (e.key === 'd') {
      debugVisible = !debugVisible;
    } else if (e.key === '1') {
      toggleLayer('coastline');
    } else if (e.key === '2') {
      toggleLayer('mask');
    } else if (e.key === '3') {
      toggleLayer('sdf');
    } else if (e.key === '4') {
      toggleLayer('gradient');
    } else if (e.key === 'h') {
      controlPanel?.toggle();
    } else if (e.key === 't') {
      // Gate-review convenience: the shipped inset default vs. the
      // true-extent toggle, side by side across two screenshots.
      extentMode = extentMode === 'trueExtent' ? 'inset' : 'trueExtent';
      console.log(`[map] extent -> ${extentMode}`);
      rebuild();
    } else if (e.key === 'c') {
      // Part B.3 gate convenience: card vs. wash panel treatment, for the
      // before/after pair DECISIONS 027 records.
      const next = document.body.dataset.panelStyle === 'card' ? 'wash' : 'card';
      document.body.dataset.panelStyle = next;
      console.log(`[map] panel style -> ${next}`);
    }
  });

  function toggleLayer(layer: DebugLayer) {
    if (debugLayers.has(layer)) debugLayers.delete(layer);
    else debugLayers.add(layer);
    debugCanvas = null;
  }

  // Part B.3 (DECISIONS 027): 'wash', a translucent cream scrim with no
  // border, is the shipped default — see the decision entry for the
  // before/after screenshots and the reasoning.
  document.body.dataset.panelStyle = 'wash';

  rebuild();
  // The panels' vertical position reads their own heights (positionOverlays);
  // those are a font's to decide, so settle them again once the faces are in.
  void document.fonts?.ready.then(() => positionOverlays());

  const controlPanel = devTools ? createMapControlPanel({
    fieldParams,
    particleStyle,
    palette,
    onFieldModeChanged() {
      particles.respawnAll(fieldParams);
    },
  }) : null;

  // --- State machinery: fetchCoreFeeds on the same cadence as src/main.ts,
  // ?state= fixtures via scenarioByName, and the [ / ] cycler. Sources rebuild
  // their rates on every landing — a genuine data change, not a tween (020).
  const REFETCH_MS = 120_000;

  const state: AppState = {
    ...emptyFeeds(),
    now: new Date(),
    scenario: scenarioName,
    pending: true,
  };

  const views: View[] = [masthead, scotlandBand, englandBand, headline, sources, settlement, colophon];

  function render() {
    state.now = new Date();
    for (const view of views) view.update(state);
  }

  function landFarms(farmsNow: FarmNow[] | null | undefined) {
    lastFarmsNow = farmsNow ?? null;
    if (lastFarmsNow === null) {
      // Degraded/offline/waiting carry no farms at all — every marker renders
      // silent and nothing flows, rather than reading as the floor rate a
      // genuinely-tracked-but-silent farm gets (see applyFarmRates's own docs
      // on that distinction).
      for (const source of farmSources) source.rate = 0;
    } else {
      applyFarmRates(farmSources, lastFarmsNow);
    }
    particles.refreshRates();
    // The flow's density follows the reading, eased rather than jumped: the
    // first reading ramps in over a few seconds with every particle born at
    // its farm, so the wind is seen leaving the farms; later readings ease
    // over a second. Instant under reduced motion.
    const density = flowDensity(lastFarmsNow);
    const reduce = prefersReducedMotion();
    if (!flowArrived && density > 0) {
      flowArrived = true;
      particles.setActiveFraction(density, { rampSeconds: reduce ? 0 : 4, fromSources: !reduce });
    } else {
      particles.setActiveFraction(density, { rampSeconds: reduce ? 0 : 1 });
    }

    const { readings, maxCapacityMW } = farmReadings();
    markerLayer.setReadings(readings, maxCapacityMW);
    for (const [farm, marker] of insetMarkers) {
      styleFarmMarker(marker, readings.get(farm) ?? null, maxCapacityMW);
    }
  }

  /**
   * The latest reading per farm, and the largest capacity among them — the
   * scale every marker's size is a share of, main stage and inset alike.
   */
  function farmReadings(): { readings: Map<string, FarmReading>; maxCapacityMW: number } {
    const readings = new Map<string, FarmReading>();
    let maxCapacityMW = 0;
    if (lastFarmsNow) {
      for (const f of lastFarmsNow) {
        readings.set(f.farm, f);
        maxCapacityMW = Math.max(maxCapacityMW, f.capacityMW);
      }
    } else {
      // No reading: every farm still sized by its installed capacity, in the
      // 'unknown' state (farmCapacity.ts).
      for (const [farm, capacityMW] of FARM_CAPACITY_MW) {
        readings.set(farm, { capacityMW, instructedMW: 0, curtailedMW: 0, read: false });
        maxCapacityMW = Math.max(maxCapacityMW, capacityMW);
      }
    }
    return { readings, maxCapacityMW };
  }

  async function refresh() {
    const scenario = scenarioByName(state.scenario);
    if (scenario.build) {
      Object.assign(state, scenario.build(new Date()));
      state.pending = scenario.pending ?? false;
      landFarms(state.curtailment?.now?.farms);
      render();
      return;
    }

    await fetchCoreFeeds().then((feeds) => {
      if (feeds.grid) state.grid = feeds.grid;
      state.gridError = feeds.gridError;
      if (feeds.curtailment) state.curtailment = feeds.curtailment;
      state.curtailmentError = feeds.curtailmentError;
      state.pending = false;
      landFarms(state.curtailment?.now?.farms);
      render();
    });
  }

  function selectScenario(name: string) {
    const next = new URLSearchParams(location.search);
    if (name === 'live') next.delete('state');
    else next.set('state', name);
    next.set('dev', '1');
    history.replaceState(null, '', `${location.pathname}?${next.toString()}`);

    Object.assign(state, emptyFeeds());
    state.scenario = name;
    scenarioName = name;
    state.pending = true;
    toggle?.setActive(name);
    render();
    void refresh();
  }

  render();
  void refresh();

  const TICK_MS = 15_000;
  setInterval(render, TICK_MS);
  setInterval(() => void refresh(), REFETCH_MS);

  // REFETCH_MS alone can leave the honest "this settlement period has closed"
  // notice (010/016/017, shown here via masthead.ts's clock) showing for up
  // to REFETCH_MS after a rollover, purely because the flat interval isn't
  // aligned to where the boundary actually is (DECISIONS 031, found live on
  // windfall.scot). This schedules an extra check right there, alongside the
  // interval above rather than instead of it — the interval still catches
  // acceptances landing mid-period.
  (function scheduleRolloverRefresh() {
    setTimeout(() => {
      void refresh();
      scheduleRolloverRefresh();
    }, msUntilRolloverCheck());
  })();

  if (import.meta.env.DEV) {
    addEventListener('keydown', (event) => {
      if (event.key !== ']' && event.key !== '[') return;
      const index = SCENARIOS.findIndex((s) => s.name === state.scenario);
      const step = event.key === ']' ? 1 : -1;
      const next = SCENARIOS[(index + step + SCENARIOS.length) % SCENARIOS.length];
      selectScenario(next.name);
    });
  }

  const MIN_FADE_STEP = 0.14;
  let fadeKeep = 1;

  // Chunking the fade (above) lowers the stuck floor to an alpha of ~3/255
  // but can't reach zero: a multiplicative fade never does in 8 bits. Every
  // half second the canvas is redrawn through an SVG alpha transfer that
  // subtracts a sliver (a' = 1.02a − 0.02), which clears that floor while
  // leaving live trails all but untouched. Where ctx.filter is unsupported the
  // pass is skipped and the faint floor stays.
  const CLEAN_INTERVAL = 0.5;
  let sinceClean = 0;
  const cleanCanvas = document.createElement('canvas');
  const cleanCtx = cleanCanvas.getContext('2d')!;
  const canFilter = 'filter' in ctx;
  if (canFilter) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const holder = document.createElementNS(svgNS, 'svg');
    holder.setAttribute('width', '0');
    holder.setAttribute('height', '0');
    holder.setAttribute('aria-hidden', 'true');
    holder.style.position = 'absolute';
    holder.innerHTML =
      '<filter id="map-trail-clean"><feComponentTransfer><feFuncA type="linear" slope="1.02" intercept="-0.02"/></feComponentTransfer></filter>';
    document.body.append(holder);
  }
  function cleanTrails() {
    if (cleanCanvas.width !== canvas.width || cleanCanvas.height !== canvas.height) {
      cleanCanvas.width = canvas.width;
      cleanCanvas.height = canvas.height;
    }
    cleanCtx.clearRect(0, 0, cleanCanvas.width, cleanCanvas.height);
    cleanCtx.drawImage(canvas, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.filter = 'url(#map-trail-clean)';
    ctx.drawImage(cleanCanvas, 0, 0);
    ctx.filter = 'none';
  }
  let lastTime = performance.now();
  function frame(now: number) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    // Canvas-over-SVG (§7.2, DECISIONS 022): the flow canvas stays transparent
    // so the crisp SVG island shows through underneath it; trails fade toward
    // *transparent* (destination-out) rather than toward a flat background
    // colour.
    //
    // washAlpha is a per-frame fade at 60fps; `fadeKeep` carries it across
    // frames dt-aware, so trails are the same length on a 120Hz screen. The
    // fade is applied in steps of at least MIN_FADE_STEP rather than every
    // frame: canvas alpha is 8-bit, and a small destination-out fade rounds
    // back up once a pixel's alpha drops below ~0.5/fade — a light wash
    // every frame leaves a permanent haze of stuck, faint pixels.
    fadeKeep *= Math.pow(1 - palette.washAlpha, dt * 60);
    if (1 - fadeKeep >= MIN_FADE_STEP) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0, 0, 0, ${1 - fadeKeep})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
      fadeKeep = 1;
    }
    sinceClean += dt;
    if (canFilter && sinceClean >= CLEAN_INTERVAL) {
      cleanTrails();
      sinceClean = 0;
    }

    particles.step(dt, fieldParams);
    particles.render(ctx, palette);

    if (debugVisible) {
      if (!debugCanvas) {
        debugCanvas = renderDebugOverlay(world, debugLayers, [ISLAND_RING, ...islandsForFit().map((i) => i.ring)]);
      }
      ctx.drawImage(debugCanvas, 0, 0);
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Exposed for the mechanical alignment check (step 1's gate) and the step 2/3
  // gate's farm-coverage checks — not part of the runtime UI. Mirrors
  // /flow's own window.__flow convention.
  (window as unknown as { __map: unknown }).__map = {
    getWorld: () => world,
    isInsideMask: (latLon: [number, number]) => {
      const [x, y] = world.projection.project(latLon);
      return world.mask.isInside(x, y);
    },
    isDebugVisible: () => debugVisible,
    getFarmSources: () => farmSources,
    getLastFarmsNow: () => lastFarmsNow,
    getExtentMode: () => extentMode,
    getOffMainStageFarms: () => offMainStageFarms,
    getParticles: () => particles,
    fieldParams,
  };
}
