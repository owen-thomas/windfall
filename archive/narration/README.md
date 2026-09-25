# Archived: the AI narration

Archived 2026-09-25, once the map became the index at windfall.scot
(DECISIONS 043). Nothing on the site called it any more: the map page dropped
the narration (DECISIONS 026), and the dashboard that used it was retired.

It was built and validated but never keyed in production — with no
`ANTHROPIC_API_KEY` configured, the live endpoint always fell back to the
deterministic template (DECISIONS 026 and the capture pack's
`narrate-eval-log.txt`).

| File | Was | What it did |
|---|---|---|
| `narration.ts` | `api/narration.ts` | The endpoint: built the facts for the current settlement period, asked the model for one 40–70 word sentence, validated it, cached it per period |
| `narration-prompt.ts` | `api/_lib/narration-prompt.ts` | The prompt, the facts it was built from, and the validator (hallucinated-figure check, second-person and exclamation-mark bans, word band) |
| `situation.ts` | `src/lib/situation.ts` | The facts both narrations read: region mixes, intensity, the constraint, the direction of travel |
| `narrate-eval.ts` | `scripts/narrate-eval.ts` | The evaluation script (`npm run narrate:eval`, removed) |

These files are kept as they were, not maintained: their relative imports
point at their old locations, and the client code that fetched the endpoint
(`fetchNarration`, the `narration` state and `NarrationResponse` type) was
removed from `src/`. To run it again, restore from the last commit that had it
in place, `d90c627`:

```
git checkout d90c627 -- api/narration.ts api/_lib/narration-prompt.ts src/lib/situation.ts scripts/narrate-eval.ts
```
