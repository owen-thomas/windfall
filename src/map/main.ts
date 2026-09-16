/**
 * Boot for /map — Windfall_Map_Spec.md step 2: real farms, real output.
 * Step 1 proved the geometry (one Projection, one mask, no drift between
 * the SVG coast and the canvas containment — DECISIONS 022). This step
 * replaces the seven fictional /flow sources with the 76 real Scottish wind
 * farms (src/map/farmSources.ts, built from farms.json + the live
 * `farms` payload), and wires the state machinery — live fetch, `?state=`
 * fixtures, the `[`/`]` cycler — so those sources have real rates to show.
 *
 * The information layer (Scotland, England, headline, border-caption
 * panels) stays placeholder copy in this step (step 3 writes it live) —
 * every panel carries a visible "Placeholder" tag (map.css) so a gate
 * screenshot is never mistaken for a live claim that contradicts the real,
 * live flow underneath it.
 */

import '../styles/tokens.css';
import '../styles/tokens-light.css';
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
import type { FarmNow } from '../lib/types';

const ISLAND_RING = (gbCountries as unknown as { island: { ring: [number, number][] } }).island
  .ring;
const BORDER_LINE = (gbCountries as unknown as { border: { line: [number, number][] } }).border
  .line;

/**
 * Two positions tried for each projection-placed panel, per the step 1 gate
 * (Part A.2/A.3) — kept as named candidates rather than deleted after
 * picking one, so the alternative is one constant swap away for the next
 * review rather than something to reconstruct from a screenshot.
 */
const ENGLAND_LABEL_CANDIDATES = {
  /** Irish Sea, between Anglesey and the Isle of Man. */
  irishSea: [53.5, -4.6] as [number, number],
  /** Celtic Sea, south-west of Cornwall. */
  celticSea: [49.7, -6.6] as [number, number],
};
const BORDER_CAPTION_CANDIDATES = {
  /** North Sea, east of the border. */
  northSea: [56.0, -0.3] as [number, number],
  /** Solway/Irish Sea, west of the border. */
  solway: [54.3, -4.27] as [number, number],
};
/** DECISIONS 023 records which candidate was kept and why. */
let englandLabelCandidate: keyof typeof ENGLAND_LABEL_CANDIDATES = 'irishSea';
let borderCaptionCandidate: keyof typeof BORDER_CAPTION_CANDIDATES = 'northSea';

const stage = document.querySelector<HTMLDivElement>('#map-stage')!;
const composition = document.querySelector<HTMLDivElement>('#composition')!;
const svg = document.querySelector<SVGSVGElement>('#map-svg')!;
const canvas = document.querySelector<HTMLCanvasElement>('#map-canvas')!;
const ctx = canvas.getContext('2d')!;
const englandPanel = document.querySelector<HTMLDivElement>('#england-panel')!;
const borderCaption = document.querySelector<HTMLDivElement>('#border-caption')!;

const SVG_NS = 'http://www.w3.org/2000/svg';
const islandPath = document.createElementNS(SVG_NS, 'path');
islandPath.setAttribute('class', 'map__island');
const borderPath = document.createElementNS(SVG_NS, 'path');
borderPath.setAttribute('class', 'map__border-line');
// Part A.2: the caption is moved off the land into open water, connected
// back to the line it describes by a short leader — the panel is wide
// enough that no offshore point is fully clear of it at this box size (see
// DECISIONS 023), so the leader is what keeps the connection legible
// rather than trying to find a point with more clearance than the box is
// wide.
const borderLeader = document.createElementNS(SVG_NS, 'line');
borderLeader.setAttribute('class', 'map__border-caption-leader');
svg.append(islandPath, borderPath, borderLeader);

// The field stays on /flow's own tuned defaults throughout step 2 — the
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

function drawGeometry() {
  islandPath.setAttribute('d', ringToPath(ISLAND_RING, world.projection.project));
  borderPath.setAttribute('d', lineToPath(BORDER_LINE, world.projection.project));
  markerLayer.reposition(world.projection.project);
}

