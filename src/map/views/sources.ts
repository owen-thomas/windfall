/**
 * The bar and its source list (Windfall_Map_Spec_4c.md §4c.3, re-cut by
 * Windfall_Map_Spec_4d.md): the breakdown bar, labelled above in words, and the
 * tracked farms under it, always shown.
 *
 * 4d takes the bar out of its `<details>`: no chevron, no summary. Above the
 * bar, "10,877 MW on the grid" on the left and "Held back 2,228 MW" right-
 * aligned to its end, in the held-back blue. They are real text, so the bar
 * itself is `aria-hidden` and needs no sentence of its own. The held-back run
 * is never drawn narrower than 4px while anything is held back, so a small but
 * real figure never disappears into the navy.
 *
 * Under it, the tracked farms. The order follows the headline (Owen, 4d):
 * while anything is held back, most held back first, so the list opens on the
 * farms being switched off; when nothing is, largest declared output first. The held-back order can change as the grid operator's
 * instructions change; that is the story, not noise. The list is a grid filled
 * row-first (left to right, then down), and it grows in batches: 7 farms and
 * the "Show 8 more farms" control in the 8th cell (5 in one column), then 8
 * more per click. On a phone it starts folded away behind "▶ Show wind farms"
 * under the bar; opening shows five, and "Collapse" folds it all the way back. A batch of 8 is 4 rows of two, so the control
 * lands back in the last cell and nothing already on screen moves (a
 * column-first list would reflow every farm between the columns). Once the
 * list has grown, "Collapse" sits at the right of the same cell and folds it
 * back to its first count.
 *
 * Each row is a button, and the big bar in small (4d, Owen): a dot, the farm's
 * name and windspeed, its on-grid MW, a mini-bar filled to its on-grid share
 * (`instructedMW / declaredMW`), and its held-back MW — the right-hand figure
 * left out on a day with nothing held back. The mini-bars flex to one shared
 * width. The list is one column unless it is wide enough for two whole rows
 * side by side (a container query in map.css). Selecting a row hands the farm to `onSelect`, which
 * lights it on the map (main.ts wires the particles and the markers). The
 * selection is single, and is cleared by selecting the row again, by a click
 * anywhere outside the list, by Escape, or by folding the list back past it.
 *
 * Windspeed (4c.5) is `state.windspeed`, an independent feed that can land
 * after everything else, or not at all: a farm with no reading renders without
 * the "≋ N km/h" clause, never a zero or a guess.
 *
 * Honesty at the edges:
 * - A farm that declares nothing (`unitsDeclaring` 0) is *silent*: hollow
 *   dashed dot (as its map marker is), no share, and "—" for its megawatts.
 * - A farm that declares exactly 0 MW reads "0 MW" with a plain grey rail: it
 *   has no on-grid *share*, and a full lighter bar would read as "all held down".
 * - With no reading (pending, failed) the bar is an empty gauge and neither the
 *   labels nor the list are offered.
 */
import { el, setAttr, setText, type View } from '../../view/dom';
import type { AppState } from '../../lib/state';
import type { FarmNow } from '../../lib/types';
import { formatMW, formatWindspeed } from '../../lib/format';
import { onGridFigure, readOnGrid } from '../onGrid';

/** Farms added per click of the control: four rows of two. */
const BATCH = 8;

/** How many farms show before the first batch: 7 beside the control in two
 *  columns (a full 4 × 2 grid), 5 in one. The column count is the list's own
 *  (`--sources-cols`, set by a container query on its width in map.css), so it
 *  is read off the list itself. */
function initialCount(list: HTMLElement): number {
  const cols = getComputedStyle(list).getPropertyValue('--sources-cols').trim();
  return cols === '2' ? 7 : 5;
}

/** On a phone the list starts folded away behind "Show wind farms" (4d, Owen):
 *  the headline and bar already make the claim, and the map comes up sooner. */
function foldedByDefault(): boolean {
  return getComputedStyle(document.documentElement).getPropertyValue('--tier').trim() === 'mobile';
}

