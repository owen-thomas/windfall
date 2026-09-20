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
  landingCaption,
  markerStateFor,
  type FarmMarkerState,
} from './farmSources';
import { createFarmMarkerLayer, styleFarmMarker, type FarmMarkerLayer } from './markers';
import { DEFAULT_RATE_PARAMS, type RateParams } from './rate';
import { createMapControlPanel } from './controls';
import { renderSwatchPlate } from './swatchPlate';
import { fetchCoreFeeds } from '../lib/client';
import { scenarioByName, SCENARIOS } from '../lib/scenarios';
import { emptyFeeds, type AppState } from '../lib/state';
import type { FarmNow } from '../lib/types';

import { el, setText, type View } from '../view/dom';
import { SCOTLAND, ENGLAND } from '../view/band';
import { borderView, constraintSentenceOf } from '../view/border';
import { colophonView } from '../view/colophon';
import { toggleView } from '../view/toggle';
import { mapMastheadView } from './views/masthead';
import { mapHeadlineView, settledLine } from './views/headline';
import { mapBandView } from './views/band';
import { buildProjection } from '../flow/projection';

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
  const BORDER_LINE = (gbCountries as unknown as { border: { line: [number, number][] } }).border
    .line;
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

  /**
   * Where the border's small label + tooltip sit (Part A.5): the border
   * line's own midpoint, not an offshore point. Step 3b's
   * BORDER_CAPTION_CANDIDATES deliberately sat offshore, connected to the
   * line by a leader, because a large permanently-visible caption *card*
   * needed clearance from the coast. That card — and its leader — are gone
   * (026): what replaces it is a small pill sitting directly on the line and
   * a hit area that *is* the line (just wider), so the discoverable label
   * and the actual hover/tap target have to be the same place, or hovering
   * the label wouldn't trigger the tooltip beneath it.
   */
  function borderMidpoint(): [number, number] {
    return BORDER_LINE[Math.floor(BORDER_LINE.length / 2)];
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
  // since which islands are in play depends on extentMode; the border line and
  // its hit area are stable elements reused across rebuilds.
  let islandPaths: SVGPathElement[] = [];
  const borderPath = document.createElementNS(SVG_NS, 'path');
  borderPath.setAttribute('class', 'map__border-line');
  borderPath.setAttribute('aria-hidden', 'true');

  /**
   * Part A.5: the hit area is a separate, wider, transparent path sharing the
   * border's own "d" — a hover/click/focus target the visible line alone
   * would be too thin to reliably carry. Focusable so the affordance works
   * from the keyboard, not just the mouse or touch.
   */
  const borderHit = document.createElementNS(SVG_NS, 'path');
  borderHit.setAttribute('class', 'map__border-hit');
  borderHit.setAttribute('tabindex', '0');
  borderHit.setAttribute('role', 'button');
  borderHit.setAttribute('aria-label', 'The constraint — Scotland and England’s transmission link');
  svg.append(borderPath, borderHit);

  // The inset (step 3b's default path — DECISIONS 025): a small, separately-
  // projected SVG box for Shetland, shown only in 'inset' extent mode.
  const insetSvg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  insetSvg.setAttribute('class', 'map__inset');
  insetSvg.setAttribute('aria-hidden', 'true');
  const insetIslandPaths: SVGPathElement[] = [];
  const insetMarkers = new Map<string, SVGCircleElement>();
  const insetCaptions = el('div', { class: 'map__inset-captions' });
  const insetBox = el(
    'div',
    { class: 'map__inset-box' },
    insetSvg,
    el('p', { class: 'map__inset-label', text: 'Shetland' }),
    insetCaptions,
  );

  const stage = el('div', { class: 'map__stage', id: 'map-stage' }, svg, canvas);

  // --- Views (Part A/C) ------------------------------------------------------
  const masthead = mapMastheadView();
  const scotlandBand = mapBandView(SCOTLAND);
  const englandBand = mapBandView(ENGLAND);
  const headline = mapHeadlineView();
  const border = borderView();
  const colophon = colophonView();

  // The two mix panels are grid items of the map cell (map.css): their columns
  // come from the grid tokens, their vertical position from positionOverlays()
  // below. Hidden until that has run, so neither ever flashes at row 0.
  // The Shetland inset (built above, drawn by drawInset) is the last thing in the
  // Scotland panel, not a corner of the map — see map.css's inset section.
  const scotlandPanel = el(
    'section',
    { class: 'map__overlay panel panel--scotland' },
    scotlandBand.el,
    insetBox
  );
  const englandPanel = el('section', { class: 'map__overlay panel panel--england' }, englandBand.el);

  /**
   * Part A.5: the always-on discoverable label plus the on-demand tooltip,
   * positioned together at BORDER_LABEL_POINT. The label is decorative
   * (aria-hidden) — the accessible name for the affordance lives on
   * `borderHit` itself, and the sentence is always available to assistive
   * tech via the method note regardless of whether the tooltip is ever
   * opened.
   */
  const borderLabel = el('p', { class: 'map__border-label', 'aria-hidden': 'true', text: 'The constraint' });
  const borderOverlay = el('div', { class: 'map__overlay map__border-overlay' }, borderLabel, border.el);

  // Part A.8: stagger, headline 0/breakdown 1 (set inside views/headline.ts
  // itself, two steps within one view's root), Scotland 2, border 3, England 4.
  [scotlandPanel, borderOverlay, englandPanel].forEach((node, i) => {
    node.style.setProperty('--i', String(i + 2));
  });

  // The map cell: the stage plus the three geography-anchored overlays. It is
  // the containing block positionOverlays() measures against.
  const composition = el(
    'div',
    { class: 'composition', id: 'composition' },
    stage,
    englandPanel,
    scotlandPanel,
    borderOverlay
  );

  // --- Step 4b: three pieces of the old chrome move into the text column. ------
  // Each is a re-parent, not a rewrite: the view that renders it keeps
  // building and updating it exactly as before, so its freshness, notice and
  // state rules travel with it.
  //
  // 1. The settlement-period / "Read N ago" row. The Figma frames put it
  //    between the headline sentence and the bar; the masthead view still
  //    owns it (and its stale/failed notice, which comes along in the same
  //    element), it just isn't rendered in the masthead any more.
  const clockEl = masthead.el.querySelector('.map-masthead__clock')!;
  headline.el.querySelector('.map-headline__meta')!.append(clockEl);

  // 2. The "How this number is worked out" toggle — colophonView's own
  //    <details>, now the last row of the text block. The footer keeps the
  //    source-health rows and the byline.
  const methodEl = colophon.el.querySelector<HTMLElement>('.method')!;
  const textBlock = el('div', { class: 'map-text' }, headline.el, methodEl);

  // 3. The byline reads as the Figma frames have it. The "figures are lower
  //    bounds" clause is dropped from the screen — the headline's "At least"
  //    and the method note already say it — not from colophon.ts, which `/`
  //    still uses unchanged.
  setText(colophon.el.querySelector('.colophon__byline')!, 'Built by Owen Thomas');

  // The footer sits in the same grid row as the map and overlays its bottom-
  // left corner, as the Figma frames do; the dev state toggle rides in it so
  // scaffolding never adds a row to the layout.
  const foot = el('div', { class: 'map-foot' }, colophon.el);

  app.classList.add('grid', 'map-page');
  app.replaceChildren(masthead.el, textBlock, composition, foot);

  // Part A.6: the method note gains the settled MWh line, the constraint
  // sentence and the farms-with-no-declaration count — appended to
  // colophonView's own <details> rather than edited into colophon.ts, since
  // that module is reused unchanged on `/` too and these lines are map-only.
  // The capacity figure and per-farm coverage line are already in colophon's
  // own `coverage` paragraph (colophon.ts), so nothing is added for those.
  const methodSettled = el('p', { class: 'method__map-settled' });
  const methodConstraint = el('p', { class: 'method__map-constraint' });
  const methodFlowScope = el('p', { class: 'method__map-scope' });
  const methodBlindFarms = el('p', { class: 'method__map-blind' });
  methodEl.append(methodSettled, methodConstraint, methodFlowScope, methodBlindFarms);

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

    const INSET_WIDTH = 150;
    const INSET_HEIGHT = 110;
    insetSvg.setAttribute('viewBox', `0 0 ${INSET_WIDTH} ${INSET_HEIGHT}`);

    const allPoints = shetlandIslands.flatMap((i) => i.ring);
    const insetProjection = buildProjection(allPoints, INSET_WIDTH, INSET_HEIGHT, { padding: 0.12 });

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
    insetCaptions.replaceChildren();

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

      insetCaptions.append(el('p', { class: 'map__inset-caption', text: landingCaption(site) }));
    }
  }

  function drawGeometry() {
    drawIslands(world.projection.project);
    const borderD = lineToPath(BORDER_LINE, world.projection.project);
    borderPath.setAttribute('d', borderD);
    borderHit.setAttribute('d', borderD);
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
   * The mix panels and the border's label+tooltip sit in the map's own
   * coordinate space (the same Projection that draws the coast), not a
   * hand-placed CSS position — so they track the map cell's actual fit rather
   * than an assumed one.
   *
   * The border label is placed by the projection alone, both axes, as it has
   * been since step 4. The two mix panels split the job with the grid
   * (spec 4b §4): *which columns* they occupy is CSS — Scotland the last N of
   * the map cell's, England the first N, N being the tier's `--mix-span` — and
   * only the *vertical* position is the projection's, the panel's top edge
   * sitting at the latitude in `--anchor-scotland-lat` / `--anchor-england-lat`.
   * That is what the Figma frames do: the panels are flush to the columns but
   * level with the country they describe, at every fit.
   *
   * Measured against `.composition` rather than `.map__stage` itself via
   * getBoundingClientRect, in css px (world.projection deals in device px).
   */
  function positionOverlays() {
    const stageRect = stage.getBoundingClientRect();
    const compRect = composition.getBoundingClientRect();
    const offsetX = stageRect.left - compRect.left;
    const offsetY = stageRect.top - compRect.top;

    /** Top edge of a panel at a latitude, kept inside the cell so a low anchor on a short map never clips it. */
    function panelTop(panel: HTMLElement, lat: number): number {
      const [, y] = world.projection.project([lat, 0]);
      const wanted = offsetY + y / currentDpr;
      return Math.max(0, Math.min(wanted, compRect.height - panel.offsetHeight));
    }

    for (const [panel, token, fallback] of [
      [scotlandPanel, '--anchor-scotland-lat', 57.2],
      [englandPanel, '--anchor-england-lat', 54.4],
    ] as const) {
      panel.style.setProperty('--anchor-y', `${panelTop(panel, tokenNumber(token, fallback))}px`);
      panel.style.visibility = 'visible';
    }

    const [bx, by] = world.projection.project(borderMidpoint());
    borderOverlay.style.left = `${offsetX + bx / currentDpr}px`;
    borderOverlay.style.top = `${offsetY + by / currentDpr}px`;
    borderOverlay.style.visibility = 'visible';
  }

  function paintTransparent() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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

  // --- The border's hover/tap/focus affordance (Part A.5) --------------------
  //
  // Step 4b fixes tap. The old mobile layout forced the tooltip permanently
  // visible, which hid a bug that the new overlaid layout exposes: a tap
  // focuses the hit path (or fires a compat `mouseenter`), which opens the
  // tooltip, and then the tap's own `click` *toggled it shut again* in the same
  // gesture — so on a phone it never showed. Now:
  //   - hover opens/closes for a mouse only (pointer events, not the compat
  //     mouse events a tap also fires);
  //   - a mouse click keeps it open (pins it);
  //   - a tap toggles it — except the tap that just opened it via focus, which
  //     is the same gesture and must not undo itself;
  //   - a tap anywhere else closes it, since a finger has no `mouseleave`.
  let borderTooltipOpen = false;
  let borderOpenedAt = 0;

  /** Keep the open tooltip inside the page margins: it is centred on the border, which on a narrow screen can be within half a tooltip of an edge. */
  function clampBorderTooltip() {
    const tip = borderOverlay.querySelector<HTMLElement>('.map__border-tooltip');
    if (!tip) return;
    tip.style.setProperty('--tip-dx', '0px');
    const rect = tip.getBoundingClientRect();
    const margin = 12;
    let dx = 0;
    if (rect.left < margin) dx = margin - rect.left;
    else if (rect.right > window.innerWidth - margin) dx = window.innerWidth - margin - rect.right;
    tip.style.setProperty('--tip-dx', `${dx}px`);
  }

  function openBorderTooltip() {
    borderTooltipOpen = true;
    borderOpenedAt = performance.now();
    borderOverlay.classList.add('is-open');
    clampBorderTooltip();
  }
  function closeBorderTooltip() {
    borderTooltipOpen = false;
    borderOverlay.classList.remove('is-open');
  }
  borderHit.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse') openBorderTooltip();
  });
  borderHit.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && document.activeElement !== borderHit) closeBorderTooltip();
  });
  borderHit.addEventListener('focus', openBorderTooltip);
  borderHit.addEventListener('blur', closeBorderTooltip);
  borderHit.addEventListener('click', (e) => {
    e.preventDefault();
    if ((e as PointerEvent).pointerType === 'mouse') {
      openBorderTooltip();
    } else if (!borderTooltipOpen) {
      openBorderTooltip();
    } else if (performance.now() - borderOpenedAt > 400) {
      closeBorderTooltip();
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || !borderTooltipOpen) return;
    if (e.target !== borderHit) closeBorderTooltip();
  });

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

  const views: View[] = [masthead, scotlandBand, englandBand, headline, border, colophon];

  function render() {
    state.now = new Date();
    for (const view of views) view.update(state);
    updateMethodMapNotes();
  }

  /** Part A.6: the method note's map-only lines. */
  function updateMethodMapNotes() {
    setText(methodSettled, settledLine(state.curtailment) || 'No settled reading for the last complete half-hour.');

    const constraint = constraintSentenceOf(state);
    setText(methodConstraint, constraint.text);

    setText(
      methodFlowScope,
      'The flow above shows declared output of tracked Scottish farms only — a physical notification, ' +
        'not a metered reading (§4.3).',
    );

    const now = state.curtailment?.now;
    const method = state.curtailment?.method;
    if (now) {
      const blind = now.farms.filter((f) => f.unitsDeclaring === 0).length;
      setText(
        methodBlindFarms,
        blind > 0
          ? `${blind} of ${now.farms.length} tracked farms had no declaration at the sampled instant, and ` +
              'render silent on the map rather than as an assumed zero.'
          : `All ${now.farms.length} tracked farms had a declaration at the sampled instant.`,
      );
    } else {
      setText(
        methodBlindFarms,
        method
          ? 'Per-farm coverage is unknown while the balancing feed is unavailable — every marker renders silent.'
          : '',
      );
    }
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

    const feeds = await fetchCoreFeeds();
    if (feeds.grid) state.grid = feeds.grid;
    state.gridError = feeds.gridError;
    if (feeds.curtailment) state.curtailment = feeds.curtailment;
    state.curtailmentError = feeds.curtailmentError;
    state.pending = false;
    landFarms(state.curtailment?.now?.farms);
    render();
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
