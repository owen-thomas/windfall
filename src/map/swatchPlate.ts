/**
 * The swatch plate (Windfall_Map_Spec.md §6 Part B.4, step 4): a dev-only
 * route, `/map?plate=tokens`, that renders the type scale, every colour
 * token by name, and the two region bars in the calm and curtailing
 * fixtures side by side. This is what Owen adjusts in Figma at the gate —
 * screenshotting the live tokens rather than a separately maintained
 * reference means the plate can never drift from what tokens-light.css
 * actually says, because every value on it is read from the computed style
 * at render time, not copied into this file as a literal.
 *
 * Entirely separate from the map's own boot (main.ts calls this instead of
 * `bootMap()` when the query flag is present) — no projection, no canvas, no
 * live fetch, just the design tokens and two static fixture renders.
 */
import { el } from '../view/dom';
import { emptyFeeds, type AppState } from '../lib/state';
import { scenarioByName } from '../lib/scenarios';
import { mapBandView } from './views/band';
import { SCOTLAND, ENGLAND } from '../view/band';

const TYPE_TOKENS: { token: string; label: string; sample: string; font: 'display' | 'body' }[] = [
  { token: '--type-display', label: 'display — the headline', sample: 'At least 25%', font: 'display' },
  { token: '--type-region', label: 'region — Scotland / England', sample: 'Scotland', font: 'display' },
  { token: '--type-body', label: 'body — sentences, breakdown', sample: 'Held off the grid, right now.', font: 'body' },
  { token: '--type-small', label: 'small — clock, farm list, legend', sample: 'Read 2 minutes ago', font: 'body' },
  { token: '--type-caption', label: 'caption — method note, byline', sample: 'Figures are lower bounds', font: 'body' },
];

const COLOUR_GROUPS: { title: string; tokens: string[] }[] = [
  { title: 'Ground & text', tokens: ['--ink-void', '--ink-ground', '--ink-raised', '--ink-line', '--ink-line-strong', '--text-primary', '--text-secondary', '--text-muted'] },
  { title: 'Fuels', tokens: ['--fuel-wind', '--fuel-gas', '--fuel-nuclear', '--fuel-solar', '--fuel-hydro', '--fuel-biomass', '--fuel-imports', '--fuel-coal', '--fuel-other'] },
  { title: 'Curtailed', tokens: ['--curtailed', '--curtailed-edge'] },
  { title: 'Signal', tokens: ['--signal-ok', '--signal-ageing', '--signal-stale', '--signal-failed'] },
];

function tokenValue(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim();
}

function swatch(token: string): HTMLElement {
  return el(
    'div',
    { class: 'plate__swatch' },
    el('div', { class: 'plate__swatch-fill', style: `background:var(${token})` }),
    el('p', { class: 'plate__swatch-name', text: token }),
    el('p', { class: 'plate__swatch-value', text: tokenValue(token) })
  );
}

function fixtureState(name: string): AppState {
  const scenario = scenarioByName(name);
  const now = new Date();
  const built = scenario.build ? scenario.build(now) : emptyFeeds();
  return { ...emptyFeeds(), ...built, now, scenario: name, pending: false };
}

function fixtureBars(): HTMLElement {
  const fixtures = ['calm', 'curtailing'];
  const specs: [string, typeof SCOTLAND][] = [
    ['Scotland', SCOTLAND],
    ['England', ENGLAND],
  ];

  const grid = el('div', { class: 'plate__bars' });
  for (const fixtureName of fixtures) {
    const state = fixtureState(fixtureName);
    const column = el('div', { class: 'plate__bars-column' }, el('h3', { class: 'plate__bars-title', text: fixtureName }));
    for (const [label, spec] of specs) {
      const band = mapBandView(spec);
      band.update(state);
      column.append(el('div', { class: 'plate__bars-region' }, el('p', { class: 'plate__bars-region-name', text: label }), band.el));
    }
    grid.append(column);
  }
  return grid;
}

export function renderSwatchPlate(root: HTMLElement): void {
  document.body.classList.add('plate-mode');

  const typeSection = el(
    'section',
    { class: 'plate__section' },
    el('h2', { class: 'plate__section-title', text: 'Type scale' }),
    ...TYPE_TOKENS.map(({ token, label, sample, font }) =>
      el(
        'div',
        { class: 'plate__type-row' },
        el('p', { class: 'plate__type-meta', text: `${token} — ${tokenValue(token)} — ${label}` }),
        el('p', {
          class: 'plate__type-sample',
          style: `font-size:var(${token});font-family:var(${font === 'display' ? '--font-display' : '--font-body'})`,
          text: sample,
        })
      )
    )
  );

  const colourSection = el(
    'section',
    { class: 'plate__section' },
    el('h2', { class: 'plate__section-title', text: 'Colour tokens' }),
    ...COLOUR_GROUPS.map((group) =>
      el(
        'div',
        { class: 'plate__colour-group' },
        el('h3', { class: 'plate__colour-group-title', text: group.title }),
        el('div', { class: 'plate__swatches' }, ...group.tokens.map(swatch))
      )
    )
  );

  const barsSection = el(
    'section',
    { class: 'plate__section' },
    el('h2', { class: 'plate__section-title', text: 'The two bars — calm vs curtailing' }),
    fixtureBars()
  );

  root.replaceChildren(
    el(
      'div',
      { class: 'plate' },
      el('h1', { class: 'plate__title', text: 'Windfall — token plate' }),
      typeSection,
      colourSection,
      barsSection
    )
  );
}
