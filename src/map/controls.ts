/**
 * /map's control panel — minimal, unlike /flow's (controls.ts there): step
 * 2 only needs the rate function's floor and cap exposed live
 * (Windfall_Map_Spec.md §5.1/Part E.2), not the whole field-weight/preset
 * surface, which stays field-tuning territory for step 6. Hidden by
 * default, toggled with 'h' — same convention as /flow's panel.
 */
import { DEFAULT_RATE_PARAMS, type RateParams } from './rate';

export interface MapControlContext {
  rateParams: RateParams;
  /** Called after a slider changes rateParams, so the caller can re-apply rates to the live sources and refresh the particle system's rate table without a full rebuild. */
  onRateParamsChanged(): void;
}

const PANEL_STYLES = `
.map-flow-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 280px;
  max-width: 90vw;
  background: rgba(10, 10, 14, 0.88);
  color: #e8e8ec;
  font: 12px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  padding: 12px 14px 16px;
  box-sizing: border-box;
  z-index: 1000;
  backdrop-filter: blur(6px);
}
.map-flow-panel h2 { font-size: 13px; margin: 0 0 6px; opacity: 0.85; border-bottom: 1px solid rgba(255,255,255,0.15); padding-bottom: 3px; }
.map-flow-panel-row { display: flex; align-items: center; gap: 6px; margin: 4px 0; }
.map-flow-panel-row label { flex: 0 0 130px; min-width: 0; opacity: 0.85; }
.map-flow-panel-control { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; }
.map-flow-panel-control input[type="range"] { flex: 1; min-width: 0; }
.map-flow-panel-value { flex: 0 0 40px; text-align: right; opacity: 0.7; font-variant-numeric: tabular-nums; }
`;

let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected) return;
  document.head.append(Object.assign(document.createElement('style'), { textContent: PANEL_STYLES }));
  stylesInjected = true;
}

export interface MapControlPanel {
  toggle(): void;
}

export function createMapControlPanel(ctx: MapControlContext): MapControlPanel {
  ensureStyles();
  const root = document.createElement('div');
  root.className = 'map-flow-panel';
  root.style.display = 'none';

  root.append(Object.assign(document.createElement('h2'), { textContent: 'Farm rates (h to hide)' }));

  function addSlider(
    label: string,
    spec: { min: number; max: number; step: number },
    get: () => number,
    set: (n: number) => void,
  ) {
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    const readout = document.createElement('span');
    readout.className = 'map-flow-panel-value';
    const sync = () => {
      const v = get();
      input.value = String(v);
      readout.textContent = String(v);
    };
    sync();
    input.addEventListener('input', () => {
      set(Number(input.value));
      sync();
      ctx.onRateParamsChanged();
    });
    const control = document.createElement('div');
    control.className = 'map-flow-panel-control';
    control.append(input, readout);
    const row = document.createElement('div');
    row.className = 'map-flow-panel-row';
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    row.append(labelEl, control);
    root.append(row);
  }

  addSlider(
    'Rate floor',
    { min: 0, max: 10, step: 0.5 },
    () => ctx.rateParams.floor,
    (n) => {
      ctx.rateParams.floor = n;
    },
  );
  addSlider(
    'Rate cap',
    { min: DEFAULT_RATE_PARAMS.floor, max: 60, step: 1 },
    () => ctx.rateParams.cap,
    (n) => {
      ctx.rateParams.cap = n;
    },
  );

  document.body.append(root);

  return {
    toggle() {
      root.style.display = root.style.display === 'none' ? 'block' : 'none';
    },
  };
}
