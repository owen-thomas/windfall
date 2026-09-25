/**
 * The bar and its source list (Windfall_Map_Spec_4c.md §4c.3, re-cut by
 * Windfall_Map_Spec_4d.md): the breakdown bar, labelled above in words, and the
 * tracked farms under it, always shown.
 *
 * 4d takes the bar out of its `<details>`: no chevron, no summary. The bar
 * spans the tracked farms' installed capacity (Owen), as every farm's row and
 * marker does: MW on the grid, MW held back, and the rest a pale idle track.
 * Above it, a legend of the two that carry the story — "2,913 MW on the grid",
 * "2,196 MW held back", each with its swatch; idle gets no legend item, only
 * the quiet "13,105 MW installed" under the bar's end (Owen). They are real
 * text, so the bar itself is `aria-hidden` and needs no sentence of its own.
 * The held-back run is never drawn narrower than 4px while anything is held
 * back.
 *
 * Under it, the tracked farms, largest capacity first, then most MW on the
 * grid (Owen). "▶ Show wind farms" / "▼ Hide wind farms" under the bar,
 * left, opens and closes the whole list at every tier (Owen); it starts open
 * where there is room for it and closed on a phone. The list is a grid filled
 * row-first (left to right, then down), and it grows in batches: 7 farms and
 * the "Show more" control in the 8th cell (5 in one column), then 8 more per
 * click. A batch of 8 is 4 rows of two, so the control lands back in the last
 * cell and nothing already on screen moves (a column-first list would reflow
 * every farm between the columns). Once the list has grown, "Collapse" sits
 * at the right of the same cell and takes it back to its first count.
 *
 * Each row is a button: a dot, the farm's name, its on-grid MW,
 * a mini-bar, and its held-back MW — the right-hand figure left out on a day
 * with nothing held back. The mini-bar is strictly proportional to capacity
 * (Owen): its length is the farm's capacity against the largest farm's, split
 * into MW on the grid, MW held back, and idle capacity (the empty track). The
 * farm's marker on the map is the same bar wrapped into a circle. The
 * mini-bars' column flexes to one shared width. The list is one column unless it is wide enough for two whole rows
 * side by side (a container query in map.css). Selecting a row hands the farm to `onSelect`, which
 * lights it on the map (main.ts wires the particles and the markers). The
 * selection is single, and is cleared by selecting the row again, by a click
 * anywhere outside the list, by Escape, or by folding the list back past it.
 *
 * Honesty at the edges:
 * - Each row's dot is the farm's state, as its marker on the map shows it
 *   (markers.ts's `farmStateOf`): navy with anything on the grid, periwinkle
 *   with everything held back, a navy keyline with nothing at all.
 * - A farm that declares nothing (`unitsDeclaring` 0) reads "—" for its
 *   megawatts, over an all-idle bar.
 * - A farm that declares exactly 0 MW reads "0 MW" with a plain grey rail: it
 *   has no on-grid *share*, and a full lighter bar would read as "all held down".
 * - With no reading (pending, failed) the bar is an empty gauge and neither the
 *   labels nor the list are offered.
 */
import { el, setAttr, setText, type View } from '../../view/dom';
import type { AppState } from '../../lib/state';
import type { FarmNow } from '../../lib/types';
import { formatMW } from '../../lib/format';
import { farmStateOf } from '../markers';
import { enter } from '../enter';
import { FARM_CAPACITY_MW, INSTALLED_MW } from '../farmCapacity';
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

/** On a phone the list starts closed (4d, Owen): the headline and bar already
 *  make the claim, and the map comes up sooner. */
function closedByDefault(): boolean {
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
  bar: HTMLElement;
  /** The farm's capacity, as a share of the largest farm's: the bar's own length. */
  barTrack: HTMLElement;
  /** On-grid MW, as a share of capacity. */
  barOn: HTMLElement;
  /** Held-back MW, as a share of capacity. */
  barHeld: HTMLElement;
  /** The figures, left of the mini-bar: "166 / 584 MW" (on the grid / held back), or "342 MW" with nothing held back. */
  on: HTMLElement;
}

/** Every tracked farm with only its capacity known — the list while there is no reading. */
const UNREAD_FARMS: FarmNow[] = [...FARM_CAPACITY_MW].map(([farm, capacityMW]) => ({
  farm,
  capacityMW,
  declaredMW: 0,
  instructedMW: 0,
  curtailedMW: 0,
  unitsDeclaring: 0,
  unitsCurtailed: 0,
}));

/** A farm's MW on the grid — declared minus curtailed, never negative. */
function onGridOf(farm: FarmNow): number {
  return Math.max(0, farm.instructedMW);
}

/**
 * The list's order (Owen): largest capacity first, then most MW on the grid,
 * then by name, so the order is stable. Capacity barely moves, so the list
 * holds its shape from one reading to the next and each bar's length steps
 * down it; what changes is how each bar fills.
 */