export interface SourcesOptions {
  /** A farm was selected, or (null) the selection was cleared. */
  onSelect(farm: string | null): void;
}

export interface SourcesView extends View {
  el: HTMLElement;
  selected(): string | null;
  select(farm: string | null): void;
}

interface Row {
  farm: string;
  item: HTMLLIElement;
  button: HTMLButtonElement;
  dot: HTMLElement;
  name: HTMLElement;
  windspeed: HTMLElement;
  bar: HTMLElement;
  barFill: HTMLElement;
  /** On-grid MW, left of the mini-bar. */
  on: HTMLElement;
  /** Held-back MW, right of it — empty when nothing on the page is held back. */
  held: HTMLElement;
}

/** Largest declared output first; ties by name, so the order is stable. */
function byDeclared(a: FarmNow, b: FarmNow): number {
  return b.declaredMW - a.declaredMW || a.farm.localeCompare(b.farm);
}

/** Most held back first, then as `byDeclared`. */
function byHeld(a: FarmNow, b: FarmNow): number {
  return b.curtailedMW - a.curtailedMW || byDeclared(a, b);
}

/** A farm's held-back megawatts, floored ("at least") and clamped to what it declared. */
function heldOf(farm: FarmNow): number {
  return Math.floor(Math.min(farm.declaredMW, Math.max(0, farm.curtailedMW)));
}

type Mode = 'held' | 'on';

