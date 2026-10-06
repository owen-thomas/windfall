import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const PORT = 5197;
const BASE = `http://localhost:${PORT}`;

function waitForServer(url: string, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise<void>((resolve, reject) => {
    const tryOnce = () => {
      fetch(url).then(() => resolve()).catch(() => {
        if (Date.now() > deadline) reject(new Error('timeout'));
        else setTimeout(tryOnce, 300);
      });
    };
    tryOnce();
  });
}

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: process.cwd(), stdio: 'pipe' });

try {
  await waitForServer(BASE);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/map/?state=curtailing&dev=1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(20000);

  const result = await page.evaluate(() => {
    const svg = document.querySelector<SVGSVGElement>('.map__svg');
    const canvas = document.querySelector<HTMLCanvasElement>('.map__canvas');
    if (!svg || !canvas) throw new Error('The map has no .map__svg or .map__canvas');
    const clone = svg.cloneNode(true) as SVGSVGElement;

    // The clone carries only class names, not the stylesheet that gives
    // those classes meaning — bake every relevant computed style in as
    // presentation attributes so the file is self-contained outside the
    // page (no external CSS, no var() resolution).
    const originals = svg.querySelectorAll('.map__island, .map__border-line, .map__farm-marker');
    const clones = clone.querySelectorAll('.map__island, .map__border-line, .map__farm-marker');
    originals.forEach((orig, i) => {
      const cs = getComputedStyle(orig);
      const el = clones[i];
      el.setAttribute('fill', cs.fill);
      el.setAttribute('stroke', cs.stroke);
      el.setAttribute('stroke-width', cs.strokeWidth);
      if (cs.strokeDasharray && cs.strokeDasharray !== 'none') el.setAttribute('stroke-dasharray', cs.strokeDasharray);
      if (cs.strokeLinecap) el.setAttribute('stroke-linecap', cs.strokeLinecap);
      if (cs.opacity) el.setAttribute('opacity', cs.opacity);
    });

    // Remove the invisible interaction-only hit path — no visual/design value.
    clone.querySelectorAll('.map__border-hit').forEach((n) => n.remove());

    // The hatch pattern (held-down farm markers) references CSS custom
    // properties (var(--curtailed), var(--curtailed-edge)) that only
    // resolve inside the page's own :root — bake them to actual colours.
    const rootStyle = getComputedStyle(document.documentElement);
    const curtailed = rootStyle.getPropertyValue('--curtailed').trim();
    const curtailedEdge = rootStyle.getPropertyValue('--curtailed-edge').trim();
    const pattern = clone.querySelector('#map-farm-hatch');
    if (pattern) {
      const bg = pattern.querySelector('rect');
      const stripe = pattern.querySelector('line');
      if (bg) bg.setAttribute('fill', curtailed);
      if (stripe) stripe.setAttribute('stroke', curtailedEdge);
    }

    const viewBox = svg.getAttribute('viewBox');
    return {
      svgInner: clone.innerHTML,
      viewBox,
      width: canvas.width,
      height: canvas.height,
      png: canvas.toDataURL('image/png'),
    };
  });

  await browser.close();

  if (!result.viewBox) throw new Error('The map SVG has no viewBox');
  const [, , w, h] = result.viewBox.split(' ');
  const svgDoc = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#e9e5dc"/>
  ${result.svgInner}
  <image href="${result.png}" x="0" y="0" width="${result.width}" height="${result.height}"/>
</svg>`;

  writeFileSync('capture/case-study/map/map-with-wind.svg', svgDoc);
  console.log('Wrote capture/case-study/map/map-with-wind.svg', svgDoc.length, 'bytes, viewBox', w, h, 'canvas', result.width, result.height, 'png len', result.png.length);
} finally {
  server.kill();
}