function byListOrder(a: FarmNow, b: FarmNow): number {
  return b.capacityMW - a.capacityMW || onGridOf(b) - onGridOf(a) || a.farm.localeCompare(b.farm);
}

/** A farm's held-back megawatts, floored ("at least") and clamped to what it declared. */
function heldOf(farm: FarmNow): number {
  return Math.floor(Math.min(farm.declaredMW, Math.max(0, farm.curtailedMW)));
}

type Mode = 'held' | 'on';

export function mapSourcesView(options: SourcesOptions): SourcesView {
  // --- The labels and the bar -----------------------------------------------
  // A legend above the bar (Owen): swatch, figure, word, in the bar's order.
  function legendItem(kind: 'on' | 'held' | 'idle', word: string) {
    const figure = el('strong', { class: 'map-sources__figure' });
    const item = el(
      'p',
      { class: `map-sources__label map-sources__label--${kind}` },
      el('span', { class: 'map-sources__swatch', 'aria-hidden': 'true' }),
      figure,
      ` ${word}`
    );
    return { item, figure };
  }
  const onLegend = legendItem('on', 'on the grid');
  const heldLegend = legendItem('held', 'held back');
  const labels = el('div', { class: 'map-sources__labels' }, onLegend.item, heldLegend.item);
  // The bar's full length, named quietly under its end: "13,105 MW installed".
  // "Installed", never "capacity" — the page's issue is the grid's capacity,
  // and the farms' own is a different thing.
  const installed = el('p', { class: 'map-sources__installed' });

  const shareOn = el('span', { class: 'share__on' });
  const shareHeld = el('span', { class: 'share__held' });
  // The two runs in one group, so they grow in from the left together on
  // arrival (enter.ts) while each keeps its own width transition for readings.
  const shareFill = el('span', { class: 'share__runs' }, shareOn, shareHeld);
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

  // The list's own toggle, the page's text toggle as a button, directly under
  // the bar at every tier: "Show wind farms" / "Hide wind farms".
  const openText = el('span', { class: 'map-toggle__text', text: 'Show wind farms' });
  const open = el(
    'button',
    { class: 'map-sources__open', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'map-sources-list' },
    el('span', { class: 'map-toggle' }, openText)
  );

  // "Show / Hide wind farms" and the installed figure share the line under the
  // bar, left and right.
  const foot = el('div', { class: 'map-sources__foot' }, open, installed);

  const root = el('section', { class: 'map-sources', 'data-state': 'pending' }, labels, shareBar, foot, body);

  const rows = new Map<string, Row>();
  let order: string[] = [];
  /** Farms showing once the reader has asked for more; null until then, so the
   *  initial count keeps following the layout tier. */
  let shown: number | null = null;
  /** The reader has opened (true) or closed (false) the list; null until they
   *  do, so it follows the tier's default (closedByDefault) across resizes. */
  let opened: boolean | null = null;
  let selectedFarm: string | null = null;
  /** The first reading has landed and played its entrance. */
  let arrived = false;

  /** Cascade in the rows now showing from `from` on (all of them, by default). */
  function enterRows(from = 0) {
    if (body.hidden) return;
    const items: HTMLElement[] = [];
    order.forEach((farm, i) => {
      const row = rows.get(farm);
      if (i >= from && row && !row.item.hidden) items.push(row.item);
    });
    if (!moreItem.hidden) items.push(moreItem);
    enter(items);
  }

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
    const label = el('span', { class: 'source-row__label' }, name);
    const barOn = el('span', { class: 'source-row__bar-on' });
    const barHeld = el('span', { class: 'source-row__bar-held' });
    const barTrack = el('span', { class: 'source-row__bar-track' }, barOn, barHeld);
    const bar = el('span', { class: 'source-row__bar', 'aria-hidden': 'true' }, barTrack);
    const on = el('span', { class: 'source-row__mw' });
    const button = el(
      'button',
      { class: 'source-row', type: 'button', 'aria-pressed': 'false', 'data-farm': farm },
      dot,
      label,
      on,
      bar
    );
    button.addEventListener('click', () => select(selectedFarm === farm ? null : farm));
    const item = el('li', { class: 'map-sources__item' }, button);
    return { farm, item, button, dot, name, bar, barTrack, barOn, barHeld, on };
  }

  /** `read`: false while there is no live reading — the row shows the farm's capacity and nothing else. */
  function paintRow(row: Row, farm: FarmNow, mode: Mode, maxCapacityMW: number, read: boolean) {
    // No reading: drawn like a silent farm (an empty track, "—"), but its dot
    // says unknown, not silent.
    const silent = !read || (farm.unitsDeclaring === 0 && farm.declaredMW <= 0);
    const held = farm.curtailedMW > 0;

    setText(row.name, farm.farm);
    setAttr(row.dot, 'data-state', farmStateOf(read ? farm : null));

    // Strictly proportional (Owen): the track is the farm's capacity against
    // the largest farm's, and the runs inside it are MW on the grid and MW
    // held back against that capacity. What is left of the track is idle
    // capacity — no wind behind it — so a silent farm is all track. (The big
    // bar above measures against declared output instead, per 026; the rows
    // answer a different question: how much of each farm is working.)
    const capacity = Math.max(0, farm.capacityMW);
    const pctOf = (mw: number, of: number) => (of > 0 ? Math.min(100, Math.max(0, (mw / of) * 100)) : 0);
    row.barTrack.style.width = `${pctOf(capacity, maxCapacityMW)}%`;
    let onPct = silent ? 0 : pctOf(farm.instructedMW, capacity);
    let heldPct = silent ? 0 : pctOf(farm.curtailedMW, capacity);
    if (onPct + heldPct > 100) {
      // A reading over capacity is scaled back to fit, never drawn past the track.
      const scale = 100 / (onPct + heldPct);
      onPct *= scale;
      heldPct *= scale;
    }
    row.barOn.style.width = `${onPct}%`;
    row.barHeld.style.width = `${heldPct}%`;

    // Both figures left of the mini-bar, in the bar's order and colours (Owen):
    // "166 / 584 MW" — on the grid, then held back. A farm with nothing held
    // back reads just "342 MW": a held-back figure only where there is one.
    const onGrid = onGridFigure(farm.instructedMW, held);
    const heldMW = heldOf(farm);
    const heldText = heldMW.toLocaleString('en-GB');
    if (silent) {
      row.on.replaceChildren('—');
    } else if (heldMW > 0) {
      row.on.replaceChildren(
        el('span', { class: 'source-row__mw-on', text: onGrid }),
        el('span', { class: 'source-row__mw-sep', text: ' / ' }),
        el('span', { class: 'source-row__mw-held', text: heldText }),
        ' MW'
      );
    } else {
      row.on.replaceChildren(el('span', { class: 'source-row__mw-on', text: onGrid }), ' MW');
    }

    row.button.setAttribute(
      'aria-label',
      !read
        ? `${farm.farm}: ${formatMW(capacity)} installed, no reading this half-hour`
        : silent
        ? `${farm.farm}: no declaration this half-hour`
        : mode === 'held'
          ? `${farm.farm}: ${onGrid} MW on the grid, ${heldText} MW held back`
          : `${farm.farm}: ${onGrid} MW on the grid of ${formatMW(farm.declaredMW)}`
    );
  }

  /**
   * The label column is as wide as the longest label in the whole list — every
   * farm, shown or not — so the mini-bars all start at one edge and share one
   * width, flexing into whatever the column leaves (Owen). Measured on a
   * hidden copy of a row's label, so the page's own fonts and CSS decide the
   * width (a canvas measurement ran a pixel or two short of Eczar as the page
   * sets it, and clipped the longest name).
   */
  const measureName = el('span', { class: 'source-row__name' });
  const measurer = el(
    'span',
    {
      class: 'source-row__label',
      'aria-hidden': 'true',
      style: 'position:absolute;visibility:hidden;pointer-events:none;width:max-content;overflow:visible',
    },
    measureName
  );
  root.append(measurer);
  // Likewise the figures' column: as wide as the widest figures in the list,
  // so every bar starts at one edge.
  const figureMeasurer = el('span', {
    class: 'source-row__mw',
    'aria-hidden': 'true',
    style: 'position:absolute;visibility:hidden;pointer-events:none;width:max-content',
  });
  root.append(figureMeasurer);
  function measureLabels() {
    let widest = 0;
    let widestFigures = 0;
    for (const row of rows.values()) {
      setText(measureName, row.name.textContent ?? '');
      widest = Math.max(widest, measurer.getBoundingClientRect().width);
      setText(figureMeasurer, row.on.textContent ?? '');
      widestFigures = Math.max(widestFigures, figureMeasurer.getBoundingClientRect().width);
    }
    if (widest > 0) list.style.setProperty('--source-label-w', `${Math.ceil(widest)}px`);
    if (widestFigures > 0) list.style.setProperty('--source-figures-w', `${Math.ceil(widestFigures)}px`);
  }
  void document.fonts?.ready.then(measureLabels);

  /** Show the first `count` rows and keep the control's label honest. */
  function layout() {
    const isOpen = opened ?? !closedByDefault();
    body.hidden = !isOpen;
    open.setAttribute('aria-expanded', String(isOpen));
    setText(openText, isOpen ? 'Hide wind farms' : 'Show wind farms');

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
    collapse.hidden = count <= initial;
    moreItem.hidden = more.hidden && collapse.hidden;
    setText(moreText, 'Show more');
    return count;
  }

  more.addEventListener('click', () => {
    const before = Math.min(order.length, shown ?? initialCount(list));
    shown = Math.min(order.length, before + BATCH);
    layout();
    // Carry on from where the list grew.
    rows.get(order[before])?.button.focus();
    enterRows(before);
    const added = shown - before;
    setText(status, added === 1 ? '1 more farm shown.' : `${added} more farms shown.`);
  });

  open.addEventListener('click', () => {
    const wasOpen = opened ?? !closedByDefault();
    opened = !wasOpen;
    shown = null;
    layout();
    // Closing the list lets go of a farm picked out in it.
    if (!opened && selectedFarm !== null) select(null);
    if (opened) enterRows();
    setText(status, opened ? 'Farm list shown.' : 'Farm list hidden.');
  });

  collapse.addEventListener('click', () => {
    shown = null;
    const count = layout();
    // A selected farm whose row has just been folded away has nothing left to
    // show for it in the list; let go of it.
    if (selectedFarm !== null && order.indexOf(selectedFarm) >= count) select(null);
    // Focus was on a control that's now hidden, or a row that is; put it on
    // "Show more", and keep that on screen.
    more.focus({ preventScroll: true });
    more.scrollIntoView({ block: 'nearest' });
    setText(status, 'Farm list collapsed.');
  });

  // The first count (7 or 5) and the list's default open/closed follow the
  // layout until the reader asks otherwise.
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

      const now = data?.now ?? null;
      const read = now !== null;
      // With no reading (waiting, offline) the bar, its installed figure, the
      // toggle and the farm list all stay (Owen): capacity needs no reading
      // (farmCapacity.ts). The runs are empty, the legend goes, and every
      // farm's dot says unknown.
      setAttr(root, 'data-state', read ? 'ok' : state.pending ? 'pending' : 'failed');

      let mode: Mode;
      let farms: FarmNow[];
      if (now) {
        const reading = readOnGrid(now);
        setText(onLegend.figure, reading.onGridLabel);
        setText(heldLegend.figure, reading.heldLabel);
        setText(installed, `${formatMW(reading.capacityMW)} installed`);
        // With nothing held back, "0 MW held back" says nothing the headline
        // hasn't, so it goes — and the rows drop their held-back figures
        // (map.css, data-mode="on"). The bar stays: against capacity it is
        // still on the grid against idle.
        heldLegend.item.hidden = reading.allClear;

        // The runs, as shares of capacity. A held-back run is never drawn
        // narrower than 4px while anything is held back, so a small but real
        // figure never disappears between the navy and the idle track.
        const share = (mw: number) =>
          reading.capacityMW > 0 ? Math.min(100, Math.max(0, (mw / reading.capacityMW) * 100)) : 0;
        shareOn.style.width = `${share(reading.instructedMW)}%`;
        shareHeld.style.width = reading.allClear ? '0%' : `max(4px, ${share(reading.heldMW)}%)`;
        mode = reading.allClear ? 'on' : 'held';
        farms = [...now.farms];
      } else {
        // Nothing drawn in the bar, so no legend for it (Owen).
        setText(installed, `${formatMW(INSTALLED_MW)} installed`);
        shareOn.style.width = '0%';
        shareHeld.style.width = '0%';
        mode = 'held';
        farms = UNREAD_FARMS;
      }

      // The legend fades up whenever it (re)appears, not only on first load —
      // a page that opened on "waiting" gets it when the reading lands.
      if (read && labels.hidden && arrived) enter([...labels.children] as HTMLElement[]);
      labels.hidden = !read;
      setAttr(root, 'data-mode', mode);
      farms.sort(byListOrder);
      const maxCapacityMW = farms.reduce((max, f) => Math.max(max, f.capacityMW), 0);
      const present = new Set(farms.map((f) => f.farm));
      for (const [name, row] of rows) {
        if (present.has(name)) continue;
        row.item.remove();
        rows.delete(name);
        if (selectedFarm === name) select(null);
      }

      for (const farm of farms) {
        let row = rows.get(farm.farm);
        if (!row) {
          row = makeRow(farm.farm);
          rows.set(farm.farm, row);
          if (farm.farm === selectedFarm) row.button.setAttribute('aria-pressed', 'true');
        }
        paintRow(row, farm, mode, maxCapacityMW, read);
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

      // Arrival: the bar grows in from the left, its legend and the installed
      // figure fade up, and the rows cascade in beneath. Later readings don't
      // replay it — the bars slide to their new widths instead (map.css).
      if (!arrived) {
        arrived = true;
        enter([shareFill]);
        enter([...labels.children, installed] as HTMLElement[]);
        enterRows();
      }
    },
  };
}
