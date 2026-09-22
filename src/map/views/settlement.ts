/**
 * The settlement row and, hanging off its chevron, the page's one explanation
 * (Windfall_Map_Spec_4c.md §4c.4, DECISIONS 029): a native `<details>`, the
 * boxed settlement-period row as the `<summary>`, one consolidated disclosure
 * as its body.
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
 * The settlement row itself (the clock element built and kept fresh by
 * `mapMastheadView` — its freshness dot, its stale/failed/ageing notice,
 * 010/016/017, all travel with it) is passed in rather than rebuilt: it is
 * the same element `main.ts` already re-parents into the headline block, now
 * wrapped in a box with a chevron rather than sitting bare, and seated *after*
 * the bar-and-list disclosure — the frame's own order (§1) is bar, list,
 * settlement row, explanation.
 *
 * Closed by default, on every tier: this is reference material a reader
 * checks against, not the page's argument (that is the headline and the bar,
 * which 4c.3 does open by default on desktop). The pre-4c `.method` disclosure
 * was closed by default for the same reason ("closed by default and one click
 * away" — its own doc comment) and nothing about the reframe changes it.
 *
 * The copy is Owen's (drafted through `owen-thomas-work:house-style` and
 * `design:ux-copy`, redrafted at his review) — see DECISIONS 029 for the full
 * history of what changed and why.
 */

import { el, setText, type View } from '../../view/dom';
import type { AppState } from '../../lib/state';

// Static: the same in every state, so set once rather than on every render.
const MECHANISM =
  'Scottish wind farms declare how much they can produce. The wires between Scotland and England ' +
  'can only carry so much power south, so when Scottish wind exceeds that capacity, farms are ' +
  'paid to switch off. What remains is on the grid.';

const SR_LABEL = 'How this figure is worked out, and why Scotland’s wind gets turned down.';

export function mapSettlementView(clockEl: Element): View {
  const chevron = el('span', { class: 'map-settlement__chevron', 'aria-hidden': 'true' });
  const sr = el('span', { class: 'map-settlement__sr', text: SR_LABEL });
  const summary = el('summary', { class: 'map-settlement__summary' }, clockEl, chevron, sr);

  const mechanism = el('p', { class: 'map-settlement__p', text: MECHANISM });
  const coverage = el('p', { class: 'map-settlement__p' });
  const body = el('div', { class: 'map-settlement__body' }, mechanism, coverage);

  const root = el('details', { class: 'map-settlement' }, summary, body);

  return {
    el: root,
    update(state: AppState) {
      const data = state.curtailment;
      const method = data?.method;
      const now = data?.now;

      // --- The floor, and what's tracked. "Farms", not "units" or "them":
      // unitsTracked (BMU-level) and farms.length (farm-level) are different
      // counts, so naming the wrong noun (or a pronoun that could point at
      // either) would say something false, not just something vague. ---------
      let trackedLine: string;
      if (method && now) {
        const total = now.farms.length;
        const declaring = now.farms.filter((f) => f.unitsDeclaring > 0).length;
        const declaredClause = declaring === total
          ? `All ${total} of those farms had declared`
          : `${declaring} of those farms had declared`;
        const silent = total - declaring;
        const silentClause = silent > 0
          ? ` ${silent} hadn’t, and show silent on the map rather than a guessed zero.`
          : '';
        trackedLine =
          `It tracks ${method.unitsTracked} transmission-connected Scottish wind units across ` +
          `${total} farms, ${Math.round(method.capacityMW).toLocaleString('en-GB')} MW of ` +
          `registered capacity. ${declaredClause} when we sampled the data.${silentClause}`;
      } else if (method) {
        trackedLine =
          `It tracks ${method.unitsTracked} transmission-connected Scottish wind units, ` +
          `${Math.round(method.capacityMW).toLocaleString('en-GB')} MW of registered capacity. ` +
          'Which farms are declaring is unknown while the balancing feed is unavailable.';
      } else {
        trackedLine = 'How many farms are covered is unknown while the balancing feed is unavailable.';
      }
      setText(
        coverage,
        'Britain’s grid is measured in half-hour settlement periods — the one named above is ' +
          'what every figure on this page describes. This is a partial picture: farms get held ' +
          'back in ways our data doesn’t capture, so real curtailment is probably higher and the ' +
          `on-grid share lower than what’s shown here. Windfall only counts what the grid ` +
          `operator instructs off. ${trackedLine}`
      );
    },
  };
}
