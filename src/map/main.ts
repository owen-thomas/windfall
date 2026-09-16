/**
 * Boot for /map — Windfall_Map_Spec.md step 3: islands, composition fixes,
 * and the information layer for real.
 *
 * Step 1 proved the geometry (DECISIONS 022); step 2 replaced the seven
 * fictional /flow sources with the 76 real farms and wired the state
 * machinery (DECISIONS 023). This step draws the islands the gate 2 review
 * asked for, fixes the England-panel and border-caption composition, and
 * replaces every placeholder panel with the real `src/view` modules —
 * mastheadView, bandView, headlineView, narrationView, colophonView reused
 * verbatim (both their DOM and, via `../styles/app.css` imported below,
 * their CSS — map.css only ever overrides the composition/overlay layer and
 * the compact-card treatment, never redraws the component styles
 * themselves) — plus a new borderView that reuses constraintView's copy.
 * The whole DOM tree is built here rather than in map/index.html, mirroring
 * src/main.ts's own `app.replaceChildren(...)` pattern, because most of
 * what's on screen now comes from shared view modules rather than static
 * markup.
 */

import '../styles/tokens.css';
import '../styles/tokens-light.css';
import '../styles/app.css';
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
  markerStateFor,
  type FarmMarkerState,
} from './farmSources';
import { createFarmMarkerLayer, type FarmMarkerLayer } from './markers';
import { DEFAULT_RATE_PARAMS, type RateParams } from './rate';
import { createMapControlPanel } from './controls';
import { fetchCoreFeeds } from '../lib/client';
import { scenarioByName, SCENARIOS } from '../lib/scenarios';
import { emptyFeeds, type AppState } from '../lib/state';
import type { FarmNow } from '../lib/types';

import { el, setText, type View } from '../view/dom';
import { mastheadView } from '../view/masthead';
import { bandView, ENGLAND, SCOTLAND } from '../view/band';
import { headlineView } from '../view/headline';
import { borderView } from '../view/border';
import { narrationView } from '../view/narration';
import { colophonView } from '../view/colophon';
import { toggleView } from '../view/toggle';
import { buildProjection } from '../flow/projection';

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
 * Part A.2 (the extent decision): true extent draws Shetland where it
 * actually is, at the cost of shrinking the mainland to fit it in — the
 * whole reason to prefer it is that it's the only mode where Viking's
 * corridor is a real, connected, in-position thing rather than a decorative
 * aside. Inset is the documented fallback: Shetland (and its outlying isles,
 * Yell/Unst) drop out of the main stage's own projection fit and instead
 * render in a small, separately-projected box (buildInset below) — a static
 * comparison, not a second live map, since a corridor needs both its ends in
 * one coordinate space and the inset deliberately isn't. Toggle with 't' for
 * the gate screenshot pair; true extent is the shipped default (see
 * DECISIONS 024 for the measured mainland heights that decided it).
 */
type ExtentMode = 'trueExtent' | 'inset';
let extentMode: ExtentMode = 'trueExtent';
const SHETLAND_ARCHIPELAGO = new Set(['Shetland Mainland', 'Yell', 'Unst']);

function islandsForFit(): IslandRing[] {
  return extentMode === 'trueExtent'
    ? ALL_ISLANDS
    : ALL_ISLANDS.filter((i) => !SHETLAND_ARCHIPELAGO.has(i.name));
}

/**
 * Two positions tried for each projection-placed panel, per the step 1 gate
 * (Part A.2/A.3) — kept as named candidates rather than deleted after
 * picking one, so the alternative is one constant swap away for the next
 * review rather than something to reconstruct from a screenshot.
 */
const ENGLAND_LABEL_CANDIDATES = {
  /**
   * Central Irish Sea, well south and west of the Solway border caption —
   * moved further out than step 2's point (DECISIONS 023's [53.5,-4.6] sat
   * only ~6px clear of the coast, and stacked almost directly on top of the
   * Solway border caption once that moved back per Part B.2) so the two
   * cards don't collide even though the England card itself is now narrower
   * (Part B.1).
   */
  irishSea: [51.9, -5.6] as [number, number],
  /** Celtic Sea, south-west of Cornwall. */
  celticSea: [49.7, -6.6] as [number, number],
};
const BORDER_CAPTION_CANDIDATES = {
  /** North Sea, east of the border. */
  northSea: [56.0, -0.3] as [number, number],
  /** Solway/Irish Sea, west of the border. */
  solway: [54.3, -4.27] as [number, number],
};
/** DECISIONS 024 records which candidate was kept and why. Part B.2: the England panel's narrowing frees up room, so the caption moves back to the Solway side. */
let englandLabelCandidate: keyof typeof ENGLAND_LABEL_CANDIDATES = 'irishSea';
let borderCaptionCandidate: keyof typeof BORDER_CAPTION_CANDIDATES = 'solway';

