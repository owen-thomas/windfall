/**
 * /map's control panel — smaller than /flow's (controls.ts there): the
 * handful of wind knobs that shape how the map's flow reads — speed, trail,
 * line weight, turning, sway and spacing — not the whole field-weight/preset
 * surface. Nothing here touches how much flows or from where: that is the
 * live data's alone (rate.ts). Every slider writes into a live object read each frame, so a
 * change shows immediately. Hidden by default, toggled with 'h' — same
 * convention as /flow's panel.
 */
import type { FieldParams } from '../flow/field';
import type { Palette } from '../flow/palette';
import type { ParticleStyle } from '../flow/particles';

export interface MapControlContext {
  fieldParams: FieldParams;
  particleStyle: ParticleStyle;
  palette: Palette;
  /** Called after the field button changes baseFieldMode: particles' routes mean something different under each mode, so they are respawned. */
  onFieldModeChanged(): void;
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
.map-flow-panel h2 { font-size: 13px; margin: 12px 0 6px; opacity: 0.85; border-bottom: 1px solid rgba(255,255,255,0.15); padding-bottom: 3px; }
.map-flow-panel-row { display: flex; align-items: center; gap: 6px; margin: 4px 0; }
.map-flow-panel-row label { flex: 0 0 130px; min-width: 0; opacity: 0.85; }
.map-flow-panel-control { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; }
.map-flow-panel-control input[type="range"] { flex: 1; min-width: 0; }
.map-flow-panel h2:first-child { margin-top: 0; }
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

  root.append(Object.assign(document.createElement('h2'), { textContent: 'Wind (h to hide)' }));

  function addSlider(
    label: string,
    spec: { min: number; max: number; step: number },
    get: () => number,
    set: (n: number) => void,
    onChange: () => void = () => {},
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
      onChange();
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

  const { fieldParams, particleStyle, palette } = ctx;
  addSlider('Speed', { min: 10, max: 120, step: 5 }, () => particleStyle.speed, (n) => {
    particleStyle.speed = n;
  });
  // The wash is what fades old segments each frame, so a lighter wash is a
  // longer trail. Shown as its own figure, not inverted, to stay honest.
  addSlider('Trail fade', { min: 0.02, max: 0.3, step: 0.01 }, () => palette.washAlpha, (n) => {
    palette.washAlpha = n;
  });
  addSlider('Line weight', { min: 0.5, max: 3, step: 0.1 }, () => palette.baseStrokeWidth, (n) => {
    palette.baseStrokeWidth = n;
  });
  addSlider('Turn rate', { min: 0.01, max: 0.4, step: 0.01 }, () => particleStyle.turnRate, (n) => {
    particleStyle.turnRate = n;
  });
  addSlider('Sway', { min: 0, max: 1, step: 0.05 }, () => fieldParams.noiseWeight, (n) => {
    fieldParams.noiseWeight = n;
  });
  addSlider('Sway size', { min: 0.5, max: 6, step: 0.25 }, () => fieldParams.noiseScale, (n) => {
    fieldParams.noiseScale = n;
  });
  addSlider('Sway change', { min: 0, max: 0.2, step: 0.005 }, () => fieldParams.noiseSpeed, (n) => {
    fieldParams.noiseSpeed = n;
  });
  addSlider('Wobble', { min: 0, max: 1, step: 0.05 }, () => fieldParams.fineNoiseWeight, (n) => {
    fieldParams.fineNoiseWeight = n;
  });
  // How much the base direction follows the chosen field (see the button
  // below) rather than straight south.
  addSlider('Path follow', { min: 0, max: 1, step: 0.05 }, () => fieldParams.pathWeight, (n) => {
    fieldParams.pathWeight = n;
  });
  // East–west spread across England. Wider fills Wales and East Anglia a
  // little but, with flow free to leave, mostly sends more off the coast.
  addSlider('Fan out', { min: 0, max: 2, step: 0.1 }, () => fieldParams.driftSpread, (n) => {
    fieldParams.driftSpread = n;
  });
  addSlider('Spacing push', { min: 0, max: 2, step: 0.05 }, () => fieldParams.densityWeight, (n) => {
    fieldParams.densityWeight = n;
  });
  // With coastMode 'exit', the only coast term left: a gentle turn ahead of
  // the coast. Lower lets more flow run off the edge.
  addSlider('Coast turn', { min: 0, max: 1, step: 0.05 }, () => fieldParams.conformWeight, (n) => {
    fieldParams.conformWeight = n;
  });
  addSlider('Jitter', { min: 0, max: 2, step: 0.1 }, () => particleStyle.jitterAmount, (n) => {
    particleStyle.jitterAmount = n;
  });

  // Which world field the base direction follows (see FieldParams.baseFieldMode):
  // fanning out from the farms, or converging on the south coast.
  const fieldButton = document.createElement('button');
  fieldButton.type = 'button';
  const FIELD_MODES = [
    { mode: 'blanket', label: 'Field: cover the land' },
    { mode: 'targets', label: 'Field: head for cities' },
    { mode: 'south', label: 'Field: head south' },
    { mode: 'divergent', label: 'Field: spread from farms' },
  ] as const;
  const syncFieldButton = () => {
    fieldButton.textContent = FIELD_MODES.find((f) => f.mode === fieldParams.baseFieldMode)?.label ?? '';
  };
  syncFieldButton();
  fieldButton.addEventListener('click', () => {
    const at = FIELD_MODES.findIndex((f) => f.mode === fieldParams.baseFieldMode);
    fieldParams.baseFieldMode = FIELD_MODES[(at + 1) % FIELD_MODES.length].mode;
    syncFieldButton();
    ctx.onFieldModeChanged();
  });
  const fieldRow = document.createElement('div');
  fieldRow.className = 'map-flow-panel-row';
  fieldRow.append(fieldButton);
  root.append(fieldRow);

  root.append(Object.assign(document.createElement('h2'), { textContent: 'Cover the land' }));
  // Read at birth, so a change shows as the flow turns over.
  addSlider('Born at farms', { min: 0, max: 1, step: 0.05 }, () => particleStyle.farmBirthShare, (n) => {
    particleStyle.farmBirthShare = n;
  });
  addSlider('Born further on', { min: 0, max: 4, step: 0.25 }, () => particleStyle.midJourneyBias, (n) => {
    particleStyle.midJourneyBias = n;
  });

  // City-size pull and distance penalty are only read when a particle is
  // born, so a change to them shows as the flow turns over.
  root.append(Object.assign(document.createElement('h2'), { textContent: 'Cities' }));
  addSlider('City-size pull', { min: 0, max: 2, step: 0.1 }, () => particleStyle.targetWeightExponent, (n) => {
    particleStyle.targetWeightExponent = n;
  });
  addSlider('Directness', { min: 0, max: 1, step: 0.05 }, () => fieldParams.targetDirectness, (n) => {
    fieldParams.targetDirectness = n;
  });
  addSlider('Distance penalty', { min: 0, max: 2, step: 0.1 }, () => particleStyle.targetDistanceExponent, (n) => {
    particleStyle.targetDistanceExponent = n;
  });

  document.body.append(root);

  return {
    toggle() {
      root.style.display = root.style.display === 'none' ? 'block' : 'none';
    },
  };
}
