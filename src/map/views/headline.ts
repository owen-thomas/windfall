/**
 * The map's headline (Windfall_Map_Spec.md §3 Part A.2, DECISIONS 026, re-cut
 * for the Figma frames in Windfall_Map_Spec_4b.md / DECISIONS 028, turned over
 * by Windfall_Map_Spec_4c.md §4c.2 / DECISIONS 029): one sentence, the largest
 * and heaviest type on the page, the page's whole argument — not
 * `../../view/headline.ts`'s three-part eyebrow/figure/predicate stack, which
 * `/` still uses unchanged.
 *
 * Step 4c reversed the frame. Through 4b the sentence said how much wind was
 * held *off* the grid ("At least 2,049 MW of Scotland's tracked wind is
 * currently being held off the grid."); it now says how much is *on* it —
 * "83% of Scotland's tracked wind is currently on the grid." The number is
 * `../onGrid.ts`'s reading of the one payload, which the breakdown bar and the
 * source list beneath it (./sources.ts, 4c.3) read too, so none of the three
 * can disagree; that file has the rounding rules. Here: the percentage is
 * `formatPctFloor`, there is no "Up to" hedge, and what the figure cannot say —
 * that Windfall counts only instructed turn-downs, so real curtailment may be
 * higher and the true on-grid share a little lower — is said in the page's one
 * explanation, not here.
 *
 * The settlement-period row is seated in `.map-headline__meta` by main.ts, and
 * the bar-and-list disclosure is appended after it (4c.4 moves the row below
 * the list, as the frame has it).
 */

import { el, setAttr, setTextCrossfade, type View } from '../../view/dom';
import { formatMWh, formatPctFloor, formatPeriodSpan } from '../../lib/format';
import type { CurtailmentResponse } from '../../lib/types';
import { speaksOfNow, type AppState } from '../../lib/state';
import { readOnGrid } from '../onGrid';

export function mapHeadlineView(): View {
  const figure = el('strong', { class: 'map-headline__figure' });
  const tail = el('span', { class: 'map-headline__tail' });
  const sentence = el(
    'p',
    { class: 'map-headline__sentence', id: 'map-headline-sentence' },
    figure,
    tail
  );

  // Where main.ts seats the settlement-period / "Read N ago" row. That row is
  // rendered and kept fresh by the masthead view (its freshness and notice
  // rules are the masthead's, 010/016/017), but the Figma frames put it here,
  // between the sentence and the bar.
  const meta = el('div', { class: 'map-headline__meta' });

  const root = el(
    'section',
    { class: 'map-headline', 'data-state': 'ok', 'aria-labelledby': 'map-headline-sentence' },
    sentence,
    meta
  );

  return {
    el: root,
    update(state: AppState) {
      const data = state.curtailment;
      const present = speaksOfNow(data?.fetchedAt, data?.now?.settlement, state.now);

      if (!data?.now && state.pending) {
        setAttr(root, 'data-state', 'pending');
        setTextCrossfade(figure, 'Reading.');
        setTextCrossfade(
          tail,
          ' Windfall is asking Elexon what is being held down this half-hour. Nothing is claimed ' +
            'until it answers.'
        );
        return;
      }

      if (!data || !data.now) {
        setAttr(root, 'data-state', 'failed');
        setTextCrossfade(figure, 'Unavailable.');
        setTextCrossfade(
          tail,
          state.curtailmentError
            ? ' Windfall could not reach its own reading of the balancing mechanism.'
            : ' Elexon’s balancing data did not answer this time. The generation mix above is unaffected.'
        );
        return;
      }

      const reading = readOnGrid(data.now);

      setAttr(root, 'data-state', reading.allClear ? 'none' : 'curtailing');
      setTextCrossfade(figure, reading.allClear ? '100%' : formatPctFloor(reading.pct));
      setTextCrossfade(
        tail,
        present
          ? ' of Scotland’s tracked wind is currently on the grid.'
          : ' of Scotland’s tracked wind was on the grid when this was last read.'
      );
    },
  };
}

/** Exposed for the method note (main.ts) and the swatch plate — the same settled-period line ../../view/headline.ts used to show on-screen, moved to the method note per 026. */
export function settledLine(data: CurtailmentResponse | null): string {
  if (!data?.settled) return '';
  const { curtailedMWh, settlement } = data.settled;
  const span = formatPeriodSpan(settlement.periodStart, settlement.periodEnd);
  if (curtailedMWh <= 0) return `Nothing in the last complete half-hour either, ${span}.`;
  return `${formatMWh(curtailedMWh)} over the last complete half-hour, ${span}.`;
}
