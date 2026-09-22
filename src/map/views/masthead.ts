/**
 * The map's own masthead (Windfall_Map_Spec.md §3 Part A.1, DECISIONS 026):
 * leaner than `../../view/masthead.ts`'s, which `/` still uses unchanged.
 * Step 4b (DECISIONS 028) carries the Figma wordmark: "Windfall" bold, then
 * "≋ Scotland wind energy tracker" regular.
 *
 * The dashboard masthead carries a standfirst slot that is either the
 * product's introductory sentence or, per DECISIONS 010/017, a staleness/
 * failure notice swapped into the same place. The map drops the
 * introductory half outright — "the headline introduces the product" (026)
 * — and, as of DECISIONS 032/034, drops the staleness half too: neither the
 * rollover notice ("settlement period N closed at…") nor the stale-reading
 * one ("this reading is an hour old…") fires here any more. Both read as
 * alarms for something the clock beside them — "Last read N ago" — already
 * says plainly enough for a reader to act on (refresh, or just note the
 * age), and having a two-line warning box appear and disappear under the
 * settlement row broke the section's own grid rhythm (032/034's respective
 * live reports). What remains: total failure (no reading has ever landed,
 * or reaching Windfall's own functions is failing outright) still gets a
 * word in this slot, because there the clock has nothing to point a reader
 * at — no age to read, nothing to refresh into.
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
      el('img', {
        class: 'map-masthead__logo',
        src: '/logo.svg',
        alt: 'Windfall',
        width: 87,
        height: 16,
      }),
      ' Scotland wind energy tracker'
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

      setNotice('');
    },
  };
}
