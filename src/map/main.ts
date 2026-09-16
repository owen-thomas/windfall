/**
 * Boot for /map — Windfall_Map_Spec.md step 1: geometry and composition
 * skeleton. Nothing live yet: the seven fictional /flow sources still
 * drive the flow, and the information layer is placeholder copy at real
 * lengths. What this step proves is the geometry — one Projection,
 * fitted once to the map area and refitted on resize, producing the SVG
 * island, the SVG border and the canvas mask together, so there is
 * nothing left to drift between them (see DECISIONS 022).
 */

import '../styles/tokens.css';
import '../styles/tokens-light.css';
import './map.css';

import { DEFAULT_FIELD_PARAMS, type FieldParams } from '../flow/field';
import { DEFAULT_PARTICLE_STYLE, ParticleSystem } from '../flow/particles';
import { renderDebugOverlay, type DebugLayer } from '../flow/debug';
import { LIGHT_PALETTE } from '../flow/palette';
import { buildWorld, type World } from '../flow/world';
import gbCountries from './data/gb-countries.json';

const ISLAND_RING = (gbCountries as unknown as { island: { ring: [number, number][] } }).island
  .ring;
const BORDER_LINE = (gbCountries as unknown as { border: { line: [number, number][] } }).border
  .line;

/**
 * Irish Sea, west of the Lancashire/Wirral coast — open question 7.7.
 * Provisional: judged against the real island at the step 1 gate, moved
 * east over the Midlands if it reads as "Wales" instead.
 */
const ENGLAND_LABEL_LATLON: [number, number] = [53.3, -4.15];

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
svg.append(islandPath, borderPath);

// Step 1 keeps /flow's own field defaults and light palette entirely
// unchanged (Windfall_Map_Spec.md §5.3: "This retune waits for step 6") —
// only the ring changes, per buildWorld's new parameter.
const fieldParams: FieldParams = { ...DEFAULT_FIELD_PARAMS };
const palette = { ...LIGHT_PALETTE };
const particleCount = 1400;

let world: World;
let particles: ParticleSystem;
let currentDpr = 1;
let debugCanvas: HTMLCanvasElement | null = null;
let debugLayers = new Set<DebugLayer>(['mask']);
let debugVisible = false;

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

  const [ex, ey] = world.projection.project(ENGLAND_LABEL_LATLON);
  englandPanel.style.left = `${offsetX + ex / currentDpr}px`;
  englandPanel.style.top = `${offsetY + ey / currentDpr}px`;
  englandPanel.style.visibility = 'visible';

  const mid = BORDER_LINE[Math.floor(BORDER_LINE.length / 2)];
  const [bx, by] = world.projection.project(mid);
  borderCaption.style.left = `${offsetX + bx / currentDpr}px`;
  borderCaption.style.top = `${offsetY + by / currentDpr}px`;
  borderCaption.style.visibility = 'visible';
}

function paintTransparent() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function rebuild() {
  const { width, height } = sizeStage();
  world = buildWorld(ISLAND_RING, width, height);
  if (particles) {
    particles.setWorld(world);
  } else {
    particles = new ParticleSystem(world, particleCount, { style: { ...DEFAULT_PARTICLE_STYLE } });
  }
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
  }
});

function toggleLayer(layer: DebugLayer) {
  if (debugLayers.has(layer)) debugLayers.delete(layer);
  else debugLayers.add(layer);
  debugCanvas = null;
}

rebuild();

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

// Exposed for the mechanical alignment check (step 1's gate) — not part of
// the runtime UI. Mirrors /flow's own window.__flow convention.
(window as unknown as { __map: unknown }).__map = {
  getWorld: () => world,
  isInsideMask: (latLon: [number, number]) => {
    const [x, y] = world.projection.project(latLon);
    return world.mask.isInside(x, y);
  },
  isDebugVisible: () => debugVisible,
};
