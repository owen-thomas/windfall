/**
 * The map's own masthead (Windfall_Map_Spec.md §3 Part A.1, DECISIONS 026):
 * leaner than `../../view/masthead.ts`'s, which `/` still uses unchanged.
 * Step 4b (DECISIONS 028) carries the Figma wordmark: "Windfall" bold, then
 * "≋ Scotland wind energy tracker" regular.
 *
 * The dashboard masthead carries a standfirst slot that is either the
 * product's introductory sentence or, per DECISIONS 010/017, a staleness/
 * failure notice swapped into the same place. The map drops the
 * introductory half of that slot outright — "the headline introduces the
 * product" (026) — but keeps the warning half: a reader still needs to be
 * told, in words, above the fold, when the reading is old or unreachable.
 * So this is not a strapline with the words deleted; it is a notice-only
 * slot that renders nothing when there is nothing to warn about. It skips
 * the dashboard's rollover notice ("settlement period N closed at…") on
 * purpose (DECISIONS 032): that gap is a brief, routine wait every half
 * hour for the next fetch to land (031 already tightened it to seconds),
 * not a fault, and calling it out on every rollover trained readers to
 * ignore the warning slot generally. The genuine staleness notice (a
 * refresh that has actually stopped landing) still fires below.
 */

import { el, setAttr, setText, type View } from '../../view/dom';
import { formatAge, formatPeriodSpan } from '../../lib/format';
import { overallAge, settlementOf, type AppState } from '../../lib/state';

export function mapMastheadView(): View {
  const period = el('span', { class: 'clock__period' });
  const span = el('span', { class: 'clock__span' });
  const age = el('span', { class: 'clock__age' });
  const notice = el('p', { class: 'map-masthead__notice' });

  const clock = el(
    'div',
    { class: 'clock map-masthead__clock', 'data-freshness': 'fresh' },
    period,
    span,
    age,
    notice
  );

  // The clock is built and kept fresh here, but the Figma frames seat it in the
  // headline block (between the sentence and the bar), so main.ts re-parents
  // `.map-masthead__clock` there after both views exist. Left in the header it
  // would still work — the masthead view does not know or care where it sits.
  const root = el(
    'header',
    { class: 'map-masthead' },
    el(
      'h1',
      { class: 'map-masthead__wordmark' },
      el('strong', { class: 'map-masthead__name', text: 'Windfall' }),
      ' ≋ Scotland wind energy tracker'
    ),
    clock
  );

  function setNotice(text: string) {
    setText(notice, text);
    notice.hidden = text === '';
  }

  return {
    el: root,
    update(state: AppState) {
      const settlement = settlementOf(state);

      if (settlement) {
        setText(period, `Settlement period ${settlement.period}`);
        setText(span, formatPeriodSpan(settlement.periodStart, settlement.periodEnd));
      } else {
        setText(period, 'Settlement period unknown');
        setText(span, '—');
      }

      const reading = overallAge(state);

      if (!reading && state.pending) {
        setText(age, 'Reading');
        setAttr(clock, 'data-freshness', 'pending');
        setNotice('');
        return;
      }

      if (!reading) {
        setText(age, 'No reading');
        setAttr(clock, 'data-freshness', 'failed');
        setNotice('Windfall is not reaching its data sources. Nothing on this page is current.');
        return;
      }

      setAttr(clock, 'data-freshness', reading.freshness);
      setText(
        age,
        reading.freshness === 'stale' ? `Last read ${formatAge(reading.ms)}` : `Read ${formatAge(reading.ms)}`
      );

      if (reading.freshness === 'stale') {
        setNotice(
          `This reading is ${formatAge(reading.ms).replace(' ago', ' old')}. The figures below ` +
            (settlement
              ? `describe settlement period ${settlement.period}, not the one now running.`
              : 'describe an earlier settlement period, not the one now running.')
        );
      } else {
        setNotice('');
      }
    },
  };
}
