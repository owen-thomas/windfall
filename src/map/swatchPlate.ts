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
import { mapHeadlineView } from './views/headline';
import { mapSourcesView } from './views/sources';
import { SCOTLAND, ENGLAND } from '../view/band';

const TYPE_TOKENS: { token: string; label: string; sample: string; font: 'display' | 'body' }[] = [
  { token: '--type-display', label: 'display — the headline (steps by tier: 40 / 32 / 32 / 20px)', sample: '83% on the grid', font: 'display' },
  { token: '--type-region', label: 'region — wordmark, Scotland / England, bar label', sample: 'Scotland', font: 'display' },
  { token: '--type-body', label: 'body — mix sentences, tooltip, method note', sample: 'Held off the grid, right now.', font: 'body' },
  { token: '--type-small', label: 'small — settlement row, farm list, legend, byline', sample: 'Read 2 minutes ago', font: 'body' },
  { token: '--type-caption', label: 'caption — inset captions, the mobile legend', sample: 'Viking’s output enters the mainland', font: 'body' },
];

const COLOUR_GROUPS: { title: string; tokens: string[] }[] = [
  { title: 'Ground & text', tokens: ['--ink-void', '--ink-ground', '--ink-raised', '--ink-line', '--ink-line-strong', '--ink-box', '--text-primary', '--text-secondary', '--text-muted'] },
  { title: 'Fuels (wind: indigo in the bars and legend; --wind-live on the map itself)', tokens: ['--fuel-wind', '--wind-live', '--fuel-gas', '--fuel-nuclear', '--fuel-solar', '--fuel-hydro', '--fuel-biomass', '--fuel-imports', '--fuel-coal', '--fuel-other'] },
  { title: 'Curtailed', tokens: ['--curtailed', '--curtailed-edge'] },
  { title: 'Selection (the farm picked out in the source list)', tokens: ['--highlight'] },
  { title: 'Link & the breakdown bar', tokens: ['--link', '--bar-on', '--bar-off', '--bar-label'] },
  { title: 'Signal', tokens: ['--signal-ok', '--signal-ageing', '--signal-stale', '--signal-failed'] },
];

/**
 * The WCAG 2.x AA check (DECISIONS 027's table, re-run for 4b — 028). Computed
 * live from the resolved tokens, so it can never disagree with the CSS. `text`
 * pairs need 4.5:1 (every text here is under 18px), `graphic` pairs 3:1.
 * `disclosed` rows are the known, argued exceptions: they are shown with their
 * ratio and marked, never quietly passed.
 */
interface ContrastRow {
  fg: string;
  bg: string;
  kind: 'text' | 'graphic';
  use: string;
  disclosed?: string;
}

const CONTRAST_ROWS: ContrastRow[] = [
  { fg: '--text-primary', bg: '--ink-ground', kind: 'text', use: 'wordmark, headline, region names' },
  { fg: '--text-secondary', bg: '--ink-ground', kind: 'text', use: 'sentences, farm names, legend values' },
  { fg: '--text-muted', bg: '--ink-ground', kind: 'text', use: 'settlement row, legend names, byline' },
  { fg: '--held-text', bg: '--ink-ground', kind: 'text', use: 'held-back figures in text: the headline figure, "Held back 2,228 MW" (4d)' },
  { fg: '--signal-ageing', bg: '--ink-ground', kind: 'text', use: 'ageing notice' },
  { fg: '--signal-stale', bg: '--ink-ground', kind: 'text', use: 'stale notice' },
  { fg: '--signal-failed', bg: '--ink-ground', kind: 'text', use: 'failed notice' },
  { fg: '--fuel-wind', bg: '--ink-ground', kind: 'graphic', use: 'wind bar segment, legend swatch' },
  { fg: '--wind-live', bg: '--ink-ground', kind: 'graphic', use: 'farm markers' },
  { fg: '--highlight', bg: '--ink-ground', kind: 'graphic', use: 'the selected farm\'s marker and flow' },
  { fg: '--highlight', bg: '--ink-raised', kind: 'graphic', use: 'the selected row\'s dot, on its tint' },
  { fg: '--fuel-wind', bg: '--ink-ground', kind: 'text', use: 'source rows: on-grid MW' },
  { fg: '--fuel-wind', bg: '--ink-raised', kind: 'text', use: 'source rows: figures on the selected tint' },
  { fg: '--text-primary', bg: '--ink-raised', kind: 'text', use: 'source rows: farm names on the selected tint' },
  { fg: '--wind-live', bg: '--curtailed', kind: 'graphic', use: 'held-down marker edge on its fill' },
  { fg: '--signal-ok', bg: '--ink-ground', kind: 'graphic', use: 'freshness dot in the footer, static green (4d)' },
  {
    fg: '--bar-off',
    bg: '--ink-ground',
    kind: 'graphic',
    use: 'held-back run of the bar and the mini-bars, against the cream',
    disclosed:
      'Owen\'s 4d pale periwinkle. It always sits against --bar-on (3.49:1, below), and the held-back figure is printed above the bar in words, so the fill never has to be read against the cream alone.',
  },
  { fg: '--fuel-gas', bg: '--ink-ground', kind: 'graphic', use: 'gas segment' },
  { fg: '--fuel-nuclear', bg: '--ink-ground', kind: 'graphic', use: 'nuclear segment' },
  { fg: '--fuel-solar', bg: '--ink-ground', kind: 'graphic', use: 'solar segment', disclosed: 'Misses by 0.02. The frame\'s own hex, adopted as drawn (DECISIONS 029). Read beside its legend name and figure, never alone.' },
  { fg: '--fuel-hydro', bg: '--ink-ground', kind: 'graphic', use: 'hydro segment' },
  { fg: '--fuel-biomass', bg: '--ink-ground', kind: 'graphic', use: 'biomass segment', disclosed: 'The frame\'s own hex, adopted as drawn (DECISIONS 029). Read beside its legend name and figure, never alone.' },
  { fg: '--fuel-imports', bg: '--ink-ground', kind: 'graphic', use: 'imports segment', disclosed: 'The frame\'s own hex, adopted as drawn (DECISIONS 029). Read beside its legend name and figure, never alone.' },
  { fg: '--fuel-coal', bg: '--ink-ground', kind: 'graphic', use: 'coal segment' },
  { fg: '--fuel-other', bg: '--ink-ground', kind: 'graphic', use: 'other segment' },
  {
    fg: '--bar-off',
    bg: '--bar-on',
    kind: 'graphic',
    use: 'the two runs of the bar against each other',
    disclosed:
      'Two fills of one bar, read by the labels above it ("10,877 MW on the grid", "Held back 2,228 MW") and the headline, never by the boundary alone. Clears 3:1 since 4d.',
  },
];

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Resolve a token to its rgb, whatever notation the stylesheet used. */
function rgbOf(token: string): [number, number, number] {
  const probe = document.createElement('span');
  probe.style.color = `var(${token})`;
  document.body.append(probe);
  const match = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g) ?? ['0', '0', '0'];
  probe.remove();
  return [Number(match[0]), Number(match[1]), Number(match[2])];
}

