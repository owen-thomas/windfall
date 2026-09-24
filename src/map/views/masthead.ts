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
 * alarms for something the clock — "Last updated N ago", in the footer since 4d — already
 * says plainly enough for a reader to act on (refresh, or just note the
 * age), and having a two-line warning box appear and disappear under the
 * settlement row broke the section's own grid rhythm (032/034's respective
 * live reports). What remains: total failure (no reading has ever landed,
 * or reaching Windfall's own functions is failing outright) still gets a
 * word in this slot, because there the clock has nothing to point a reader
 * at — no age to read, nothing to refresh into.
 */

import { el, setAttr, setText, type View } from '../../view/dom';
import { formatAge, formatTime } from '../../lib/format';
import { overallAge, settlementOf, type AppState } from '../../lib/state';

export interface MapMastheadView extends View {
  /** The settlement heading ("15:00 to 15:30  Settlement period 31"), seated in
   *  the method disclosure's summary by main.ts. */
  clock: HTMLElement;
  /** The freshness dot and "Updated N ago", seated in the footer by main.ts (4d). */
  freshness: HTMLElement;
}

/**
 * The sources not answering fully, in words — "Elexon not answering", "NESO
 * partly answering", "NESO and Elexon not answering" — or '' when both are.
 * The same reading of each feed's health as colophon.ts's old footer words.
 */
function sourcesDown(state: AppState): string {
  const health = (error: string | null | undefined, overall: string | undefined) =>
    error ? 'failed' : (overall ?? 'failed');
  const feeds = [
    { name: 'NESO', health: health(state.gridError, state.grid?.health.overall) },
    { name: 'Elexon', health: health(state.curtailmentError, state.curtailment?.health.overall) },
  ].filter((f) => f.health !== 'ok');
  if (feeds.length === 0) return '';
  const word = (h: string) => (h === 'partial' ? 'partly answering' : 'not answering');
  if (feeds.length === 2 && feeds[0].health === feeds[1].health) return `NESO and Elexon ${word(feeds[0].health)}`;
  return feeds.map((f) => `${f.name} ${word(f.health)}`).join(', ');
}

export function mapMastheadView(): MapMastheadView {
  // 4d: the time leads, bold and large, "to" smaller; the period number follows.
  const start = el('span', { class: 'clock__time' });
  const end = el('span', { class: 'clock__time' });
  const span = el('span', { class: 'clock__span' }, start, el('span', { class: 'clock__to', text: ' to ' }), end);
  const period = el('span', { class: 'clock__period' });
  const age = el('span', { class: 'clock__age' });
  const notice = el('p', { class: 'map-masthead__notice' });

  const clock = el(
    'div',
    { class: 'clock map-masthead__clock', 'data-freshness': 'fresh' },
    span,
    period,
    notice
  );
  // Its own `.clock`, so app.css's `.clock[data-freshness] .clock__age` states
  // (010/016/017) still apply now the age lives in the footer, apart from the
  // heading it used to share a row with.
  const freshness = el('p', { class: 'clock map-freshness', 'data-freshness': 'fresh' }, age);

  // The clock is built and kept fresh here, but the Figma frames seat it in the
  // headline block (between the sentence and the bar), so main.ts re-parents
  // `.map-masthead__clock` there after both views exist. Left in the header it
  // would still work — the masthead view does not know or care where it sits.
  const root = el(
    'header',
    { class: 'map-masthead' },
    // Not the page's <h1> since 4d: the headline sentence is (views/headline.ts).
    el(
      'div',
      { class: 'map-masthead__wordmark' },
      el('img', {
        class: 'map-masthead__logo',
        src: '/logo.svg',
        alt: 'Windfall',
        width: 87,
        height: 16,
      })
    ),
    clock
  );

  function setNotice(text: string) {
    setText(notice, text);
    notice.hidden = text === '';
  }

  function setFreshness(value: string) {
    setAttr(clock, 'data-freshness', value);
    setAttr(freshness, 'data-freshness', value);
  }

  return {
    el: root,
    clock,
    freshness,
    update(state: AppState) {
      const settlement = settlementOf(state);

      if (settlement) {
        setText(start, formatTime(settlement.periodStart));
        setText(end, formatTime(settlement.periodEnd));
        span.hidden = false;
        setText(period, `Settlement period ${settlement.period}`);
      } else {
        span.hidden = true;
        setText(period, 'Settlement period unknown');
      }

      const reading = overallAge(state);

      if (!reading && state.pending) {
        setText(age, 'Waiting for data');
        setFreshness('pending');
        setNotice('');
        return;
      }

      if (!reading) {
        setText(age, 'Can’t reach our data');
        setFreshness('failed');
        // No red notice under the heading any more (Owen): the headline and this
        // status line already say it.
        setNotice('');
        return;
      }

      // 4d: a source that isn't answering is said here, in the one status line,
      // rather than as a red word beside its name in the footer (Owen) —
      // "Updated moments ago · Elexon not answering", with the dot amber.
      const down = sourcesDown(state);
      const stale = reading.freshness === 'stale';
      setFreshness(stale ? 'stale' : down ? 'partial' : reading.freshness);
      const ageText = stale ? `Last updated ${formatAge(reading.ms)}` : `Updated ${formatAge(reading.ms)}`;
      setText(age, down ? `${ageText} · ${down}` : ageText);

      setNotice('');
    },
  };
}