// --- Build the whole page from here (src/main.ts's own pattern), rather
// than from static markup — most of what's on screen is a reused view
// module now, not bespoke HTML. -------------------------------------------

const app = document.querySelector<HTMLDivElement>('#map-app')!;

const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
svg.setAttribute('class', 'map__svg');
svg.setAttribute('aria-hidden', 'true');
const canvas = document.createElement('canvas');
canvas.className = 'map__canvas';
canvas.setAttribute('aria-hidden', 'true');
const ctx = canvas.getContext('2d')!;

const windNote = el('p', { class: 'map__wind-note' });

// Island paths (mainland + every drawn island) are rebuilt per rebuild()
// since which islands are in play depends on extentMode; border and its
// leader are stable elements reused across rebuilds.
let islandPaths: SVGPathElement[] = [];
const borderPath = document.createElementNS(SVG_NS, 'path');
borderPath.setAttribute('class', 'map__border-line');
// Part A.2/B.2: the caption is moved off the land into open water, connected
// back to the line it describes by a short leader — see DECISIONS 023/024
// on why neither offshore candidate has enough clearance for the box on its
// own.
const borderLeader = document.createElementNS(SVG_NS, 'line');
borderLeader.setAttribute('class', 'map__border-caption-leader');
svg.append(borderPath, borderLeader);

// The inset (Part A.2's fallback path): a small, separately-projected SVG
// box for Shetland, shown only in 'inset' mode. Built once; repositioned
// and repopulated in rebuild().
const insetSvg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
insetSvg.setAttribute('class', 'map__inset');
insetSvg.setAttribute('aria-hidden', 'true');
const insetIslandPaths: SVGPathElement[] = [];
const insetMarker = document.createElementNS(SVG_NS, 'circle');
insetMarker.setAttribute('class', 'map__inset-marker');
insetMarker.setAttribute('r', '3');
insetSvg.append(insetMarker);
const insetBox = el('div', { class: 'map__inset-box' }, insetSvg, el('p', { class: 'map__inset-label', text: 'Shetland' }));

const stage = el('div', { class: 'map__stage', id: 'map-stage' }, svg, canvas, insetBox, windNote);

// --- Reused view modules (Part C) -----------------------------------------
const masthead = mastheadView();
const scotlandBand = bandView(SCOTLAND);
const englandBand = bandView(ENGLAND);
const headline = headlineView();
const border = borderView();
const narration = narrationView();
const colophon = colophonView();

const scotlandPanel = el('section', { class: 'panel panel--scotland' }, scotlandBand.el);
const headlinePanel = el('section', { class: 'panel panel--headline' }, headline.el);
const englandPanel = el('div', { class: 'map__overlay panel panel--england' }, englandBand.el);
border.el.classList.add('map__overlay');

// Part C.7: stagger, Scotland 0 / headline 1 / border 2 / England 3 /
// narration 4 — the same --i mechanism screen.ts uses on `/` (app.css's
// crossfade transitions read --i from their nearest ancestor).
[scotlandPanel, headlinePanel, border.el, englandPanel, narration.el].forEach((node, i) => {
  node.style.setProperty('--i', String(i));
});

const composition = el(
  'div',
  { class: 'composition', id: 'composition' },
  stage,
  englandPanel,
  border.el,
  scotlandPanel,
  headlinePanel
);

app.replaceChildren(masthead.el, composition, narration.el, colophon.el);

// Part C.4: "the method note gains two lines" — appended to colophonView's
// own <details> rather than edited into colophon.ts, since that module is
// reused unchanged on `/` too and these two lines are map-only.
const methodEl = colophon.el.querySelector('.method')!;
const methodFlowScope = el('p', { class: 'method__map-scope' });
const methodBlindFarms = el('p', { class: 'method__map-blind' });
methodEl.append(methodFlowScope, methodBlindFarms);