function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(fg: string, bg: string): number {
  const a = luminance(rgbOf(fg));
  const b = luminance(rgbOf(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

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

function contrastTable(): HTMLElement {
  const rows = CONTRAST_ROWS.map((row) => {
    const ratio = contrastRatio(row.fg, row.bg);
    const need = row.kind === 'text' ? 4.5 : 3;
    const verdict = ratio >= need ? 'pass' : row.disclosed ? 'disclosed' : 'FAIL';
    return el(
      'tr',
      { class: 'plate__contrast-row', 'data-verdict': verdict },
      el('td', {}, el('span', { class: 'plate__contrast-chip', style: `background:var(${row.bg});color:var(${row.fg})`, text: 'Aa' })),
      el('td', { text: `${row.fg} on ${row.bg}` }),
      el('td', { text: row.use }),
      el('td', { text: `${ratio.toFixed(2)}:1` }),
      el('td', { text: row.kind === 'text' ? 'text ≥ 4.5' : 'graphic ≥ 3' }),
      el('td', { class: 'plate__contrast-verdict', text: row.disclosed && ratio < need ? `disclosed — ${row.disclosed}` : verdict })
    );
  });
  return el('table', { class: 'plate__contrast' }, el('tbody', {}, ...rows));
}

/** The whole headline block (sentence, bar, farm list) in two fixtures, as it renders on /map. */
function fixtureHeadlines(): HTMLElement {
  const wrap = el('div', { class: 'plate__bars' });
  for (const fixtureName of ['curtailing', 'calm', 'degraded']) {
    const state = fixtureState(fixtureName);
    const view = mapHeadlineView();
    view.update(state);
    // The bar and the farm list are the sources view (4c.3; always shown since 4d).
    const sources = mapSourcesView({ onSelect: () => undefined });
    sources.update(state);
    view.el.append(sources.el);
    wrap.append(
      el('div', { class: 'plate__bars-column' }, el('h3', { class: 'plate__bars-title', text: fixtureName }), view.el)
    );
  }
  return wrap;
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

  const headlineSection = el(
    'section',
    { class: 'plate__section' },
    el('h2', { class: 'plate__section-title', text: 'The headline block — the solid breakdown bar' }),
    fixtureHeadlines()
  );

  const contrastSection = el(
    'section',
    { class: 'plate__section' },
    el('h2', { class: 'plate__section-title', text: 'Contrast — WCAG AA, computed from the tokens above' }),
    contrastTable()
  );

  root.replaceChildren(
    el(
      'div',
      { class: 'plate' },
      el('h1', { class: 'plate__title', text: 'Windfall — token plate' }),
      typeSection,
      colourSection,
      headlineSection,
      barsSection,
      contrastSection
    )
  );
}