export function mapSourcesView(options: SourcesOptions): SourcesView {
  // --- The labels and the bar -----------------------------------------------
  const onGridFigureEl = el('strong', { class: 'map-sources__figure' });
  const onGridLabel = el(
    'p',
    { class: 'map-sources__label map-sources__label--on' },
    onGridFigureEl,
    ' on the grid'
  );
  const heldWords = el('span', { class: 'map-sources__words' });
  const heldFigureEl = el('strong', { class: 'map-sources__figure' });
  const heldLabel = el(
    'p',
    { class: 'map-sources__label map-sources__label--held' },
    heldWords,
    heldFigureEl
  );
  const labels = el('div', { class: 'map-sources__labels' }, onGridLabel, heldLabel);

  const shareFill = el('div', { class: 'share__fill' });
  const shareBar = el('div', { class: 'share', 'aria-hidden': 'true' }, shareFill);

  // --- The list, and the control that grows it --------------------------------
  const list = el('ul', { class: 'map-sources__list', id: 'map-sources-list' });
  const moreDot = el('span', { class: 'source-row__dot source-row__dot--hollow', 'aria-hidden': 'true' });
  const moreText = el('span', { class: 'map-sources__more-text' });
  const more = el(
    'button',
    { class: 'map-sources__more', type: 'button', 'aria-controls': 'map-sources-list' },
    moreDot,
    moreText
  );
  // "Collapse" shares the control's cell, at its right, once the reader has
  // asked for more: one click back to the first count from anywhere.
  const collapseText = el('span', { class: 'map-sources__more-text', text: 'Collapse' });
  const collapse = el(
    'button',
    { class: 'map-sources__more map-sources__collapse', type: 'button', 'aria-controls': 'map-sources-list' },
    collapseText
  );
  // The controls are the list's last cell, not a sibling after it, so the grid
  // gives them the slot beside the last farm.
  const moreItem = el('li', { class: 'map-sources__item map-sources__item--more' }, more, collapse);
  // Announces each batch; the control's own text changes too, but a screen
  // reader doesn't reread a focused button whose label changed.
  const status = el('p', { class: 'map-sources__sr', 'aria-live': 'polite' });
  const body = el('div', { class: 'map-sources__body' }, list, status);

  // A phone's way in: the page's text toggle, directly under the bar. Opening
  // shows the first five; "Collapse" folds the whole list back to this.
  const openText = el('span', { class: 'map-toggle__text', text: 'Show wind farms' });
  const open = el(
    'button',
    { class: 'map-sources__open', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'map-sources-list' },
    el('span', { class: 'map-toggle' }, openText)
  );

  const root = el('section', { class: 'map-sources', 'data-state': 'pending' }, labels, shareBar, open, body);

  const rows = new Map<string, Row>();
  let order: string[] = [];
  /** Farms showing once the reader has asked for more; null until then, so the
   *  initial count keeps following the layout tier. */
  let shown: number | null = null;
  /** The reader has opened the list on a phone. */
  let opened = false;
  let selectedFarm: string | null = null;

  function select(farm: string | null) {
    if (farm === selectedFarm) return;
    selectedFarm = farm;
    for (const row of rows.values()) {
      row.button.setAttribute('aria-pressed', String(row.farm === farm));
    }
    options.onSelect(farm);
  }

  function makeRow(farm: string): Row {
    const dot = el('span', { class: 'source-row__dot', 'aria-hidden': 'true' });
    const name = el('span', { class: 'source-row__name' });
    // Its own span, inside the name's grid cell rather than a cell of its
    // own — the frame runs it straight on from the name ("Seagreen ≋ 34
    // km/h"), and an empty span here (no reading yet) costs nothing.
    const windspeed = el('span', { class: 'source-row__windspeed' });
    const label = el('span', { class: 'source-row__label' }, name, windspeed);
    const barFill = el('span', { class: 'source-row__bar-fill' });
    const bar = el('span', { class: 'source-row__bar', 'aria-hidden': 'true' }, barFill);
    const on = el('span', { class: 'source-row__mw source-row__mw--on' });
    const held = el('span', { class: 'source-row__mw source-row__mw--held' });
    const button = el(
      'button',
      { class: 'source-row', type: 'button', 'aria-pressed': 'false', 'data-farm': farm },
      dot,
      label,
      on,
      bar,
      held
    );
    button.addEventListener('click', () => select(selectedFarm === farm ? null : farm));
    const item = el('li', { class: 'map-sources__item' }, button);
    return { farm, item, button, dot, name, windspeed, bar, barFill, on, held };
  }

  function paintRow(row: Row, farm: FarmNow, kmh: number | undefined, mode: Mode) {
    const silent = farm.unitsDeclaring === 0 && farm.declaredMW <= 0;
    const held = farm.curtailedMW > 0;

    setText(row.name, farm.farm);
    setAttr(row.dot, 'data-state', silent ? 'silent' : 'declaring');

    // The glyph is decorative (aria-hidden); the reading itself is folded
    // into the row's aria-label below, so nothing here needs its own.
    if (kmh === undefined) {
      row.windspeed.replaceChildren();
    } else {
      // Two spans, so the gap after the glyph is the same 4px flex gap as the
      // one before it, not a word space (≈2.7px at 12px).
      row.windspeed.replaceChildren(
        el('span', { class: 'source-row__glyph', 'aria-hidden': 'true', text: '≋' }),
        el('span', { text: formatWindspeed(kmh) })
      );
    }

    if (silent || farm.declaredMW <= 0) {
      // Nothing to divide: a rail with no fill, never a full or empty share.
      setAttr(row.bar, 'data-share', 'none');
      row.barFill.style.width = '0%';
    } else {
      setAttr(row.bar, 'data-share', 'some');
      const pct = Math.min(100, Math.max(0, (farm.instructedMW / farm.declaredMW) * 100));
      row.barFill.style.width = `${pct}%`;
    }

    // The row is the big bar in small (4d, Owen): on-grid MW left of the
    // mini-bar, held-back MW right of it. On a day with nothing held back the
    // right-hand figure is left out, as the big bar's is ("Nothing held back").
    const onGrid = onGridFigure(farm.instructedMW, held);
    const heldMW = heldOf(farm);
    const heldText = heldMW.toLocaleString('en-GB');
    setText(row.on, silent ? '—' : `${onGrid} MW`);
    setText(row.held, silent || mode === 'on' ? '' : `${heldText} MW`);
    // A farm with nothing held back reads "0 MW" in the labels' grey rather
    // than the held-back blue.
    setAttr(row.held, 'data-held', heldMW > 0 ? 'some' : 'none');

    const windLabel = kmh === undefined ? '' : `, ${formatWindspeed(kmh)}`;
    row.button.setAttribute(
      'aria-label',
      silent
        ? `${farm.farm}: no declaration this half-hour${windLabel}`
        : mode === 'held'
          ? `${farm.farm}: ${onGrid} MW on the grid, ${heldText} MW held back${windLabel}`
          : `${farm.farm}: ${onGrid} MW on the grid of ${formatMW(farm.declaredMW)}${windLabel}`
    );
  }

  /**
   * The label column is as wide as the longest label in the whole list — every
   * farm, shown or not — so the mini-bars all start at one edge and share one
   * width, flexing into whatever the column leaves (Owen). Measured with the
   * rows' own fonts, since hidden rows have no layout to read.
   */
  const measureCtx = document.createElement('canvas').getContext('2d');
  const LABEL_GAP = 4;
  function measureLabels() {
    const first = rows.values().next().value as Row | undefined;
    if (!measureCtx || !first) return;
    const nameStyle = getComputedStyle(first.name);
    const bold = `${nameStyle.fontWeight} ${nameStyle.fontSize} ${nameStyle.fontFamily}`;
    const regular = `400 ${nameStyle.fontSize} ${nameStyle.fontFamily}`;
    let widest = 0;
    for (const row of rows.values()) {
      measureCtx.font = bold;
      let w = measureCtx.measureText(row.name.textContent ?? '').width;
      const speed = row.windspeed.lastChild?.textContent;
      if (speed) {
        measureCtx.font = regular;
        w += LABEL_GAP + measureCtx.measureText('≋').width + LABEL_GAP + measureCtx.measureText(speed).width;
      }
      widest = Math.max(widest, w);
    }
    list.style.setProperty('--source-label-w', `${Math.ceil(widest) + 1}px`);
  }
  void document.fonts?.ready.then(measureLabels);

  /** Show the first `count` rows and keep the control's label honest. */
  function layout() {
    const folds = foldedByDefault();
    const folded = folds && !opened;
    // map.css seats the opened list where the toggle was, so its first row's
    // text sits on the toggle's own line.
    setAttr(root, 'data-folds', folds ? 'true' : null);
    body.hidden = folded;
    open.hidden = !folded;
    open.setAttribute('aria-expanded', String(!folded));

    const initial = initialCount(list);
    // A list only one farm longer than the first count shows whole: a control
    // that reveals a single farm in its own cell is just that farm, hidden.
    const all = order.length <= initial + 1;
    const count = all ? order.length : Math.min(order.length, shown ?? initial);
    order.forEach((farm, i) => {
      const row = rows.get(farm);
      if (row) row.item.hidden = i >= count;
    });

    const rest = order.length - count;
    more.hidden = rest === 0;
    // On a phone "Collapse" is also the way out once the list is open at all.
    collapse.hidden = count <= initial && !folds;
    // A list short enough to show whole still needs its way out on a phone.
    moreItem.hidden = all && !folds;
    if (rest > BATCH) setText(moreText, `Show ${BATCH} more farms`);
    else if (rest > 1) setText(moreText, `Show last ${rest} farms`);
    else setText(moreText, 'Show last farm');
    return count;
  }

  more.addEventListener('click', () => {
    const before = Math.min(order.length, shown ?? initialCount(list));
    shown = Math.min(order.length, before + BATCH);
    layout();
    // Carry on from where the list grew.
    rows.get(order[before])?.button.focus();
    const added = shown - before;
    setText(status, added === 1 ? '1 more farm shown.' : `${added} more farms shown.`);
  });

  open.addEventListener('click', () => {
    opened = true;
    shown = null;
    layout();
    rows.get(order[0])?.button.focus();
  });

  collapse.addEventListener('click', () => {
    shown = null;
    if (foldedByDefault()) {
      // On a phone, all the way back to "Show wind farms".
      opened = false;
      layout();
      if (selectedFarm !== null) select(null);
      open.focus({ preventScroll: true });
      open.scrollIntoView({ block: 'nearest' });
      return;
    }
    const count = layout();
    // A selected farm whose row has just been folded away has nothing left to
    // show for it in the list; let go of it.
    if (selectedFarm !== null && order.indexOf(selectedFarm) >= count) select(null);
    // Focus was on a control that's now hidden, or a row that is; put it on
    // "Show 8 more farms", and keep that on screen.
    more.focus({ preventScroll: true });
    more.scrollIntoView({ block: 'nearest' });
    setText(status, 'Farm list collapsed.');
  });

  // The first count (7 or 5) and a phone's fold follow the layout until the
  // reader asks for more.
  window.addEventListener('resize', () => {
    if (order.length > 0) layout();
  });

  // The selection lives in the list: click anywhere else, or press Escape, and
  // it goes. A click inside the list (a row, or the control) does not.
  document.addEventListener('click', (event) => {
    if (selectedFarm !== null && !body.contains(event.target as Node)) select(null);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && selectedFarm !== null) select(null);
  });

  return {
    el: root,
    selected: () => selectedFarm,
    select,
    update(state: AppState) {
      const data = state.curtailment;

      if (!data?.now) {
        // The bar says nothing until there is something to say: an empty
        // gauge, no labels, and no list.
        setAttr(root, 'data-state', state.pending ? 'pending' : 'failed');
        shareFill.style.width = '0%';
        shareBar.hidden = false;
        heldLabel.hidden = false;
        if (selectedFarm !== null) select(null);
        return;
      }

      const reading = readOnGrid(data.now);
      setAttr(root, 'data-state', 'ok');
      setAttr(heldLabel, 'data-held', reading.allClear ? 'none' : 'some');
      setText(onGridFigureEl, reading.onGridLabel);
      // With nothing held back the bar is one solid run that says nothing the
      // headline hasn't ("100% … on the grid"), so it goes (Owen).
      // "Nothing held back" goes with it — the headline already says so — and
      // the rows drop their mini-bars (map.css, data-mode="on").
      shareBar.hidden = reading.allClear;
      heldLabel.hidden = reading.allClear;
      if (reading.allClear) {
        setText(heldWords, 'Nothing held back');
        setText(heldFigureEl, '');
        shareFill.style.width = '100%';
      } else {
        setText(heldWords, 'Held back ');
        setText(heldFigureEl, reading.heldLabel);
        // Never let a real held-back run vanish: leave it at least 4px.
        shareFill.style.width = `min(${Math.max(0, reading.pct)}%, calc(100% - 4px))`;
      }

      const mode: Mode = reading.allClear ? 'on' : 'held';
      setAttr(root, 'data-mode', mode);
      const farms = [...data.now.farms].sort(mode === 'held' ? byHeld : byDeclared);
      const present = new Set(farms.map((f) => f.farm));
      for (const [name, row] of rows) {
        if (present.has(name)) continue;
        row.item.remove();
        rows.delete(name);
        if (selectedFarm === name) select(null);
      }

      // Independent of the reading above: lands whenever it lands, and a farm
      // this feed never answers for just gets no clause (never a guess).
      const speeds = state.windspeed?.speeds;

      for (const farm of farms) {
        let row = rows.get(farm.farm);
        if (!row) {
          row = makeRow(farm.farm);
          rows.set(farm.farm, row);
          if (farm.farm === selectedFarm) row.button.setAttribute('aria-pressed', 'true');
        }
        paintRow(row, farm, speeds?.[farm.farm], mode);
      }

      // Re-seat the rows only when the order actually changed, so a refresh
      // that moves nothing never touches the DOM (and keyboard focus stays put).
      const next = farms.map((f) => f.farm);
      if (next.length !== order.length || next.some((farm, i) => farm !== order[i])) {
        const focused = document.activeElement;
        list.append(...next.map((farm) => rows.get(farm)!.item), moreItem);
        if (focused instanceof HTMLElement && list.contains(focused)) focused.focus();
        order = next;
      }
      layout();
      measureLabels();
    },
  };
}
