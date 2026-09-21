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
 * "83% of Scotland's tracked wind is currently on the grid." — and the bar
 * beneath it reads "10,971 of 13,105 MW", the on-grid run navy and the rest of
 * the declared output the lighter blue. All of it comes from the one payload:
 * `curtailedMW` is `curtailment.now.curtailedMW`, `declaredMW` the sum of
 * `curtailment.now.farms[].declaredMW`, and `instructedMW` is their difference
 * (the same quantity each farm's own `instructedMW` is, which the source list
 * draws per farm). The denominator is still declared output, never installed
 * capacity (026's reasoning: capacity counts every farm idle for lack of wind,
 * which understates the share on a windy day). The sentence, the bar's fill
 * and the bar's label all read those same numbers, so they can never disagree.
 *
 * Rounding is always down, the same conservative principle the old "at least"
 * framing used, applied to the new number: the percentage is `formatPctFloor`,
 * so the bare figure can never overstate how much wind is getting through, and
 * the label's on-grid megawatts are floored too while anything is held down, so
 * they too can only err low. (One corner stays: when under a megawatt is held
 * down, the label is exact at megawatt resolution — "5,363 of 5,363 MW" — while
 * the floored percentage reads 99%. Both are true of a 99.99% share.) When
 * nothing is held down the figures are equal and rounded alike. There is no
 * "Up to" hedge. What the figure cannot say — that Windfall counts only
 * instructed turn-downs, so real curtailment may be higher and the true
 * on-grid share a little lower — is said in the page's one explanation, not
 * here.
 *
 * The line that used to sit under the bar is not on the screen — the headline
 * and the bar carry both of its numbers — but stays in the DOM, visually
 * hidden, as the one plain sentence a screen reader gets for the bar (which is
 * aria-hidden): "10,971 of the 13,105 MW Scotland is making is on the grid."
 *
 * The list of held-down farms that used to follow the bar ("Seagreen 631 MW •
 * Moray West 577 MW …") is gone from here, a stage before 4c.3 replaces it with
 * the source list: those figures were megawatts *held down*, and under an "on
 * the grid" headline the same pattern reads as megawatts on it.
 */

import { el, setAttr, setText, setTextCrossfade, type View } from '../../view/dom';
import { formatMW, formatMWh, formatPctFloor, formatPeriodSpan } from '../../lib/format';
import type { CurtailmentResponse } from '../../lib/types';
import { speaksOfNow, type AppState } from '../../lib/state';

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

  const shareFill = el('div', { class: 'share__fill' });
  const shareLabel = el('span', { class: 'share__label' });
  const shareBar = el('div', { class: 'share', 'aria-hidden': 'true' }, shareFill, shareLabel);
  const breakdown = el('p', { class: 'map-headline__breakdown' });

  const root = el(
    'section',
    { class: 'map-headline', 'data-state': 'ok', 'aria-labelledby': 'map-headline-sentence' },
    sentence,
    meta,
    el('div', { class: 'map-headline__evidence' }, shareBar, breakdown)
  );

  /** The bar says nothing until there is something to say: no label, and CSS greys the track. */
  function setShare(pct: number, label: string | null) {
    shareFill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    setText(shareLabel, label ?? '');
  }

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
        setShare(0, null);
        setText(breakdown, '');
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
        setShare(0, null);
        setText(breakdown, '');
        return;
      }

      const { curtailedMW, farms: farmsNow } = data.now;
      const declaredMW = farmsNow.reduce((sum, f) => sum + f.declaredMW, 0);
      const allClear = curtailedMW <= 0;

      // What is on the grid: declared output less what the balancing mechanism
      // has instructed down (the farms' own `instructedMW`, summed). Clamped, so
      // a curtailed figure that ran past the declared one reads as none, never
      // as a negative share.
      const instructedMW = allClear ? declaredMW : Math.min(declaredMW, Math.max(0, declaredMW - curtailedMW));
      const pct = declaredMW > 0 ? (instructedMW / declaredMW) * 100 : allClear ? 100 : 0;

      // The label's on-grid megawatts: floored while anything is held down (see
      // the header), the declared figure rounded as its denominator is when
      // nothing is. Floored, it can never exceed the rounded denominator.
      const onGrid = (allClear ? Math.round(declaredMW) : Math.floor(instructedMW)).toLocaleString('en-GB');

      setAttr(root, 'data-state', allClear ? 'none' : 'curtailing');
      setTextCrossfade(figure, allClear ? '100%' : formatPctFloor(pct));
      setTextCrossfade(
        tail,
        present
          ? ' of Scotland’s tracked wind is currently on the grid.'
          : ' of Scotland’s tracked wind was on the grid when this was last read.'
      );

      setShare(pct, `${onGrid} of ${formatMW(declaredMW)}`);
      // The plain sentence for the aria-hidden bar (026's exact phrasing): the
      // first figure is bare because the second's "MW" covers both.
      setText(breakdown, `${onGrid} of the ${formatMW(declaredMW)} Scotland is making is on the grid.`);
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
