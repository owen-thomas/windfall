/**
 * The map's headline (Windfall_Map_Spec.md §3 Part A.2, DECISIONS 026, re-cut
 * for the Figma frames in Windfall_Map_Spec_4b.md / DECISIONS 028, turned over
 * by 4c and back again by Windfall_Map_Spec_4d.md): one sentence, the largest
 * and heaviest type on the page, the page's whole argument — not
 * `../../view/headline.ts`'s three-part eyebrow/figure/predicate stack, which
 * `/` still uses unchanged.
 *
 * 4c said how much wind was *on* the grid ("83% … on the grid"), which left the
 * story — the wind that can't get south — as an unlabelled stub on the bar. 4d
 * leads with what is held back: "At least 17% of Scotland's tracked wind is
 * currently being held back from the grid." The share is floored
 * (`formatPctFloor`), so "at least" can never overstate it. Three edge cases:
 *
 * - Nothing held back: "100% of Scotland's tracked wind is currently on the
 *   grid." (Owen), the figure in the display ink, not the held-back blue.
 * - Something held back, but under 1%: the floored share would read "0%", so the
 *   sentence switches to the floored megawatts ("At least 45 MW of …").
 * - Under a megawatt: "Under 1 MW of …" — true, where "at least 0 MW" is not a
 *   claim at all.
 *
 * The number is `../onGrid.ts`'s reading of the one payload, which the bar and
 * the source list (./sources.ts) read too, so none of the three can disagree.
 * What the figure cannot say — that real curtailment is probably higher — is
 * said in the method disclosure (./settlement.ts).
 *
 * The bar-and-list block and the settlement disclosure are appended here by
 * main.ts — the frame's order: sentence, bar, list, settlement row, method.
 */

import { el, setAttr, setTextCrossfade, type View } from '../../view/dom';
import { formatMWFloor, formatPctFloor } from '../../lib/format';
import { speaksOfNow, type AppState } from '../../lib/state';
import { readOnGrid } from '../onGrid';

export function mapHeadlineView(): View {
  const lead = el('span', { class: 'map-headline__lead' });
  const figure = el('strong', { class: 'map-headline__figure' });
  const tail = el('span', { class: 'map-headline__tail' });
  // The page's <h1> (4d): the sentence is what the page is about.
  const sentence = el(
    'h1',
    { class: 'map-headline__sentence', id: 'map-headline-sentence' },
    lead,
    figure,
    tail
  );

  const root = el(
    'section',
    { class: 'map-headline', 'data-state': 'ok', 'aria-labelledby': 'map-headline-sentence' },
    sentence
  );

  return {
    el: root,
    update(state: AppState) {
      const data = state.curtailment;
      const present = speaksOfNow(data?.fetchedAt, data?.now?.settlement, state.now);

      if (!data?.now && state.pending) {
        setAttr(root, 'data-state', 'pending');
        setTextCrossfade(lead, '');
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
        setTextCrossfade(lead, '');
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

      if (reading.allClear) {
        setAttr(root, 'data-state', 'none');
        setTextCrossfade(lead, '');
        setTextCrossfade(figure, '100%');
        setTextCrossfade(
          tail,
          present
            ? ' of Scotland’s tracked wind is currently on the grid.'
            : ' of Scotland’s tracked wind was on the grid when this was last read.'
        );
        return;
      }

      setAttr(root, 'data-state', 'curtailing');
      let figureText: string;
      if (reading.heldPct >= 1) figureText = formatPctFloor(reading.heldPct);
      else if (reading.heldMW >= 1) figureText = formatMWFloor(reading.heldMW);
      else figureText = '1 MW';
      setTextCrossfade(lead, reading.heldMW >= 1 ? 'At least ' : 'Under ');
      setTextCrossfade(figure, figureText);
      setTextCrossfade(
        tail,
        present
          ? ' of Scotland’s tracked wind is currently being held back from the grid.'
          : ' of Scotland’s tracked wind was being held back from the grid when this was last read.'
      );
    },
  };
}
