/**
 * The bar and its source list (Windfall_Map_Spec_4c.md §4c.3, DECISIONS 029):
 * one native `<details>`, the breakdown bar (with its chevron) as the
 * `<summary>` and the tracked farms as its content.
 *
 * The bar reads "10,971 of 13,105 MW", the on-grid run navy and the rest of the
 * declared output the lighter blue. Under it, the tracked farms, largest
 * *declared* output first, top eight to start with and a control that reveals
 * the rest. Sorted by declared output and not by curtailment so the order does
 * not reshuffle every refresh as farms are switched down and back up (a farm's
 * declared output moves far less than what is asked of it). Every number here
 * is `../onGrid.ts`'s reading of the one payload, the same one the headline
 * sentence reads, so the sentence, the bar and the rows cannot disagree.
 *
 * Each row is a button: a dot, the farm's name and windspeed, a 64px mini-bar
 * filled to that farm's on-grid share (`instructedMW / declaredMW`, the same
 * quantity the big bar shows for Scotland as a whole — the bar alone carries
 * it, so there is no percentage in the row), and the farm's on-grid megawatts.
 * Selecting a row hands the farm to `onSelect`, which lights it on the map
 * (main.ts wires the particles and the markers); the selection is single, and
 * is cleared by selecting the row again, by a click anywhere outside the
 * list, by Escape, or by closing the disclosure.
 *
 * Windspeed (map step 4c.5) is `state.windspeed`, an independent feed
 * (client.ts's `fetchWindspeed`, Open-Meteo, DECISIONS 029) that can land
 * after everything else, or not at all, without holding up or blanking a
 * row: a farm with no reading for it — feed down, still loading, or a
 * coordinate Open-Meteo couldn't serve — renders without the "≋ N km/h"
 * clause, never a zero or a guess.
 *
 * Whether the disclosure starts open (desktop) or shut (mobile) is main.ts's to
 * decide from the layout tier; this view only owns what open and shut mean.
 *
 * Honesty at the edges:
 * - A farm that declares nothing (`unitsDeclaring` 0) is *silent*: hollow
 *   dashed dot (as its map marker is), no share, and "—" for its megawatts. It
 *   is never drawn as an assumed zero.
 * - A farm that declares exactly 0 MW has said so, and reads "0 MW" — but it has
 *   no on-grid *share* (nothing to divide), so its bar is a plain grey rail: a
 *   full lighter bar would read as "all of it held down".
 * - With no reading (pending, failed) the bar is an empty gauge and the list and
 *   chevron are not offered.
 */

import { el, setAttr, setText, type View } from '../../view/dom';
import type { AppState } from '../../lib/state';
import type { FarmNow } from '../../lib/types';
import { formatMW, formatWindspeed } from '../../lib/format';
import { onGridFigure, readOnGrid } from '../onGrid';

/** How many farms show before "and N more…". */
const SHOWN = 8;

export interface SourcesOptions {
  /** A farm was selected, or (null) the selection was cleared. */
  onSelect(farm: string | null): void;
}

export interface SourcesView extends View {
  el: HTMLDetailsElement;
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
  mw: HTMLElement;
}

/** Largest declared output first; ties by name, so the order is stable. */
function byDeclared(a: FarmNow, b: FarmNow): number {
  return b.declaredMW - a.declaredMW || a.farm.localeCompare(b.farm);
}

