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
 * When there's an estimate for today (London) above zero, a second sentence
 * says what holding the wind back is costing (DECISIONS 052), the settled
 * estimate so far (see costAt). When some of it is the gas that replaced the
 * wind and the reading is current, the gas opens the cost headline, over the
 * timeline that shows it (DECISIONS 054, 055, Owen): "At least 68% of
 * Scotland's tracked wind is being held back from the grid right now." then
 * (the half hour, against the cost's "so far today", Owen) "Gas is
 * being burned instead. So far today, that's about £10.51m added
 * to Great Britain's electricity bills." With nothing held back now: "Earlier today, holding it back and
 * burning gas in its place meant about £X added to …". The cost is its own
 * headline over the cost timeline (costBlock, views/cost.ts). "So far today"
 * (was "Today alone … will add"): the figure is the day to date, not a
 * forecast of where it ends up at midnight (Owen); "added to" says where the
 * cost goes without saying bills have already gone up. Electricity, and Great Britain: the balancing
 * charge is levied on electricity, and Northern Ireland is a separate market.
 * "Adding to bills" says where the cost ends up, not when; the method says the
 * charge is set in advance, so today's costs show up in later bills. The
 * estimate is from /api/cost, explained in the method. Without one, the
 * headline is the sentence it was.
 *
 * The bar-and-list block and the settlement disclosure are appended here by
 * main.ts — the frame's order: sentence, bar, list, settlement row, method.
 */

import { el, setAttr, setTextCrossfade, type View } from '../../view/dom';
import { formatMWFloor, formatPctFloor, formatPoundsCounter, formatTime } from '../../lib/format';
import { settlementAt } from '../../lib/settlement';
import { speaksOfNow, type AppState } from '../../lib/state';
import { readOnGrid } from '../onGrid';

export interface MapHeadlineView extends View {
  /**
   * The cost, its own headline over its own bar (DECISIONS 055): a section
   * holding the cost sentence, hidden while there's no estimate for today.
   * main.ts appends the cost bar and its method (views/cost.ts) to it.
   */
  costBlock: HTMLElement;
}

export function mapHeadlineView(): MapHeadlineView {
  const lead = el('span', { class: 'map-headline__lead' });
  const figure = el('strong', { class: 'map-headline__figure' });
  const tail = el('span', { class: 'map-headline__tail' });
  // The cost clause, figure set like the share: same weight, but the sentence's
  // own ink, not the held-back blue (Owen).
  const costLead = el('span', { class: 'map-headline__cost' });
  const costFigure = el('strong', { class: 'map-headline__cost-figure' });
  const costTail = el('span', { class: 'map-headline__cost' });
  function setCost(leadText: string, figureText = '', tailText = '') {
    setTextCrossfade(costLead, leadText);
    setTextCrossfade(costFigure, figureText);
    setTextCrossfade(costTail, tailText);
  }
  // The page's <h1> (4d): the sentence is what the page is about.
  const sentence = el(
    'h1',
    { class: 'map-headline__sentence', id: 'map-headline-sentence' },
    lead,
    figure,
    tail
  );
  // The second headline, the same size as the first (Owen): an <h2>, since it
  // follows from the first. Its text keeps the leading space the one-sentence
  // form needed; the trim is harmless.
  const costSentence = el(
    'h2',
    { class: 'map-headline__sentence map-headline__sentence--cost', id: 'map-cost-sentence' },
    costLead,
    costFigure,
    costTail
  );
  const costBlock = el('section', { class: 'map-headline__block', 'aria-labelledby': 'map-cost-sentence' }, costSentence);
  costBlock.hidden = true;

  /**
   * Today's settled estimate, up to the last half hour Elexon has settled — the
   * same figure the cost timeline's legend adds up to (DECISIONS 055: the
   * counter that counted on at the current rate is gone, Owen). Null: no
   * estimate for today (London), or not above zero.
   */
  function costAt(state: AppState): number | null {
    const today = state.cost?.cost;
    if (!today || today.date !== settlementAt(state.now).date || !(today.estimatePounds > 0)) return null;
    return today.estimatePounds;
  }

  /**
   * Some of today's settled estimate is the replacement: held-back energy
   * priced at flagged offers from outside Scotland, almost all gas (DECISIONS
   * 052). Read from each day's split, never assumed.
   */
  function gasPaid(state: AppState | null): boolean {
    const today = state?.cost?.cost;
    if (!today || today.date !== settlementAt(new Date()).date) return false;
    return today.replacementPounds > 0;
  }

  /** Which cost sentence the headline carries, set by update(). */
  let costMode: 'off' | 'today' | 'earlier' = 'off';
  /** Whether the cost headline opens with the gas sentence, set by update(). */
  let gasNow = false;
  let lastState: AppState | null = null;
  function drawCost() {
    const pounds = lastState && costMode !== 'off' ? costAt(lastState) : null;
    costBlock.hidden = pounds === null;
    if (pounds === null) return setCost('');
    const figureText = formatPoundsCounter(pounds);
    // The gas opens the cost headline, over the timeline that shows it
    // (Owen): "Gas is being burned instead." "That" is the holding back and the gas together, loosely;
    // the legend splits them. With nothing held back now, the first headline
    // is about the wind on the grid, so this one names what it refers to.
    const tail = ' added to Great Britain’s electricity bills.';
    if (costMode === 'today') {
      const lead = gasNow ? 'Gas is being burned instead. So far today, that’s about ' : 'So far today, that’s about ';
      return setCost(lead, figureText, tail);
    }
    const gas = gasPaid(lastState) ? ' and burning gas in its place' : '';
    setCost(`Earlier today, holding it back${gas} meant about `, figureText, tail);
  }

  const root = el(
    'section',
    { class: 'map-headline', 'data-state': 'ok', 'aria-labelledby': 'map-headline-sentence' },
    sentence
  );

  return {
    el: root,
    costBlock,
    update(state: AppState) {
      lastState = state;
      const data = state.curtailment;
      const present = speaksOfNow(data?.fetchedAt, data?.now?.settlement, state.now);

      if (!data?.now && state.pending) {
        // 4d copy (Owen): one plain sentence in the page's own voice, no bold
        // "Reading." lead in a different colour.
        setAttr(root, 'data-state', 'pending');
        setTextCrossfade(lead, '');
        setTextCrossfade(figure, '');
        setTextCrossfade(tail, 'We’re asking Elexon how much of Scotland’s wind is being held back this half hour.');
        costMode = 'off';
        setCost('');
        return;
      }

      if (!data || !data.now) {
        setAttr(root, 'data-state', 'failed');
        setTextCrossfade(lead, '');
        setTextCrossfade(figure, '');
        setTextCrossfade(
          tail,
          state.curtailmentError
            ? 'We can’t reach our data right now, so there are no figures for this half hour.'
            : 'Elexon hasn’t sent this half hour’s switch-offs yet. The grid mix on the map is unaffected.'
        );
        costMode = 'off';
        setCost('');
        return;
      }

      const reading = readOnGrid(data.now);
      // An old reading names its own half hour rather than "when this was last
      // read" (Owen): "… between 13:30 and 14:00."
      const when = `between ${formatTime(data.now.settlement.periodStart)} and ${formatTime(data.now.settlement.periodEnd)}`;

      if (reading.allClear) {
        setAttr(root, 'data-state', 'none');
        setTextCrossfade(lead, '');
        setTextCrossfade(figure, '100%');
        setTextCrossfade(
          tail,
          present
            ? ' of Scotland’s tracked wind is currently on the grid.'
            : ` of Scotland’s tracked wind was on the grid ${when}.`
        );
        costMode = 'earlier';
        drawCost();
        return;
      }

      setAttr(root, 'data-state', 'curtailing');
      gasNow = present && gasPaid(state);
      let figureText: string;
      if (reading.heldPct >= 1) figureText = formatPctFloor(reading.heldPct);
      else if (reading.heldMW >= 1) figureText = formatMWFloor(reading.heldMW);
      else figureText = '1 MW';
      setTextCrossfade(lead, reading.heldMW >= 1 ? 'At least ' : 'Under ');
      setTextCrossfade(figure, figureText);
      setTextCrossfade(
        tail,
        present
          ? ' of Scotland’s tracked wind is being held back from the grid right now.'
          : ` of Scotland’s tracked wind was held back from the grid ${when}.`
      );
      // Its own sentence, the act as its subject: as one sentence ("…from the
      // grid, adding £4.2m … so far today") it read as the cost of the current
      // hold-up rather than the day's running total (Owen).
      costMode = 'today';
      drawCost();
    },
  };
}