/**
 * England's overlay and the border caption sit in the map's own
 * coordinate space (the same Projection that draws the coast), not a
 * hand-placed CSS position — so they track the map area's actual fit
 * rather than an assumed one. Positioned against `.composition` rather
 * than `.map__stage` itself (see map.css's docs on why) via
 * getBoundingClientRect, in css px (world.projection deals in device px).
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
  borderCaption.style.left = `${offsetX + bx / currentDpr}px`;
  borderCaption.style.top = `${offsetY + by / currentDpr}px`;
  borderCaption.style.visibility = 'visible';

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
  world = buildWorld(ISLAND_RING, farmSources, width, height, {
    corridorWidthPx: fieldParams.steerThreshold * 2,
  });
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
    // Gate-review convenience (Part A.3): cycle the England panel between
    // its two tried positions without a rebuild — see the candidates above.
    englandLabelCandidate = englandLabelCandidate === 'irishSea' ? 'celticSea' : 'irishSea';
    console.log(`[map] England label -> ${englandLabelCandidate}`);
    positionOverlays();
  } else if (e.key === 'b') {
    // Same, for the border caption (Part A.2).
    borderCaptionCandidate = borderCaptionCandidate === 'northSea' ? 'solway' : 'northSea';
    console.log(`[map] Border caption -> ${borderCaptionCandidate}`);
    positionOverlays();
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

// --- State machinery (Part E.3): fetchCoreFeeds on the same cadence as
// src/main.ts, ?state= fixtures via scenarioByName, and the [ / ] cycler.
// Sources rebuild their rates on every landing — a genuine data change, not
// a tween (020): the emission rate itself may ease over up to --dur-slow
// (CSS handles that on the canvas wash/particle render, nothing here
// tweens a number). The information-layer panels are not touched by any
// of this in step 2 — they stay placeholder copy, per the plan.
const REFETCH_MS = 120_000;

const params = new URLSearchParams(location.search);
let scenarioName = scenarioByName(params.get('state')).name;

function landFarms(farmsNow: FarmNow[] | null | undefined) {
  lastFarmsNow = farmsNow ?? null;
  applyFarmRates(farmSources, lastFarmsNow, rateParams);
  particles.refreshRates();

  const statesByFarm = new Map<string, FarmMarkerState>();
  for (const site of FARM_SITES) {
    const now = lastFarmsNow?.find((f) => f.farm === site.farm);
    statesByFarm.set(site.farm, markerStateFor(now));
  }
  markerLayer.setStates(statesByFarm);
}

async function refresh() {
  const scenario = scenarioByName(scenarioName);
  if (scenario.build) {
    const feeds = scenario.build(new Date());
    landFarms(feeds.curtailment?.now?.farms);
    return;
  }
  const feeds = await fetchCoreFeeds();
  landFarms(feeds.curtailment?.now?.farms);
}

void refresh();
setInterval(() => void refresh(), REFETCH_MS);

if (import.meta.env.DEV) {
  addEventListener('keydown', (event) => {
    if (event.key !== ']' && event.key !== '[') return;
    const index = SCENARIOS.findIndex((s) => s.name === scenarioName);
    const step = event.key === ']' ? 1 : -1;
    const next = SCENARIOS[(index + step + SCENARIOS.length) % SCENARIOS.length];
    scenarioName = next.name;
    const nextParams = new URLSearchParams(location.search);
    if (next.name === 'live') nextParams.delete('state');
    else nextParams.set('state', next.name);
    history.replaceState(null, '', `${location.pathname}?${nextParams.toString()}`);
    console.log(`[map] state -> ${next.name}`);
    void refresh();
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
    if (!debugCanvas) debugCanvas = renderDebugOverlay(world, debugLayers, ISLAND_RING);
    ctx.drawImage(debugCanvas, 0, 0);
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Exposed for the mechanical alignment check (step 1's gate) and the step 2
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
};