export function mapSourcesView(options: SourcesOptions): SourcesView {
  // --- The summary: the bar, its plain sentence, the chevron -------------------
  const shareFill = el('div', { class: 'share__fill' });
  const shareLabel = el('span', { class: 'share__label' });
  const shareBar = el('div', { class: 'share', 'aria-hidden': 'true' }, shareFill, shareLabel);
  // The bar is aria-hidden, so this is what names the summary for a screen
  // reader: the reading, and what opening it gives.
  const sentence = el('span', { class: 'map-sources__sr' });
  const chevron = el('span', { class: 'map-sources__chevron', 'aria-hidden': 'true' });
  const summary = el('summary', { class: 'map-sources__summary' }, shareBar, sentence, chevron);

  // --- The body: the rows, and the control that reveals the rest -----------------
  const list = el('ul', { class: 'map-sources__list' });
  const moreDot = el('span', { class: 'source-row__dot source-row__dot--hollow', 'aria-hidden': 'true' });
  const moreText = el('span', { class: 'map-sources__more-text' });
  const more = el(
    'button',
    { class: 'map-sources__more', type: 'button', 'aria-expanded': 'false', hidden: true },
    moreDot,
    moreText
  );
  const body = el('div', { class: 'map-sources__body' }, list, more);

  const root = el('details', { class: 'map-sources', 'data-state': 'pending' }, summary, body);

  const rows = new Map<string, Row>();
  let order: string[] = [];
  let expanded = false;
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
    const mw = el('span', { class: 'source-row__mw' });
    const button = el(
      'button',
      { class: 'source-row', type: 'button', 'aria-pressed': 'false', 'data-farm': farm },
      dot,
      label,
      bar,
      mw
    );
    button.addEventListener('click', () => select(selectedFarm === farm ? null : farm));
    const item = el('li', { class: 'map-sources__item' }, button);
    return { farm, item, button, dot, name, windspeed, bar, barFill, mw };
  }

  function paintRow(row: Row, farm: FarmNow, kmh: number | undefined) {
    const silent = farm.unitsDeclaring === 0 && farm.declaredMW <= 0;
    const held = farm.curtailedMW > 0;
    setText(row.name, farm.farm);
    setAttr(row.dot, 'data-state', silent ? 'silent' : 'declaring');

    // The glyph is decorative (aria-hidden); the reading itself is folded
    // into the row's aria-label below, so nothing here needs its own.
    if (kmh === undefined) {
      row.windspeed.replaceChildren();
    } else {
      row.windspeed.replaceChildren(
        el('span', { 'aria-hidden': 'true', text: '≋' }),
        ` ${formatWindspeed(kmh)}`
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

    const onGrid = onGridFigure(farm.instructedMW, held);
    setText(row.mw, silent ? '—' : `${onGrid} MW`);
    const windLabel = kmh === undefined ? '' : `, ${formatWindspeed(kmh)}`;
    row.button.setAttribute(
      'aria-label',
      silent
        ? `${farm.farm}: no declaration this half-hour${windLabel}`
        : `${farm.farm}: ${onGrid} MW on the grid of ${formatMW(farm.declaredMW)}${windLabel}`
    );
  }

  function setExpanded(next: boolean) {
    expanded = next;
    more.setAttribute('aria-expanded', String(next));
    layout();
    // A selected farm whose row has just been folded away has nothing left to
    // show for it in the list; let go of it.
    if (!next && selectedFarm !== null && order.indexOf(selectedFarm) >= SHOWN) select(null);
  }

  /** Show the first SHOWN rows, or all of them; keep the "and N more…" control honest. */
  function layout() {
    order.forEach((farm, i) => {
      const row = rows.get(farm);
      if (row) row.item.hidden = !expanded && i >= SHOWN;
    });
    const rest = order.length - SHOWN;
    more.hidden = rest <= 0;
    setText(moreText, expanded ? 'Show fewer' : `and ${rest} more…`);
  }

  more.addEventListener('click', () => setExpanded(!expanded));

  // The selection lives in the list: close the disclosure, or click anywhere
  // else, or press Escape, and it goes. A click inside the list (a row, or the
  // "and N more…" control) does not.
  root.addEventListener('toggle', () => {
    if (!root.open) select(null);
  });
  summary.addEventListener('click', (event) => {
    // No reading, nothing to open.
    if (root.dataset.state !== 'ok') event.preventDefault();
  });
  document.addEventListener('click', (event) => {
    if (selectedFarm !== null && !body.contains(event.target as Node)) select(null);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && selectedFarm !== null) select(null);
  });

  function setBar(pct: number, label: string | null, plain: string) {
    shareFill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    setText(shareLabel, label ?? '');
    setText(sentence, plain);
  }

  return {
    el: root,
    selected: () => selectedFarm,
    select,
    update(state: AppState) {
      const data = state.curtailment;

      if (!data?.now) {
        // The bar says nothing until there is something to say: no label, an
        // empty gauge, and no list. (`open` is left alone, so a desktop that
        // starts open is still open when the reading lands.)
        setAttr(root, 'data-state', state.pending ? 'pending' : 'failed');
        setBar(0, null, '');
        if (selectedFarm !== null) select(null);
        return;
      }

      setAttr(root, 'data-state', 'ok');
      const reading = readOnGrid(data.now);
      setBar(reading.pct, reading.label, `${reading.sentence} The farms behind it, largest first.`);

      const farms = [...data.now.farms].sort(byDeclared);
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
        paintRow(row, farm, speeds?.[farm.farm]);
      }

      // Re-seat the rows only when the order actually changed, so a refresh
      // that moves nothing never touches the DOM (and keyboard focus stays put).
      const next = farms.map((f) => f.farm);
      if (next.length !== order.length || next.some((farm, i) => farm !== order[i])) {
        const focused = document.activeElement;
        list.append(...next.map((farm) => rows.get(farm)!.item));
        if (focused instanceof HTMLElement && list.contains(focused)) focused.focus();
        order = next;
      }
      layout();
    },
  };
}
