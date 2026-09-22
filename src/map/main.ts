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
import { DEFAULT_PARTICLE_STYLE, ParticleSystem } from '../flow/particles';
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
  markerStateFor,
  type FarmMarkerState,
} from './farmSources';
import { createFarmMarkerLayer, setMarkerHighlight, styleFarmMarker, type FarmMarkerLayer } from './markers';
import { DEFAULT_RATE_PARAMS, type RateParams } from './rate';
import { createMapControlPanel } from './controls';
import { renderSwatchPlate } from './swatchPlate';
import { fetchCoreFeeds, fetchWindspeed } from '../lib/client';
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
  const insetMarkers = new Map<string, SVGCircleElement>();
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
  // The Shetland inset (built above, drawn by drawInset) is the *first* thing in
  // the Scotland panel — above the mix, since 4c (DECISIONS 029) — not a corner
  // of the map; see map.css's inset section.
  const scotlandPanel = el(
    'section',
    { class: 'map__overlay panel panel--scotland' },
    insetBox,
    scotlandBand.el
  );
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
    scotlandPanel
  );

  // --- Step 4b: three pieces of the old chrome move into the text column. ------
  // Each is a re-parent, not a rewrite: the view that renders it keeps
  // building and updating it exactly as before, so its freshness, notice and
  // state rules travel with it.
  //
  // 1. The bar and its list, then the settlement-period row — the frame's own
  //    order (§1): sentence, bar, list, settlement row, explanation. The bar
  //    is open on desktop and shut elsewhere: the list is dense, and on a phone
  //    it sits between the headline and the map. "Desktop" is the two-column
  //    layout, read from grid.css's own `--layout` token so the breakpoint
  //    stays written in one place.
  headline.el.append(sources.el);
  sources.el.open = getComputedStyle(document.documentElement).getPropertyValue('--layout').trim() === 'two-col';

  // The settlement row: the masthead view still owns and keeps fresh the clock
  // element itself (its freshness dot, its stale/failed/ageing notice —
  // 010/016/017 — all travel with it), it just isn't rendered in the masthead
  // any more. Since 4c.4 it is wrapped in its own disclosure (views/
  // settlement.ts) — the boxed row is the summary, and its chevron opens the
  // page's one explanation.
  const clockEl = masthead.el.querySelector('.map-masthead__clock')!;
  const settlement = mapSettlementView(clockEl);
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
      'Built by Owen Thomas',
      el('span', { class: 'byline__sep', 'aria-hidden': 'true', text: '✺' }),
      el('a', { class: 'byline__link', href: 'https://owenthomas.work', text: 'owenthomas.work' }),
    );

  // 4. The coloured source squares go on /map. Health is still stated in words
  //    beside each source ("answering", "not answering", …) — the mark was
  //    only ever a second, redundant cue — so nothing is lost. Removed here,
  //    not in colophon.ts, which `/` uses unchanged.
  colophon.el.querySelectorAll('.source__mark').forEach((mark) => mark.remove());

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

  // The field stays on /flow's own tuned defaults — the drawn-island retune
  // waits for step 6, after the border spike (§5.3).
  const fieldParams: FieldParams = { ...DEFAULT_FIELD_PARAMS };
  const palette = { ...LIGHT_PALETTE };
  const particleCount = 1400;
  const rateParams: RateParams = { ...DEFAULT_RATE_PARAMS };

  // Rebuilt in rebuild() from the current extent's available islands — see
  // `isOffMainFit`'s docs — so the object identities (and hence which farms
  // are landing-only sources) always match what's actually drawn.
  let farmSources: Source[] = [];
  /** Farms currently rendered only in the inset, not on the main stage. */
  let offMainStageFarms = new Set<string>();
  let lastFarmsNow: FarmNow[] | null = null;

  let world: World;
  let particles: ParticleSystem;
  let currentDpr = 1;
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

  function drawInset() {
    if (extentMode !== 'inset') {
      insetBox.style.display = 'none';
      return;
    }
    insetBox.style.display = 'block';
    const shetlandIslands = ALL_ISLANDS.filter((i) => SHETLAND_ARCHIPELAGO.has(i.name));
    if (shetlandIslands.length === 0) return;

    // The drawing area is the 120px square less the strip kept for the name
    // (map.css's --inset-label-band); the svg scales to whatever width it is
    // given, so a phone's narrower square shrinks the island, never the name.
    const INSET_WIDTH = 120;
    const INSET_HEIGHT = 90;
    insetSvg.setAttribute('viewBox', `0 0 ${INSET_WIDTH} ${INSET_HEIGHT}`);

    const allPoints = shetlandIslands.flatMap((i) => i.ring);
    const insetProjection = buildProjection(allPoints, INSET_WIDTH, INSET_HEIGHT, { padding: 0.08 });

    for (const p of insetIslandPaths) p.remove();
    insetIslandPaths.length = 0;
    for (const island of shetlandIslands) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', 'map__island');
      path.setAttribute('d', ringToPath(island.ring, insetProjection.project));
      insetSvg.append(path);
      insetIslandPaths.push(path);
    }

    for (const circle of insetMarkers.values()) circle.remove();
    insetMarkers.clear();

    const shetlandFarms = FARM_SITES.filter((s) => offMainStageFarms.has(s.farm));
    for (const site of shetlandFarms) {
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('class', 'map__farm-marker');
      circle.dataset.farm = site.farm;
      const [x, y] = insetProjection.project(site.latLon);
      circle.setAttribute('cx', x.toFixed(1));
      circle.setAttribute('cy', y.toFixed(1));
      styleFarmMarker(circle, markerStateFor(lastFarmsNow?.find((f) => f.farm === site.farm)));
      insetSvg.append(circle);
      insetMarkers.set(site.farm, circle);
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
   * It is the *mix band's* top edge that sits at the anchor, not the panel's:
   * since 4c the Shetland inset is the first thing in Scotland's panel, above the
   * band, and hangs above the anchor (`lead-in` below) rather than pushing the
   * band down off the latitude the frames put it at. With the inset hidden
   * (true-extent mode) the lead-in is 0 and nothing changes.
   *
   * Measured against `.composition` rather than `.map__stage` itself via
   * getBoundingClientRect, in css px (world.projection deals in device px).
   */
  function positionOverlays() {
    const stageRect = stage.getBoundingClientRect();
    const compRect = composition.getBoundingClientRect();
    const offsetY = stageRect.top - compRect.top;

    /** Top edge of a panel whose band starts `leadIn` px below it, so the band sits at a latitude; kept inside the cell so a low anchor on a short map never clips it. */
    function panelTop(panel: HTMLElement, lat: number, leadIn: number): number {
      const [, y] = world.projection.project([lat, 0]);
      const wanted = offsetY + y / currentDpr - leadIn;
      return Math.max(0, Math.min(wanted, compRect.height - panel.offsetHeight));
    }

    for (const [panel, band, token, fallback] of [
      [scotlandPanel, scotlandBand.el, '--anchor-scotland-lat', 57.2],
      [englandPanel, englandBand.el, '--anchor-england-lat', 54.4],
    ] as const) {
      panel.style.setProperty('--anchor-y', `${panelTop(panel, tokenNumber(token, fallback), band.offsetTop)}px`);
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
   * Pick one farm out on the map, or (null) put everything back. Purely paint:
   * the particles draw its flow in --highlight and the rest dimmed, and its
   * marker (on the main stage or in the Shetland inset, wherever it is drawn)
   * lights while the others fade. No relayout, no rebuild.
   */
  function highlightFarm(farm: string | null) {
    highlightedFarm = farm;
    particles.setHighlightSource(farm, { color: tokenColor('--highlight', '#0a7cff') });
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
    });

    if (particles) {
      particles.setWorld(world);
    } else {
      particles = new ParticleSystem(world, particleCount, { style: { ...DEFAULT_PARTICLE_STYLE } });
    }
    if (!markerLayer) markerLayer = createFarmMarkerLayer(svg, FARM_SITES);
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

  window.addEventListener('keydown', (e) => {
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
      controlPanel.toggle();
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

  const controlPanel = createMapControlPanel({
    rateParams,
    onRateParamsChanged() {
      applyFarmRates(farmSources, lastFarmsNow, rateParams);
      particles.refreshRates();
    },
  });

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
      applyFarmRates(farmSources, lastFarmsNow, rateParams);
    }
    particles.refreshRates();

    const statesByFarm = new Map<string, FarmMarkerState>();
    for (const site of FARM_SITES) {
      const now = lastFarmsNow?.find((f) => f.farm === site.farm);
      statesByFarm.set(site.farm, markerStateFor(now));
    }
    markerLayer.setStates(statesByFarm);

    for (const [farm, circle] of insetMarkers) {
      styleFarmMarker(circle, statesByFarm.get(farm) ?? 'silent');
    }
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

    const core = fetchCoreFeeds().then((feeds) => {
      if (feeds.grid) state.grid = feeds.grid;
      state.gridError = feeds.gridError;
      if (feeds.curtailment) state.curtailment = feeds.curtailment;
      state.curtailmentError = feeds.curtailmentError;
      state.pending = false;
      landFarms(state.curtailment?.now?.farms);
      render();
    });

    // Windspeed resolves independently (4c.5, DECISIONS 029), same reasoning
    // as src/main.ts's own narration fetch: Open-Meteo has nothing to do with
    // curtailment or the mix, so a slow or dead weather API can never hold up
    // — or blank — the feeds this page actually turns on. `pending` is not
    // gated on it; the source list simply lands windspeed into its rows
    // whenever this resolves, on the same refresh cadence as everything else.
    const windspeed = fetchWindspeed().then((feed) => {
      if (feed.windspeed) state.windspeed = feed.windspeed;
      state.windspeedError = feed.windspeedError;
      render();
    });

    await Promise.all([core, windspeed]);
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

  if (import.meta.env.DEV) {
    addEventListener('keydown', (event) => {
      if (event.key !== ']' && event.key !== '[') return;
      const index = SCENARIOS.findIndex((s) => s.name === state.scenario);
      const step = event.key === ']' ? 1 : -1;
      const next = SCENARIOS[(index + step + SCENARIOS.length) % SCENARIOS.length];
      selectScenario(next.name);
    });
  }

  let lastTime = performance.now();
  function frame(now: number) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    // Canvas-over-SVG (§7.2, DECISIONS 022): the flow canvas stays transparent
    // so the crisp SVG island shows through underneath it; trails fade toward
    // *transparent* (destination-out) rather than toward a flat background
    // colour.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0, 0, 0, ${palette.washAlpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';

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
  };
}
