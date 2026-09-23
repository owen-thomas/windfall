/**
 * The settlement row and, hanging off it, the page's one explanation
 * (Windfall_Map_Spec_4c.md §4c.4, DECISIONS 029; re-cut by
 * Windfall_Map_Spec_4d.md): a native `<details>`, the settlement heading as the
 * `<summary>`, one consolidated disclosure as its body.
 *
 * 4d: the heading leads with the time ("15:00 to 15:30", then "Settlement
 * period 31"), the boxed chevron becomes an underlined text toggle at the row's
 * right ("▶ Show method" / "▼ Hide method"), and the body is four short
 * paragraphs in Owen's final copy. The freshness dot and age have moved to the
 * footer (views/masthead.ts builds both halves).
 *
 * Through 4c.3 this page carried its explaining in two places: a "How this
 * number is worked out" `<details>` in the text column (colophon.ts's own,
 * reused from `/`) and, before that, a hover/tap tooltip on the border. Both
 * are gone from the screen. What's left of what either said — the basis, the
 * coverage, the floor, the count of farms with no declaration — lives here,
 * once. `colophon.ts`'s own `.method` is still built (by `colophonView`,
 * reused from `/`, which also carries the footer's source-health rows and
 * byline this page keeps) but never attached to the DOM here — `main.ts`
 * removes it rather than seat it, since this view replaces what it said.
 *
 * Owen's calls at the 4c.4 review, on the first draft:
 * - No parity/verification paragraph (the floor-vs-widely-cited-figure
 *   comparison and the independent tracker check, which the spec's own §7
 *   allowed dropping "if [it no longer] reads as honest under the new frame —
 *   trim hard").
 * - No separate live reading of the constraint (`constraintSentenceOf`, which
 *   this reused from `constraint.ts` via the now-deleted `src/view/border.ts`)
 *   — the opening paragraph's general explanation already says what happens
 *   when the network is full, so a second, tensed sentence saying it is full
 *   right now was one fact stated twice. That is a deliberate, confirmed
 *   departure from the spec's own 4c.4 gate line ("screen-reader path to the
 *   constraint sentence is preserved"): nothing on `/map` now states, in
 *   words, whether the network is constrained *this half-hour* specifically —
 *   only the general mechanism (here) and the headline's percentage (which
 *   implies it: anything under 100% means something is being held back).
 * - No settled-half-hour figure (`settledLine`, also since deleted — it had
 *   no other caller). It named a *different* period from the one the row above
 *   shows (the last complete, settled half-hour, not the one now running) and
 *   read, on trial, as if it described the current one — confusing rather
 *   than reassuring. Dropped rather than reworded, on the same logic as the
 *   parity paragraph: a fact that raises more questions than it answers has
 *   no place in a disclosure whose job is to remove doubt, not add it.
 * All three: recorded, not silently dropped — see DECISIONS 029.
 *
 * The settlement heading itself (the clock element built and kept fresh by
 * `mapMastheadView`, its failure notice with it) is passed in rather than
 * rebuilt, and seated *after* the bar and list — the frame's order is bar,
 * list, settlement row, explanation.
 *
 * Closed by default, on every tier: this is reference material a reader
 * checks against, not the page's argument (that is the headline and the
 * bar). The pre-4c `.method` disclosure was closed by default for the same
 * reason ("closed by default and one click away" — its own doc comment).
 *
 * The copy is Owen's (drafted through `owen-thomas-work:house-style` and
 * `design:ux-copy`, redrafted at his review) — see DECISIONS 029 for the full
 * history of what changed and why.
 */

import { el, setText, type View } from '../../view/dom';
import type { AppState } from '../../lib/state';

// Static: the same in every state, so set once rather than on every render.
const PERIODS =
  'Britain’s grid runs in half-hour blocks called settlement periods. Every figure on this page ' +
  'is for the half hour shown above.';

const MECHANISM =
  'Scotland’s wind farms tell the grid how much power they could make. The cables south to ' +
  'England can only carry so much, so when there’s more wind than they can take, farms are paid ' +
  'to switch off. Whatever isn’t switched off goes onto the grid.';

const FLOOR =
  'We only count the switch-offs ordered by the grid operator. Farms also get held back in ways ' +
  'our data can’t see, so the real share is probably higher.';

export function mapSettlementView(clockEl: Element): View {
  const toggleText = el('span', { class: 'map-toggle__text', text: 'Show method' });
  const toggle = el('span', { class: 'map-toggle map-settlement__toggle' }, toggleText);
  const summary = el('summary', { class: 'map-settlement__summary' }, clockEl, toggle);

  const coverage = el('p', { class: 'map-settlement__p' });
  const body = el(
    'div',
    { class: 'map-settlement__body' },
    el('p', { class: 'map-settlement__p', text: PERIODS }),
    el('p', { class: 'map-settlement__p', text: MECHANISM }),
    el('p', { class: 'map-settlement__p', text: FLOOR }),
    coverage
  );

  // Closed on first load, every tier (4d decision 11).
  const root = el('details', { class: 'map-settlement' }, summary, body);
  root.addEventListener('toggle', () => {
    setText(toggleText, root.open ? 'Hide method' : 'Show method');
    if (root.open) requestAnimationFrame(revealBody);
  });

  /**
   * Opening the method grows the text column below the fold — on desktop the
   * block is centred on the screen, so most of what opens lands off it (Owen).
   * Scroll just far enough to show all of it, 24px clear of the bottom, but
   * never so far that the heading row goes off the top; if it's taller than
   * the screen, the heading sits 24px from the top instead.
   */
  function revealBody() {
    const margin = 24;
    const rect = root.getBoundingClientRect();
    const overflow = rect.bottom + margin - window.innerHeight;
    if (overflow <= 0) return;
    const by = Math.min(overflow, rect.top - margin);
    if (by <= 0) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollBy({ top: by, behavior: reduce ? 'auto' : 'smooth' });
  }

  return {
    el: root,
    update(state: AppState) {
      const data = state.curtailment;
      const method = data?.method;
      const now = data?.now;

      // "Farms", not "units" or "them": unitsTracked (BMU-level) and
      // farms.length (farm-level) are different counts, so naming the wrong
      // noun would say something false, not just something vague.
      if (method && now) {
        const total = now.farms.length;
        const declaring = now.farms.filter((f) => f.unitsDeclaring > 0).length;
        const reported = declaring === total ? `All ${total}` : `${declaring} of ${total}`;
        setText(
          coverage,
          `We’re tracking ${method.unitsTracked} transmission-connected wind units across ${total} ` +
            `Scottish farms, with ${Math.round(method.capacityMW).toLocaleString('en-GB')} MW of ` +
            `registered capacity between them. ${reported} had reported their figures when this ` +
            'data was taken.'
        );
      } else if (method) {
        setText(
          coverage,
          `We’re tracking ${method.unitsTracked} transmission-connected Scottish wind units, with ` +
            `${Math.round(method.capacityMW).toLocaleString('en-GB')} MW of registered capacity ` +
            'between them. Which farms have reported is unknown while the balancing feed is unavailable.'
        );
      } else {
        setText(coverage, 'How many farms are covered is unknown while the balancing feed is unavailable.');
      }
    },
  };
}