// Part C.6: the state toggle and its colophon-flow position, as on `/`.
const params = new URLSearchParams(location.search);
let scenarioName = scenarioByName(params.get('state')).name;
const showToggle = params.has('dev') || params.has('state') || import.meta.env.DEV;
const toggle = showToggle ? toggleView(scenarioName, selectScenario) : null;
if (toggle) app.append(toggle.el);

// The field stays on /flow's own tuned defaults throughout step 3 — the
// drawn-island retune waits for step 6, after the border spike (§5.3).
const fieldParams: FieldParams = { ...DEFAULT_FIELD_PARAMS };
const palette = { ...LIGHT_PALETTE };
const particleCount = 1400;
const rateParams: RateParams = { ...DEFAULT_RATE_PARAMS };

const farmSources: Source[] = buildFarmSources(FARM_SITES);
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

/**
 * Part A.3: islands drawn white like the mainland, under the flow canvas.
 * One <path> per land shape (mainland ring + every currently-in-play
 * island) so the debug 'coastline' layer and any future per-shape styling
 * has something to target; all share the .map__island class so they read
 * as one continuous white landmass.
 */
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

/** Part A.2's fallback: a small, independently-projected Shetland, static (no live flow — see the type's own docs above). */
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
    insetSvg.insertBefore(path, insetMarker);
    insetIslandPaths.push(path);
  }

  const viking = FARM_SITES.find((s) => s.farm === 'Viking');
  if (viking) {
    const [vx, vy] = insetProjection.project(viking.latLon);
    insetMarker.setAttribute('cx', vx.toFixed(1));
    insetMarker.setAttribute('cy', vy.toFixed(1));
  }
}

function drawGeometry() {
  drawIslands(world.projection.project);
  borderPath.setAttribute('d', lineToPath(BORDER_LINE, world.projection.project));
  markerLayer.reposition(world.projection.project);
  drawInset();
}

/**
 * England's overlay and the border caption sit in the map's own
 * coordinate space (the same Projection that draws the coast), not a
 * hand-placed CSS position — so they track the map area's actual fit
 * rather than an assumed one. Positioned against `.composition` rather
 * than `.map__stage` itself via getBoundingClientRect, in css px
 * (world.projection deals in device px).
 */
function positionOverlays() {
  const stageRect = stage.getBoundingClientRect();
  const compRect = composition.getBoundingClientRect();
  const offsetX = stageRect.left - compRect.left;
  const offsetY = stageRect.top - compRect.top;

  const [ex, ey] = world.projection.project(ENGLAND_LABEL_CANDIDATES[englandLabelCandidate]);
  englandPanel.style.left = `${offsetX + ex / currentDpr}px`;
  englandPanel.style.top = `${offsetY + ey / currentDpr}px`;
  englandPanel.style.visibility = 'visible';

  const [bx, by] = world.projection.project(BORDER_CAPTION_CANDIDATES[borderCaptionCandidate]);
  border.el.style.left = `${offsetX + bx / currentDpr}px`;
  border.el.style.top = `${offsetY + by / currentDpr}px`;
  border.el.style.visibility = 'visible';

  // Leader: from the caption's anchor to the nearest point on the border
  // line itself, so the connection reads even though the caption sits well
  // clear of the border in open water.
  let nearest = BORDER_LINE[0];
  let nearestDistSq = Infinity;
  for (const p of BORDER_LINE) {
    const [px, py] = world.projection.project(p);
    const d = (px - bx) ** 2 + (py - by) ** 2;
    if (d < nearestDistSq) {
      nearestDistSq = d;
      nearest = p;
    }
  }
  const [nx, ny] = world.projection.project(nearest);
  borderLeader.setAttribute('x1', nx.toFixed(1));
  borderLeader.setAttribute('y1', ny.toFixed(1));
  borderLeader.setAttribute('x2', bx.toFixed(1));
  borderLeader.setAttribute('y2', by.toFixed(1));
}

