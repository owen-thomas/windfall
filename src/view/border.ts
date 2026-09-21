/**
 * The border's constraint sentence, resolved from `AppState`
 * (Windfall_Map_Spec.md §3 Part A.5, DECISIONS 026/027/029).
 *
 * Step 3 drew this as a permanently visible caption card; 026 turned it into a
 * hover/tap/focus tooltip on the border with an always-on "The constraint"
 * label. Step 4c (DECISIONS 029) removes the affordance altogether: the border
 * is a passive line, and the sentence lives only in the page's one explanation
 * (main.ts's updateMethodMapNotes, via `constraintSentenceOf` below), which a
 * touch or screen-reader visitor reaches without having to find anything on
 * the map.
 *
 * What is reused, verbatim, from ../view/constraint.ts is the three-state
 * copy and the tense/state selection logic itself — `/` and `/map` must
 * never describe the same constraint differently, so the strings and the
 * rule for picking one live once, in constraint.ts.
 */
import { CLEAR, CONSTRAINED, UNKNOWN } from './constraint';
import { speaksOfNow, type AppState } from '../lib/state';

export interface ConstraintSentence {
  state: 'constrained' | 'clear' | 'unknown';
  text: string;
}

/** The single place the border's state and sentence are resolved from `AppState`, so no caller reimplements the tense/state rule. */
export function constraintSentenceOf(state: AppState): ConstraintSentence {
  const now = state.curtailment?.now;
  if (!now) return { state: 'unknown', text: UNKNOWN };
  const constrained = now.curtailedMW > 0;
  const tense = speaksOfNow(state.curtailment?.fetchedAt, now.settlement, state.now) ? 'now' : 'past';
  return { state: constrained ? 'constrained' : 'clear', text: constrained ? CONSTRAINED[tense] : CLEAR[tense] };
}
