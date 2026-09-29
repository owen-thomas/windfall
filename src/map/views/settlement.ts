/**
 * Now (DECISIONS 055): the method for the first headline only — how wind is
 * held back, then the share and what it covers. What holding it back costs,
 * and how it's paid for, moved under the cost bar (views/cost.ts).
 *
 * DECISIONS 053: a "Show method" text toggle beside "Show wind farms",
 * under the bar (the two close each other), opening three paragraphs in the
 * headline's order: how wind is held back and paid for, the share and what
 * it covers (the settlement period folded in: "…the share held back now is
 * for 14:30 – 15:00."), and the cost. The settlement heading row is gone from
 * the page; the history below is how it got here.
 *
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

import { el, setAttr, setText, type View } from '../../view/dom';
import { speaksOfNow, type AppState } from '../../lib/state';
import type { BorderLimit } from '../../lib/types';
import { formatTime } from '../../lib/format';

/**
 * How the network holds wind back, with the border's limit in it once it has
 * landed (DECISIONS 046) — Owen's wording. The limit is NESO's weekly planned
 * one; on a week that isn't published yet it is the latest day-ahead limit,
 * and the parenthesis names that day instead of "this week".
 */
function mechanism(border: BorderLimit | null): string {
  let limit = '';
  if (border) {
    const mw = (n: number) => Math.round(n).toLocaleString('en-GB');
    const when =
      border.basis === 'planned-week'
        ? 'this week'
        : `on ${new Date(`${border.from}T12:00:00Z`).toLocaleDateString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            timeZone: 'Europe/London',
          })}`;
    limit = ` (${mw(border.limitMW)} MW ${when}, ${mw(border.maxMW)} MW max)`;
  }
  return (
    'Scotland’s wind farms tell the grid how much power they could make. When there’s more wind ' +
    `than the cables south to England can take${limit}, the grid operator switches farms off.`
  );
}

/**
 * The headline's first claim, the share: which half hour it's for, what it
 * covers, and why it's a floor. "Farms", not "units": unitsTracked (BMU-level)
 * and farms.length (farm-level) are different counts, so naming the wrong
 * noun would say something false, not just something vague.
 */
function share(state: AppState): string {
  const data = state.curtailment;
  const now = data?.now;
  const method = data?.method;

  let period = 'Britain’s grid runs in half-hour blocks called settlement periods.';
  if (now) {
    const span = `${formatTime(now.settlement.periodStart)} – ${formatTime(now.settlement.periodEnd)}`;
    const present = speaksOfNow(data?.fetchedAt, now.settlement, state.now);
    period =
      'Britain’s grid runs in half-hour blocks called settlement periods: the share held back ' +
      `${present ? 'now ' : ''}is for ${span}.`;
  }

  let coverage: string;
  if (method && now) {
    const total = now.farms.length;
    const declaring = now.farms.filter((f) => f.unitsDeclaring > 0).length;
    const reported = declaring === total ? `all ${total}` : `${declaring} of ${total}`;
    coverage =
      `We track ${total} Scottish wind farms (${method.unitsTracked} units, ` +
      `${Math.round(method.capacityMW).toLocaleString('en-GB')} MW), and ${reported} had reported ` +
      'when this data was taken.';
  } else if (method) {
    coverage =
      `We track ${method.unitsTracked} Scottish wind units ` +
      `(${Math.round(method.capacityMW).toLocaleString('en-GB')} MW); which farms have reported is ` +
      'unknown while the balancing feed is unavailable.';
  } else {
    coverage = 'How many farms are covered is unknown while the balancing feed is unavailable.';
  }

  return (
    `${period} ${coverage} We only count the switch-offs the grid operator orders; farms also get ` +
    'held back in ways our data can’t see, so the real share is probably higher.'
  );
}

export interface MethodView extends View {
  /** "Show method" / "Hide method": main.ts seats it beside "Show wind farms". */
  toggle: HTMLButtonElement;
  setBorder(border: BorderLimit): void;
  /** Open or close it without the reader's click — the farm list opening closes it. */
  setOpen(open: boolean): void;
}

export function mapSettlementView(options: { onOpen?(): void } = {}): MethodView {
  const toggleText = el('span', { class: 'map-toggle__text', text: 'Show method' });
  const toggle = el(
    'button',
    { class: 'map-sources__open map-settlement__open', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'map-method' },
    el('span', { class: 'map-toggle' }, toggleText)
  ) as HTMLButtonElement;

  const mechanismP = el('p', { class: 'map-settlement__p', text: mechanism(null) });
  const shareP = el('p', { class: 'map-settlement__p' });

  // Closed on first load, every tier (4d decision 11).
  const root = el('div', { class: 'map-settlement__body', id: 'map-method' }, mechanismP, shareP);
  root.hidden = true;

  function setOpen(open: boolean) {
    root.hidden = !open;
    setAttr(toggle, 'aria-expanded', String(open));
    setText(toggleText, open ? 'Hide method' : 'Show method');
  }

  toggle.addEventListener('click', () => {
    const open = root.hidden;
    setOpen(open);
    if (open) {
      options.onOpen?.();
      requestAnimationFrame(revealBody);
    }
  });

  /**
   * Opening the method grows the text column below the fold — on desktop the
   * block is centred on the screen, so most of what opens lands off it (Owen).
   * Scroll just far enough to show all of it, 24px clear of the bottom, but
   * never so far that the toggle goes off the top; if it's taller than the
   * screen, the toggle sits 24px from the top instead.
   */
  function revealBody() {
    const margin = 24;
    const rect = root.getBoundingClientRect();
    const top = toggle.getBoundingClientRect().top;
    const overflow = rect.bottom + margin - window.innerHeight;
    if (overflow <= 0) return;
    const by = Math.min(overflow, top - margin);
    if (by <= 0) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollBy({ top: by, behavior: reduce ? 'auto' : 'smooth' });
  }

  return {
    el: root,
    toggle,
    setOpen,
    setBorder(border: BorderLimit) {
      setText(mechanismP, mechanism(border));
    },
    update(state: AppState) {
      setText(shareP, share(state));
    },
  };
}