function paintTransparent() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function rebuild() {
  const { width, height } = sizeStage();
  const fitIslands = islandsForFit();
  const projectionRing =
    extentMode === 'trueExtent'
      ? [...ISLAND_RING, ...fitIslands.flatMap((i) => i.ring)]
      : ISLAND_RING;

  world = buildWorld(ISLAND_RING, farmSources, width, height, {
    corridorWidthPx: fieldParams.steerThreshold * 2,
    islands: ALL_ISLANDS,
    projectionRing,
  });

  // Record the mainland's own rendered height under this extent, per
  // DECISIONS 024 — measured directly from the live Projection rather than
  // eyeballed from a screenshot.
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of ISLAND_RING) {
    const [, y] = world.projection.project(p);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  console.log(
    `[map] extent=${extentMode} mainland rendered height: ${((maxY - minY) / currentDpr).toFixed(0)}px (css)`,
  );

  if (particles) {
    particles.setWorld(world);
  } else {
    particles = new ParticleSystem(world, particleCount, { style: { ...DEFAULT_PARTICLE_STYLE } });
  }
  if (!markerLayer) markerLayer = createFarmMarkerLayer(svg, FARM_SITES);
  debugCanvas = null;
  drawGeometry();
  positionOverlays();
  paintTransparent();
}

let resizeTimer: number | undefined;
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(rebuild, 200);
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
  } else if (e.key === 'e') {
    // Gate-review convenience (Part B.1): cycle the England panel between
    // its two tried positions without a rebuild — see the candidates above.
    englandLabelCandidate = englandLabelCandidate === 'irishSea' ? 'celticSea' : 'irishSea';
    console.log(`[map] England label -> ${englandLabelCandidate}`);
    positionOverlays();
  } else if (e.key === 'b') {
    // Same, for the border caption (Part B.2).
    borderCaptionCandidate = borderCaptionCandidate === 'northSea' ? 'solway' : 'northSea';
    console.log(`[map] Border caption -> ${borderCaptionCandidate}`);
    positionOverlays();
  } else if (e.key === 't') {
    // Gate-review convenience (Part A.2): true extent vs. the inset
    // fallback, side by side across two screenshots.
    extentMode = extentMode === 'trueExtent' ? 'inset' : 'trueExtent';
    console.log(`[map] extent -> ${extentMode}`);
    rebuild();
  }
});

function toggleLayer(layer: DebugLayer) {
  if (debugLayers.has(layer)) debugLayers.delete(layer);
  else debugLayers.add(layer);
  debugCanvas = null;
}

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

const views: View[] = [masthead, scotlandBand, englandBand, headline, border, narration, colophon];

function render() {
  state.now = new Date();
  for (const view of views) view.update(state);
  updateWindNote();
  updateMethodMapNotes();
}

/**
 * Part C.5: "Live Scottish wind only" reads from state — a fixture or a
 * stale reading is a claim the note has to carry too, in the same voice
 * 016/010 use elsewhere on the page (say what's true, never assert past
 * what's known).
 */
function updateWindNote() {
  if (state.scenario !== 'live') {
    const scenario = scenarioByName(state.scenario);
    setText(
      windNote,
      `Showing the "${scenario.label}" fixture, not a live reading. ${scenario.note} Live Scottish wind ` +
        'only; England and Wales generation appears in the England mix, never as motion.',
    );
    return;
  }
  const fetchedAt = state.curtailment?.fetchedAt;
  const ageMs = fetchedAt ? Date.now() - Date.parse(fetchedAt) : null;
  if (ageMs !== null && ageMs > 30 * 60 * 1000) {
    setText(
      windNote,
      'This reading has not refreshed for over half an hour — the flow below reflects the last farm ' +
        'output Windfall received, not this instant.',
    );
    return;
  }
  setText(
    windNote,
    'Live Scottish wind only. England and Wales generation appears in the England mix, never as motion.',
  );
}

/** Part C.4: the method note's two map-only lines. */
function updateMethodMapNotes() {
  const method = state.curtailment?.method;
  setText(
    methodFlowScope,
    'The flow above shows declared output of tracked Scottish farms only — a physical notification, ' +
      'not a metered reading (§4.3).',
  );
  const now = state.curtailment?.now;
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
    // Part C.6: degraded/offline/waiting carry no farms at all — every
    // marker renders silent and nothing flows, rather than reading as the
    // floor rate a genuinely-tracked-but-silent farm gets (see
    // applyFarmRates's own docs on that distinction).
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

  // Canvas-over-SVG (§7.2, decided in DECISIONS 022): the flow canvas
  // stays transparent so the crisp SVG island shows through underneath
  // it; trails fade toward *transparent* (destination-out) rather than
  // toward a flat background colour, which is the one change from
  // /flow's wash step — particles.ts's own step()/render() are untouched.
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
};
