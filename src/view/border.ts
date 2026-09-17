/**
 * The border's constraint sentence — a tooltip now, not a caption box
 * (Windfall_Map_Spec.md §3 Part A.5, DECISIONS 026/027).
 *
 * Step 3 drew this as a permanently visible caption card, offshore, with a
 * leader back to the line. 026 cuts that: the border carries its own
 * discoverable affordance instead — a small always-on label reading "The
 * constraint" (built in map/main.ts, since it never changes and needs no
 * View) plus a hit area wider than the line itself (also main.ts, since it
 * has to be an SVG path sharing the border's own geometry) — and the
 * sentence only appears in this tooltip, on hover, tap or keyboard focus of
 * that hit area. The same sentence is always printed in the method note
 * (main.ts's updateMethodMapNotes, via `constraintSentenceOf` below) so a
 * touch or screen-reader visitor is never dependent on discovering the
 * tooltip.
 *
 * What is reused, verbatim, from ../view/constraint.ts is the three-state
 * copy and the tense/state selection logic itself — `/` and `/map` must
 * never describe the same constraint differently, so the strings and the
 * rule for picking one live once, in constraint.ts. `constraintSentenceOf`
 * is the one place both this tooltip and the method note call it from, so
 * they can't drift from each other either.
 */
import { CLEAR, CONSTRAINED, UNKNOWN } from './constraint';
import { el, setAttr, setTextCrossfade, type View } from './dom';
import { speaksOfNow, type AppState } from '../lib/state';

export interface ConstraintSentence {
  state: 'constrained' | 'clear' | 'unknown';
  text: string;
}

/** The single place the border's state and sentence are resolved from `AppState` — the tooltip and the method note both call this rather than each reimplementing the tense/state rule. */
export function constraintSentenceOf(state: AppState): ConstraintSentence {
  const now = state.curtailment?.now;
  if (!now) return { state: 'unknown', text: UNKNOWN };
  const constrained = now.curtailedMW > 0;
  const tense = speaksOfNow(state.curtailment?.fetchedAt, now.settlement, state.now) ? 'now' : 'past';
  return { state: constrained ? 'constrained' : 'clear', text: constrained ? CONSTRAINED[tense] : CLEAR[tense] };
}

export function borderView(): View {
  const body = el('p', { class: 'map__border-tooltip-body' });
  const root = el(
    'div',
    { class: 'map__border-tooltip', role: 'tooltip', 'data-state': 'unknown' },
    body
  );

  return {
    el: root,
    update(state: AppState) {
      const { state: constraintState, text } = constraintSentenceOf(state);
      setAttr(root, 'data-state', constraintState);
      setTextCrossfade(body, text);
    },
  };
}
