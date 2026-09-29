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
 * says what holding the wind back is costing (DECISIONS 052): "Holding it back
 * today alone will add about £4.51m to electricity bills in Great Britain."
 * (Owen's wording), the figure a counter that ticks up through the day (see
 * costAt). "Will add": the costs reach bills later. "Today alone": one day of
 * something that keeps happening, without claiming how often. Electricity, and Great Britain: the balancing
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

/** How far past the last settled half hour the cost counter may count on at the current rate. */
const PROJECT_HOURS = 2;
/** How often the counter is redrawn; it only changes on screen when it passes another £10,000. */
const COUNTER_TICK_MS = 5_000;

export function mapHeadlineView(): View {
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
    tail,
    costLead,
    costFigure,
    costTail
  );

  /**
   * The running cost, as a counter (Owen): the settled estimate up to the last
   * half hour Elexon has settled, counted on from there at the current rate —
   * the megawatts held back right now (the live reading) × today's average
   * cost per MWh held back — for at most PROJECT_HOURS, so an Elexon outage
   * can't run it away. Nothing held back now: it holds still. It never counts
   * down: when a settled total lands below what's shown, it waits for the
   * count to catch up. Null: no estimate for today (London), or not above zero.
   */
  let counterDate = '';
  let counterPounds = 0;
  function costAt(state: AppState, at: Date): number | null {
    const today = state.cost?.cost;
    const date = settlementAt(at).date;
    if (!today || today.date !== date || !(today.estimatePounds > 0)) return null;
    const reading = state.curtailment?.now;
    const live =
      reading && speaksOfNow(state.curtailment?.fetchedAt, reading.settlement, at) ? reading.curtailedMW : 0;
    const perMWh = today.heldBackMWh > 0 ? today.estimatePounds / today.heldBackMWh : 0;
    const hours = Math.min(PROJECT_HOURS, Math.max(0, (at.getTime() - Date.parse(today.throughTime)) / 3_600_000));
    if (counterDate !== date) {
      counterDate = date;
      counterPounds = 0;
    }
    counterPounds = Math.max(counterPounds, today.estimatePounds + live * hours * perMWh);
    return counterPounds;
  }

  /** Which cost sentence the headline carries, set by update(); the tick redraws it. */
  let costMode: 'off' | 'today' | 'earlier' = 'off';
  let lastState: AppState | null = null;
  function drawCost() {
    const pounds = lastState && costMode !== 'off' ? costAt(lastState, new Date()) : null;
    if (pounds === null) return setCost('');
    const figureText = formatPoundsCounter(pounds);
    if (costMode === 'today') {
      setCost(' Holding it back today alone will add about ', figureText, ' to electricity bills in Great Britain.');
    } else {
      setCost(' Holding it back earlier today will add about ', figureText, ' to electricity bills in Great Britain.');
    }
  }
  setInterval(drawCost, COUNTER_TICK_MS);

  const root = el(
    'section',
    { class: 'map-headline', 'data-state': 'ok', 'aria-labelledby': 'map-headline-sentence' },
    sentence
  );

  return {
    el: root,
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
