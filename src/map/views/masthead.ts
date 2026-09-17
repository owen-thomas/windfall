/**
 * The map's own masthead (Windfall_Map_Spec.md §3 Part A.1, DECISIONS 026):
 * leaner than `../../view/masthead.ts`'s, which `/` still uses unchanged.
 *
 * The dashboard masthead carries a standfirst slot that is either the
 * product's introductory sentence or, per DECISIONS 010/017, a staleness/
 * failure notice swapped into the same place. The map drops the
 * introductory half of that slot outright — "the headline introduces the
 * product" (026) — but keeps the warning half: a reader still needs to be
 * told, in words, above the fold, when the reading is old or unreachable.
 * So this is not a strapline with the words deleted; it is a notice-only
 * slot that renders nothing when there is nothing to warn about, and the
 * same three warning sentences the dashboard uses when there is.
 */

import { el, setAttr, setText, type View } from '../../view/dom';
import { formatAge, formatPeriodSpan, formatTime } from '../../lib/format';
import { describesNow, overallAge, settlementOf, type AppState } from '../../lib/state';

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

  const root = el(
    'header',
    { class: 'map-masthead' },
    el('h1', { class: 'map-masthead__wordmark', text: "Windfall ≈ Scotland wind tracker" }),
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

      if (reading.freshness !== 'stale' && !describesNow(state) && settlement) {
        setAttr(clock, 'data-freshness', 'ageing');
        setNotice(
          `Settlement period ${settlement.period} closed at ${formatTime(settlement.periodEnd)}. The ` +
            'figures below describe it, not the period now running.'
        );
        return;
      }

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
