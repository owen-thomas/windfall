# Windfall — Decision Log

Significant design and technical decisions, recorded as made. The case study needs the reasoning, not just the result.

---

## 001 — Vanilla TypeScript, no React

**Date:** 2026-07-24  
**Phase:** Scaffold  
**Decision:** Vite + vanilla TypeScript. D3 where the visualisation is data-driven, plain SVG or Canvas where it isn't. No component framework.

**Reasoning:** This is one screen, heavily animated, with custom motion at its core. React's render cycle is friction for that kind of work — you'd spend effort preventing re-renders mid-transition rather than building transitions. The DOM is the state for a single-screen product; a virtual DOM is overhead with no payoff.

**Trigger for revisiting:** Genuine component complexity — multiple views, shared interactive state, forms. Nothing in slice one or the parked slice two candidates reaches that threshold.

**What was rejected:** React, Svelte, any component framework. The deciding factor was not preference but the specific interaction between React's reconciliation model and the continuous, choreographed animation that is central to the product's case study value.

---

## 002 — Data spike results: curtailment derivation method validated

**Date:** 2026-07-24  
**Phase:** Phase 0 (spike)  
**Decision:** Proceed with slice one including live curtailment. The PN-vs-BOA derivation method works and the gate passes.

### Carbon Intensity API (`api.carbonintensity.org.uk`)

All endpoints confirmed working, keyless, CORS-friendly.

| Endpoint | Status | Latency | Notes |
|---|---|---|---|
| `/intensity` | 200 | ~300ms | Current national intensity (forecast + actual + index) |
| `/regional` | 200 | ~280ms | 18 regions including North Scotland, South Scotland, combined Scotland |
| `/generation` | 200 | ~100ms | 9 fuel types with percentages |
| `/intensity/fw24h` | 200 | ~60ms | 24h forecast (48 half-hour periods) |
| `/intensity/date/{date}` | 200 | ~250ms | Historical data, 48 periods per day |

**Corrections to the project plan:**
- Forecast endpoint is `/intensity/fw24h`, not `fw48h` (which returns 400). Plan said 48h forecasts; only 24h is available.
- Regional data nests under `data[0].regions`, each with `regionid`, `shortname`, `intensity`, `generationmix`.
- The Scotland/South England contrast works perfectly for the paradox: on 24 July 2026, Scotland was at 0 gCO2/kWh (77.7% wind) while South England was at 52 gCO2/kWh.

### Elexon BMRS (`data.elexon.co.uk`)

Curtailment derivation confirmed working end-to-end.

**Method:** For each Scottish wind BMU and settlement period, curtailment = PN energy (declared output) minus BOALF energy (accepted/instructed output), where the acceptance reduces output below the notification.

**Ground-truth validation (20 June 2026):**
- Public tracker reports 56.45 GWh curtailed for that day.
- Our derivation: **24.25 GWh** — ratio 0.43x.
- Same order of magnitude. Systematic undercount is expected and understood.

**On the 2.3x gap (working hypothesis, not a finding):**
The tracker's 56.45 GWh figure is higher than our 24.25 GWh by a factor of ~2.3. The tracker does not publish its methodology, and NESO's data portal publishes wind availability, forecasts, and metered output but no official daily curtailment volume dataset. So we do not know how the tracker's figure is derived, and cannot explain the gap with confidence.

A *plausible* explanation is that the tracker uses an availability-based method (comparing estimated available wind to metered output), which would capture forms of curtailment our method misses:
- Pre-adjusted PNs (wind farms reducing declarations in anticipation of curtailment)
- Self-curtailment outside the balancing mechanism
- The PN being already below available capacity

But this is conjecture. The gap could also reflect differences in unit coverage, time-boundary handling, or a method we haven't considered.

**Phase 1 follow-up:** cross-check our derivation against de Berker's Wind Curtailment Monitor, which is also balancing-mechanism-derived. If Windfall lands close to another BM-method source, the gap to the tracker becomes a family difference between BM-derived and availability-based methods — explicable rather than unexplained. One script run against a shared date.

**Resolved in 013.** Windfall and the monitor agree to within 1% on three days of six (a fourth inside the monitor's rounding), and both sit at ~0.42x of the tracker. The family difference is confirmed.

**API quirks discovered:**
- PN endpoint uses `settlementDate` + `settlementPeriod` params; PN/stream uses `from`/`to` dates (exclusive end)
- BOALF per-unit `bmUnit` filter is broken — returns 0 items even for units with known acceptances. **Must fetch all BOALFs and filter in code.** This has implications for live queries (larger payloads than necessary).
- BOALF uses `from`/`to` dates and optional `settlementPeriodFrom`/`settlementPeriodTo`

**Scottish wind BMU list:** 50 transmission-connected units curated. Total registered capacity ~8,533 MW (the product computed and displayed 8,574 MW from the same list; the round figure here was never recomputed after Edinbane was added). **Superseded by 015** — the list was 62 units short, and the light validation date is why. 19 of 20 units with BOALFs on the validation date were in our list. Added missing unit (Edinbane, Skye, 41.4 MW). The list covers Seagreen (2 GW), Moray East (0.9 GW), Moray West (0.86 GW), Beatrice (0.68 GW), Viking (0.49 GW), and major onshore farms.

**Top curtailed farms (20 June 2026, our method):**
1. Seagreen: 7.06 GWh
2. Moray West: 6.37 GWh
3. Moray East: 6.24 GWh
4. Viking: 4.42 GWh
5. Dorenell: 0.15 GWh

**Live query confirmed:** tested on 24 July 2026 at 12:16 UTC. 12 Scottish wind units were being actively curtailed (Seagreen, Moray West, Moray East, Neart Na Gaoithe).

**Fetch cost per page load (estimate):**
- Carbon Intensity: 3 requests (~700ms total)
- Elexon PN: 1 request per batch of units (~10 units per batch, 5 batches, but for current period only: 1 request)
- Elexon BOALF: 1 request for current period (~500 items, filter in code)
- Total: 5–7 requests. Server-side cache at 5-min TTL reduces to 0 for concurrent visitors.

### Exit criteria assessment

| Criterion | Status |
|---|---|
| Derivation produces a defensible number | **Pass** — 24.25 GWh vs 56.45 GWh tracker figure (0.43x, gap not yet explained — see working hypothesis above and phase 1 cross-check) |
| Live "current period" query works | **Pass** — tested with live data, 12 units curtailed |
| Total fetch cost per page load understood | **Pass** — 5–7 API calls, cacheable server-side |

**Gate: PASS.** Proceed with slice one including live curtailment.

---

## 003 — The headline number will be smaller than the press figures, by design

**Date:** 2026-07-24  
**Phase:** Phase 0 / Phase 1  
**Decision:** Own the lower bound explicitly. Windfall's curtailment figure is BM-derived instructed curtailment — a floor, not a ceiling. This is a design position, not a data limitation to apologise for.

**The problem:** Octopus's ticker, news coverage, and public commentary cite larger figures derived from availability-based methods or broader definitions of constraint cost. A visitor who has read "£650m wasted" will see Windfall's smaller number and wonder which is wrong. If the product doesn't address this head-on, it reads as an error.

**The design response (three layers):**

1. **"At least" framing on the headline figure.** The number is introduced as a floor: "at least X MWh switched off this period" or equivalent. The language makes the lower-bound status part of the claim, not a footnote.

2. **Method note.** Windfall carries a short public explanation of how the number is derived and what it does and does not include. This is honesty-as-design: the method note is part of the product's position, not small print. It should say what the derivation measures (instructed turn-downs via the balancing mechanism), what it excludes (self-curtailment, pre-adjusted declarations), and why the figure will be lower than availability-based estimates.

3. **Narration prompt inherits the hedging.** The AI narration must never present the curtailment figure as the total picture. Prompt guardrails: use "at least", "instructed to switch off", never "total curtailment" or unqualified "wasted". The narration describes the floor, not an estimate of the ceiling.

**Why this is case study material:** Designing honest data presentation — where the interesting decision is how to frame a number that is deliberately conservative — is exactly the kind of AI-in-product craft the portfolio needs to demonstrate. The alternative (inflating the figure or staying silent about the gap) would undermine the product's credibility with anyone who checks.

**What was rejected:** Switching to an availability-based method (would require wind speed data or metered output joins, adding complexity and an opaque model); showing no number until the gap is fully explained (delays the product for an investigation that doesn't change the design); showing the number without framing (invites the "which is wrong?" question).

**Phase 1 follow-up (from 002):** Cross-check against de Berker's Wind Curtailment Monitor (also BM-derived) to validate like-for-like. If confirmed, the gap to press figures becomes a family difference between methods, not a Windfall-specific discrepancy.

**Resolved in 013 — confirmed.** The three-layer response above stands, and layer 2's method note is rewritten to cite the cross-check instead of speculating about how other figures are derived.

---

## 004 — Upstream failure is data, not an HTTP status

**Date:** 2026-07-24
**Phase:** Phase 1
**Decision:** The serverless functions always return 200. Upstream failures are reported as per-source health flags inside the payload, alongside whatever data was successfully fetched. Every response carries `fetchedAt`, and the client computes staleness from that field rather than from when the response arrived.

**Reasoning:** The project plan requires each visual element to own its own data health, and requires the page to degrade honestly rather than showing a spinner over emptiness. Both fall out of this contract. If Elexon is down and Carbon Intensity is fine, the generation mix renders normally while the curtailment figure alone shows its degraded state — which is only possible if the response carrying the good data isn't an error.

The `fetchedAt` rule is forced by the caching decision in 005. A CDN hit can be five minutes old, and inside the stale-while-revalidate window it can be fifteen. Receipt time would therefore be a lie. A corollary worth being deliberate about: health flags describe upstream state *at* `fetchedAt`, not at delivery. That is correct behaviour — the flags and the data they describe stay in sync — but it means the UI's staleness indicator and its health indicator are reading the same clock, and both must be shown against the timestamp rather than against "now".

**What was rejected:** 5xx on upstream failure. It would make partial responses uncacheable, let one dead source blank working elements, and force the client to guess what it still had.

---

## 005 — CDN response caching, not in-function memory

**Date:** 2026-07-24
**Phase:** Phase 1
**Decision:** Both functions set `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`. The shared cache is the Vercel CDN.

**Reasoning:** The original phase 1 proposal assumed an in-memory cache inside the function would let one visitor's fetch serve the next. It would not. Vercel functions do not share memory between invocations, so an in-process cache is a cache per cold start — on this product's traffic, effectively no cache at all, and no politeness to Elexon either. Since the whole rationale for proxying is caching and rate-limit courtesy, getting this wrong would have quietly invalidated the proxy layer while appearing to work in local testing.

`stale-while-revalidate` also buys graceful degradation free: if an upstream goes slow, visitors keep receiving the last good payload while the refresh happens behind them, which is exactly the behaviour section 5.4 asks for.

The five-minute TTL sits well inside the thirty-minute settlement period, so the cache never hides a rollover. **Wrong, corrected in 017:** a TTL inside a period does not align with one, and a cached response can describe a period that closed while it sat in the CDN.

**What was rejected:** In-memory caching inside the function (does not survive between invocations); a database or KV store (the project plan rules out storage in slice one, and the CDN already provides the shared layer); no caching (impolite to a free public API, and every visitor would pay full upstream latency).

---

## 006 — Two clocks: instantaneous MW and settled MWh

**Date:** 2026-07-24
**Phase:** Phase 1
**Decision:** The curtailment element carries two figures. The headline is instantaneous power — MW currently instructed below declared output. A secondary figure is settled energy — MWh over the last *complete* settlement period.

**Reasoning:** Balancing acceptances arrive throughout a period, so an energy figure for the period in progress grows as the half-hour passes. The same number would mean different things at 14:05 and 14:29, and a visitor landing early in a period would see the deepest undercount. That is a genuine honesty problem, not something copy hedging can fix.

Power and energy have different honest clocks. MW is a true "right now" reading — nothing accumulates, so a mid-period sample carries no undercount at all. MWh only settles once the period closes. Showing both is not two versions of one number; it is two measurements that cannot contradict each other. Live probe on 24 July 2026 bears this out: 2,082 MW instantaneous against 1,029.7 MWh for the preceding period, which is a 2,059 MW average — the two agree to within 1%.

This also resolves a clock mismatch that the alternatives create. The generation mix is a current-period figure; pairing it with a settled-period-only curtailment number would put two different clocks side by side on one screen without acknowledging it.

**Cost:** one extra period of PN and BOALF per request. Marginal, since BOALF is fetched unfiltered regardless, and the two periods fetch in parallel — measured response time is unchanged at ~200ms.

**What was rejected:** Last complete period only (defensible, and it makes a cleaner motion beat at rollover, but it lags the mix by up to thirty minutes on the same screen); current period framed as accumulating (matches the mix's clock, but a number that visibly grows and then resets risks reading as the per-second liveness section 5.4 warns against).

**Open for the composition conversation:** which figure carries the typographic weight, and whether the settled figure earns its place on screen at all or belongs in the method note.

---

## 007 — BOALF period filter matches only the start period; derivation corrected

**Date:** 2026-07-24
**Phase:** Phase 1
**Decision:** Fetch BOALF over a four-period lookback window rather than the target period alone, and let each acceptance record's own time segments determine what is in force. The derivation is re-validated against the phase 0 date.

**The finding:** Elexon's BOALF settlement period filter matches `settlementPeriodFrom` only, not the declared period range. Querying period N returns acceptances that *began* in period N and misses every acceptance that began earlier and is still holding a unit down — which, in sustained curtailment, is most of them. This is a second broken filter on the same dataset, distinct from the broken `bmUnit` filter found in the spike.

Evidence: acceptance 33490 declares itself SP 40→41 but does not appear when querying SP 41. For MOWWO-2 in SP 40, a period-only query returned acceptances covering 3 minutes of the 30-minute period; the unit was in fact held down for 27 of them by an acceptance tagged SP 39→40.

**What acceptance records actually contain:** a profile, not a level. Each acceptance carries a flat segment holding the unit at the instructed level, then a ramp releasing it back towards the declaration. Overlapping acceptances chain, each extending the hold. The live instruction at any instant is therefore the highest-numbered acceptance whose segments cover that instant — no inference or hold-forward is needed, because the coverage is explicit in the data.

**Two derivation refinements adopted alongside the fix:**
- Acceptance precedence resolves per instant rather than per period, so a later instruction supersedes an earlier one only for the time it actually covers.
- Shortfalls are clamped at zero per sample, so a unit instructed *above* its declaration for part of a period cannot net off curtailment elsewhere in that period. This is the stricter reading of "instructed to switch off", and consistent with 003's floor framing.

Energy is integrated by sampling at one-minute midpoints rather than solved in closed form: overlapping acceptances make the effective instruction profile fiddly to integrate analytically, and 50 units × 30 samples is free.

**Re-validation (20 June 2026):** 23.75 GWh, against the spike's 24.25 GWh — within 2%, with the per-farm breakdown tracking closely (Seagreen 6.89 vs 7.06, Moray West 6.10 vs 6.37, Moray East 5.91 vs 6.24, Viking 4.73 vs 4.42). Ratio to the public tracker is 0.42x, essentially unchanged from the spike's 0.43x. **Decisions 002 and 003 stand, and the de Berker cross-check remains the right follow-up.**

**Why this matters beyond the number:** the spike arrived at approximately the right answer through two errors that partly cancelled. It compared a full-period PN integral against an acceptance integral covering only the instructed window, which inflates every partial-period acceptance; and it fetched only the acceptances tagged to each period, which loses most of them. Reproducing the gate figure with a method that reads the data correctly is what makes the number defensible to anyone who checks the working. Had the fix been applied to the fetch alone, the figure would have been 10.87 GWh and the gate would have looked like a failure.

**Cost implication:** live queries fetch four periods of BOALF rather than one. The windows fetch in parallel and the response is a few hundred items either way, so measured latency is unchanged (~200ms). Recorded because it raises the per-request payload from the spike's estimate in 002.

---

## 008 — The composition: a north–south section, not a dashboard

**Date:** 2026-07-24
**Phase:** Phase 1 (stream B — static canvas)
**Decision:** The screen is laid out as a vertical section through Britain. Reading top to bottom: what Scotland is making, how much of it is switched off, the line that stops it travelling, what burns in the south instead.

**Reasoning:** The project plan states the paradox chain — wind, constraint, substitution, cost — and asks for one screen with one argument. The chain is already geographic, so making reading order match geography means the layout carries the argument rather than merely containing it. The alternative shapes all weaken it: a panel grid invites the eye to compare rather than to follow, and a map of Britain would spend most of the screen on coastline that carries no data.

The two region bars do the heaviest lifting. They are drawn on the same scale, in the same fuel sequence, one directly above the other, so the length of the fossil tail is comparable north to south before any number is read. Fuels are ordered zero-carbon first and fossil last rather than by size, which keeps a segment in the same place between refreshes — necessary once the bars animate in phase 3.

**What was rejected:** A map (coastline is not data); a left–right split of Scotland against England (loses the sense of power failing to travel, and puts the constraint in a vertical gutter where it reads as a divider rather than a barrier); a panel dashboard (explicitly out of scope, and the one-screen rule exists to prevent it).

---

## 009 — MW carries the typographic weight; MWh supports it

**Date:** 2026-07-24
**Phase:** Phase 1 (stream B)
**Decision:** Resolves the question left open in 006. The instantaneous MW figure is the headline. The settled MWh figure stays on screen as a single line beneath it, always named as a completed period.

**Reasoning:** Two arguments point the same way. MW is the only figure that is honest at every moment inside a settlement period, which is what 006 established. And MW shares a clock with the generation mix directly above it, so the two readings on the top half of the screen are measurements of the same instant — pairing a current mix with a settled-period-only curtailment figure would put two clocks side by side without saying so.

MWh earns its line because energy is what the money is eventually paid against, and because a reader who wants to convert the figure into something felt needs a quantity, not a rate. It did not earn the headline: a figure that only settles on the half-hour cannot lead a screen whose whole claim is about now.

**What was rejected:** MWh as headline (lags the mix by up to thirty minutes on the same screen); MWh moved to the method note (loses the only figure that accumulates, and with it the sense of scale over time).

---

## 010 — Copy is a function of state, including the unreadable state

**Date:** 2026-07-24
**Phase:** Phase 1 (stream B)
**Decision:** Every sentence that asserts something about the constraint is written three times — constrained, clear, and unknown — and selected from the data. The headline's tense follows freshness. The masthead's second line is a slot that carries the standfirst normally and a staleness notice when the reading is old.

**Reasoning:** This was not the plan going in; building the states surfaced it. With static copy, the calm-day screen said "Scotland generates more than the network can carry away" while showing no curtailment, and the Elexon-outage screen asserted that the network was coping at the exact moment the page could not tell. Both are false claims made confidently, which is the specific failure the product cannot afford: a reader who checks one of them stops trusting the number as well.

The same reasoning forced the tense. A 47-minute-old reading under the words "right now" is wrong regardless of what colour the timestamp is; staleness treatment that only recolours a dot leaves the lie in the largest type on the page. So the predicate changes to "was being held off the grid when this was last read", and the standfirst — which a returning visitor does not need — gives its place to the notice. Swapping rather than adding also keeps the composition to one screen in every state.

**Consequence for phase 2:** the narration prompt inherits this. It must be told the freshness and the constraint state, not only the figures, or it will generate the same confident sentence the static copy did.

---

## 011 — Provisional identity: DM Sans, dark only, no forecast element

**Date:** 2026-07-24
**Phase:** Phase 1 (stream B)
**Decision:** Three deliberately provisional calls, made to get V1 standing rather than to settle the identity.

**Type:** DM Sans, self-hosted as a variable font, routed through a single `--font-sans` token. Weight carries hierarchy — light for the large figures, medium for the small ones — which leaves colour free to mean fuel and only fuel. Swapping the family is one declaration. Owen's established Fraunces/IBM Plex palette was not inherited, per the plan's note that Windfall may warrant its own identity.

**Ground:** dark only. The reference (earth.nullschool) is a lit field on a dark ground, and the fuel palette is built to glow against it. A light variant would be a second design rather than a setting, and slice one does not have room for two.

**Forecast:** the 24-hour forecast is fetched and cached but not drawn. It does not sit on the paradox chain — it is context, and context is what turns one screen into a dashboard. It stays in the payload because phase 2's narration wants forecast direction, which is a sentence rather than a chart.

**Trigger for revisiting:** all three on Owen's review of the built screen, which is the point at which there is something concrete to react to.

---

## 012 — The state toggle ships in production

**Date:** 2026-07-24
**Phase:** Phase 1 (stream B)
**Decision:** The five-state switcher is reachable on the deployed site at `?state=…`, not stripped from the production build. Each fixture is the captured live payload bent into the shape of a state and rebased onto the real settlement clock.

**Reasoning:** Four of the five states cannot be summoned on demand — a calm day, an Elexon outage, a stale cache. The case study capture pack needs all of them from the deployed artefact rather than from a dev server, and a reviewer following a link should be able to see the degraded state without being asked to take it on trust.

The rebasing matters more than it looks. Without it every fixture screen would read as hours old and the staleness treatment could not be judged against the states it is supposed to distinguish from.

One fixture is deliberately not a straight copy: the calm-day mix moves Scotland's wind onto imports, nuclear and hydro rather than gas, because Scotland has almost no gas plant. A fixture showing 60% gas in Scotland would teach the wrong thing to anyone reviewing the state.

**Cost:** the captured sample adds roughly 15 kB to the bundle, which is most of the 9 kB gzipped JavaScript. Acceptable at this size; if it grows, the fixtures move behind a dynamic import keyed on the query parameter.

---

## 013 — The cross-check lands: the gap to press figures is a method-family difference

**Date:** 2026-07-24
**Phase:** Phase 1 (stream C — cross-check)
**Decision:** Closes the follow-up left open in 002 and 003. Windfall's derivation is validated against a second balancing-mechanism source and agrees with it. The 0.42x ratio to the public tracker is a difference between method families, not a Windfall error, and the method note now says so on evidence rather than on conjecture.

**The comparator:** the UK Wind Curtailment Monitor (Peter Dudfield and Archy de Berker, `wind.axle.energy`). Its published methodology confirms the same two datasets Windfall uses — FPN for what units declared they could generate, BOAL for what the grid instructed instead — so it is a genuine member of the same family rather than a second opinion from a different one. Its chart legend reads "Wind Potential", which could be mistaken for an availability model; the methodology makes clear the potential is the physical notification.

**Results.** Six days, chosen to span a near-calm day to a heavily constrained one, with a run of consecutive recent days added after the first pass showed the largest disagreement on the most recent date.

| Date | Windfall | Monitor | Ratio |
|---|---|---|---|
| 13 June | 51.08 GWh | 58.50 GWh | 0.873x |
| 20 June | 23.75 GWh | 23.50 GWh | **1.010x** |
| 18 July | 11.00 GWh | 10.90 GWh | **1.010x** |
| 21 July | 7.73 GWh | 7.80 GWh | **0.992x** |
| 22 July | 0.55 GWh | 0.60 GWh | 0.913x |
| 23 July | 9.26 GWh | 7.20 GWh | 1.287x |

*These are the figures from the 50-unit list. 015 replaces that list and re-runs the whole table; the conclusion of this entry survives, the 13 June row does not.*

Three of six agree within 1%; mean ratio 1.014x. A fourth, 22 July, differs by 0.05 GWh — inside the 0.1 GWh the monitor rounds to, so it is agreement that cannot be measured more finely rather than a 9% miss. On 20 June — the phase 0 validation date — Windfall reads 23.75 GWh against the monitor's 23.50 while the public tracker reports 56.45. **Both balancing-mechanism methods sit at roughly 0.42x of the tracker.** That is the finding: the gap is a property of the method family, and it reproduces in a project that has nothing to do with this one.

This upgrades 003 from a defensible position to a supported one. The floor framing was always the honest choice; it is now also the demonstrably consistent one.

**On the two outliers, and what was ruled out.** Two divergences in opposite directions cannot share one cause. Being *higher* than the monitor is the informative case, because the monitor covers more units than Windfall's 50 Scottish ones, so scope can only push its figure up.

Three hypotheses were tested and eliminated:

- **The zero-clamp (007).** Measured directly: over-instruction energy is **exactly zero** on all six days. Wind units are never instructed above their declaration, which makes sense — an offer to generate more is not physically available to a wind farm. The clamp is a correctness safeguard that never binds on this dataset. Worth knowing, and it means 007's stricter reading costs nothing.
- **The SO flag.** Acceptances distinguish system-operator actions from energy balancing, and Windfall counts both. On 23 July every acceptance is already SO-flagged, so the flag cannot explain that day's excess. On 20 June, filtering to SO-only slightly *raises* the figure, via acceptance precedence — removing a higher-numbered non-SO acceptance lets a lower instructed level win.
- **Recency.** 23 July is the most recent complete day, so unsettled data was the obvious candidate. But 21 and 22 July are nearly as recent and agree at 0.992x and 0.913x.

So 13 June is most likely unit scope — a heavily constrained day is when curtailment outside a 50-unit Scottish list is most likely to appear. 23 July was recorded as unexplained rather than attributed to the nearest plausible cause. It has since been explained; see 014. **Unit scope was the right guess and is confirmed in 015**, which also shows it overshoots: with the full population the day lands 17% *above* the monitor.

**A caveat on ratios.** The monitor publishes to 0.1 GWh. On 22 July the absolute difference is 0.05 GWh and the ratio of 0.913x is mostly rounding. Ratio is the wrong statistic on a near-calm day, and the product should never be tempted to display one.

**Consequence for the product:** the method note previously stated that larger published figures "are usually derived by estimating how much wind was available and subtracting what was metered". That was conjecture presented as fact — precisely the failure 010 named — since the tracker does not publish its method. It is replaced by what can be shown: that an independent tracker reading the same balancing data agrees with Windfall to within about 1% on most days. "On most days" is doing honest work there and should survive future copy edits.

**What was rejected:** wiring the monitor in as a live comparator (Windfall must never need another project to be up in order to render, and the cross-check is a validation, not a feature); citing the agreement as a precise figure such as "within 1%" without qualification, when it is three days in six.

---

## 014 — The 23 July outlier was a gap in the comparator, found by localising before theorising

**Date:** 2026-07-24
**Phase:** Phase 1 (stream C)
**Decision:** 23 July is resolved. The monitor's published series for that day is missing two half-hours, 19:00 and 19:30, and those two periods carry 1,696.5 MWh in Windfall's derivation — 84% of the 2.03 GWh disagreement. Excluding them, the day agrees at 1.046x rather than 1.287x (1.049x against 1.297x on the 015 unit list), which puts it in line with every other day sampled.

**How it was found, which is the part worth keeping.** Three hypotheses had already been eliminated in 013 by reasoning about mechanisms — the clamp, the SO flag, recency. A fourth guess would have been the same move again. Instead the question changed from *why* to *where*: `scripts/day-profile.ts` prints the day per period and per farm, on the argument that a single farm, a single window, and a uniform spread each imply a different cause and the shape distinguishes them before any mechanism is proposed.

The shape showed one continuous evening event peaking at 19:30 — exactly where the comparator turns out to have no data. Localising first would have found this before any of the three mechanism hypotheses were tested, and the general lesson is to reach for the profile before the theory.

**Confirming it is specific to that day:** the monitor's own chart traces were read directly. 23 July returns 46 half-hourly points where a settlement day has 48; 21 June and 13 June both return a complete 48 with no gaps. The daily headline figure is the sum of the same incomplete series (7.231 GWh against a published 7.2), so the gap propagates into the published total rather than being a plotting artefact.

**Said plainly and without inflation:** this is a missing-data gap in a hourly-updating side project, on a day that was then the most recent complete one. It is the kind of thing that may well self-heal on a later ingest, and it says nothing about the monitor's method — which is the thing the cross-check was actually testing, and which continues to agree with Windfall. Finding it does not make Windfall more right; it removes a false disagreement.

**A residue that is not explained.** The missing periods account for 84% of the gap, not all of it. From 22:00 to the end of the day Windfall reads consistently higher — 1,991 MWh against 1,647, a further 344 MWh. That tail is unexplained and is left so. The candidate is the same late-day incompleteness affecting the final hours less totally, but nothing here demonstrates it.

**Consequence for the method note:** the note said 23 July was "not yet explained". It now reports the corrected figure *and* the correction, because a reader reproducing the comparison from the monitor's site today would get 29%, not 5%. Presenting only the corrected number would fail the exact test the note exists to pass.

**What was rejected:** dropping 23 July from the sample (removing the day that disagrees is how a validation becomes a decoration); reporting only the corrected 1.046x (unreproducible from the public source); treating the finding as an error in the monitor (it is a gap in one day's data, found in a project whose author openly describes it as evenings-and-weekends work, and the courtesy costs nothing).

**Correction made while writing this up:** the first pass through these ratios counted four days within 1% rather than three, by reading 22 July's 0.913x as agreement. It is agreement, but by rounding rather than by measurement, and the two are not the same claim. Recorded because the note's whole purpose is to survive a reader checking the arithmetic.

---

## 015 — The BMU list was validated on the one day its gaps could not bind

**Date:** 2026-07-24
**Phase:** Phase 1 (review follow-up)
**Decision:** Replace the 50-unit hand-curated list with all 112 transmission-connected Scottish wind BMUs, derived from Elexon's BM unit registry. Closes the "most likely unit scope" left open in 013.

**The test 013 called for.** 13 June was re-derived over every transmission-connected wind BMU, then split into tracked and untracked using Windfall's own level derivation, so the comparison is like-for-like. The reimplementation reproduced the tracked figure exactly.

| Date | Tracked 50 | Everything else |
|---|---|---|
| 13 June (heavy constraint) | 51.08 GWh | 18.45 GWh across 41 units |
| 20 June (the validation date) | 23.75 GWh | 0.00 GWh |
| 23 July | 9.26 GWh | 0.15 GWh, mostly London Array |

**Why this is the part that matters, and not the number.** The gap is ~0 on ordinary days and ~36% of the headline on heavily constrained ones. The phase 0 check — 19 of 20 units with acceptances on 20 June were in the list — was therefore run on the single day where the list's gaps could not bind. **The list looked validated because it was validated on a light day.** A coverage check has to be run on the day the product is about, which is the constrained day, or it measures nothing.

Two omissions self-evidenced without any geography: GORDW-1 was missing while GORDW-2 was tracked as "Gordonbush Ext", and WHILW-1 (309 MW) was missing while WHILW-2 was tracked as "Whitelee Ext". The extensions were in and the parent farms were out — a shape that says the list was assembled by recognising names rather than by enumerating a population.

**The new basis.** Every BM unit with `bmUnitType` T and `fuelType` WIND whose farm is in Scotland or Scottish waters: 112 units, 13,105 MW, capacities taken verbatim from the registry's `generationCapacity` so the total on screen traces to a published figure. Membership stays a static list because the registry has no usable location field for transmission units (`gspGroupId` is populated only for embedded ones) — so "in Scotland" is a judgement made once, in `api/_lib/bmus.ts`, and never at runtime.

The floor framing (003) is unaffected: embedded and distribution-connected Scottish wind still does not appear, and Baillie (BABAW-1) is the nearest miss — Caithness, registered E rather than T.

**What it does to the cross-check.** The whole table was re-run:

| Date | Windfall (112 units) | Monitor | Ratio |
|---|---|---|---|
| 13 June | 68.34 GWh | 58.50 GWh | 1.168x |
| 20 June | 23.75 GWh | 23.50 GWh | **1.010x** |
| 18 July | 11.10 GWh | 10.90 GWh | **1.018x** |
| 21 July | 7.90 GWh | 7.80 GWh | **1.013x** |
| 22 July | 0.57 GWh | 0.60 GWh | 0.954x |
| 23 July | 9.34 GWh | 7.20 GWh | 1.297x |

Three days sit within 2% where three sat within 1%, and 22 July's difference is still 0.03 GWh — inside the monitor's rounding, as 013 said. 13 June has flipped from 13% low to 17% high, which is a real change of sign and is **not** claimed as resolved. Windfall now measures a larger population than the comparator does on the day when population matters most; that is a plausible reading of a 1.168x, not a demonstrated one, and the honest position is that the largest disagreement in the sample moved rather than closed.

**Consequence for the product:** the method note's coverage line is generated from the payload, so it now reads 112 units and 13,105 MW, and "transmission-connected Scottish wind units" is finally the population rather than a subset of it. The cross-check paragraph is rewritten against the new table, including the 17%.

**What was rejected:** adding only the ~21 farms the 13 June split named (that repeats the original error — patching a list by recognition instead of enumerating a population, and the next constrained day would find the next gap); deriving membership at runtime from `gspGroupId` (not populated for T units, so it would silently empty the list); keeping the old capacities where they differed from the registry (two sources for one number is how 002's 8,533-vs-8,574 drift happened).

---

## 016 — "Has not answered yet" is a state, and the page was skipping it

**Date:** 2026-07-24
**Phase:** Phase 1 (review follow-up)
**Decision:** Model the pre-first-fetch state explicitly. The four states in 010 become five, with a sixth screen (`?state=waiting`) in the toggle.

**The failure.** `main.ts` rendered synchronously with empty feeds, before `refresh()` had issued a request. With no loading state in the model, empty-and-untried rendered identically to tried-and-failed, so every cold load opened on three confident false claims: "Windfall is not reaching its data sources", "Elexon's balancing data did not answer this time", "no reading arrived this half-hour". It was the exact failure 010 names, on the first screen a reader following a link ever sees, and it lasted as long as the first fetch took — longer on a cold function with a CDN miss. `data-boot` was no help either: it was set before the fetch resolved.

**The distinction, which is the whole entry:** *did not answer* is a claim about a source. *Has not answered yet* is a claim about us. The page may only make the first one after it has actually asked.

So `AppState.pending` is true until the first fetch settles, the copy in that state describes what the product is doing and asserts nothing about the data ("Windfall is asking Elexon what is being held down this half-hour. Nothing is claimed until it answers"), the freshness dot is drawn hollow because green, amber and red are each already a claim, and `data-boot = 'ready'` now marks the first *resolved* fetch.

**What was rejected:** a spinner (it says "wait" and nothing about what is being waited for, and this page has room to say it in words); holding the first paint until data arrives (a blank screen is not more honest than one that says what it is doing); keeping the strapline off the waiting screen (a reader who has just followed a link still needs the product introduced — the notice slot is only spent on warnings, per the masthead's slot rule).

---

## 017 — Rollover is not staleness, and tense is a page-wide rule

**Date:** 2026-07-24
**Phase:** Phase 1 (review follow-up)
**Decision:** Currency is two independent questions — how old is the reading, and is the period it describes still running — and every present-tense claim on the page answers both before it is printed.

**Rollover.** 005 claimed the 5-minute TTL "sits well inside the thirty-minute settlement period, so the cache never hides a rollover". That is wrong: a TTL inside a period does not align with one. Land just after a rollover and a CDN hit produced "Settlement period 47 · 23:00 to 23:30 · Read 4 minutes ago" under a green dot while period 48 was running — and inside the stale-while-revalidate window it could be older still. Freshness was computed only from `fetchedAt`, so nothing on the client ever compared the payload's period against the period actually running. `msUntilRollover` already existed in `settlement.ts` and was unused; the payload names its own period and that period has an end time, so the comparison is exact. The masthead now names the closed period and the clock drops to amber.

**Tense.** 010's argument — a stale reading under a present-tense claim is wrong regardless of what colour the timestamp is — was applied to the headline only. Directly beneath a correctly past-tense headline, the constraint still read "The transmission network ... **is** full" and the north band "Scotland **is** generating more than it can use", both against a 47-minute-old reading. The caption machinery already selected on state; freshness is one more axis, and it now runs through the constraint, both band captions and the narration. The narration takes the cautious reading: every feed it draws on must be current for it to speak in the present.

Each element asks about *its own* payload rather than the page's worst feed, for the same reason each owns its own health — the mix can be current while the curtailment reading is not. That is `speaksOfNow(fetchedAt, settlement, now)` in `state.ts`, taking the element's own two facts.

**Also fixed under this heading, all of them the same species of small dishonesty or noise:**

- **The narration fabricated a zero.** `Math.round(forecast ?? actual ?? 0)` stated 0 gCO₂/kWh as fact when both readings were null, where `formatIntensity` says "unknown" for exactly that case. This text is phase 2's guaranteed fallback, so the invented figure would have shipped as the thing shown when generation fails. It now omits the clause.
- **"1 grams".** Same expression, and live on screen: 1 gCO₂/kWh is an ordinary Scottish reading on a windy day, i.e. the flagship state.
- **A forecast-only outage downgraded a healthy source.** `overall` folded in the 24-hour forecast, which per 011 is deliberately not drawn, so Carbon Intensity could report "partly answering" with every visible element fine. It now folds national and regional only — nothing owns the forecast yet.
- **`role="separator"` on the constraint.** ARIA treats a non-focusable separator as children-presentational, putting a link in the paradox chain at risk of not being announced. It is a content block drawn with rules, and the rules were already `aria-hidden`.
- **The dev toggle covered the argument.** Fixed-positioned, it sat over the south band's caption at desktop widths in every state — and 012 says the capture pack comes from these deployed screens. It now follows the colophon in normal flow, out of the composition entirely.
- **"and Edinbane and Gordonbush".** `joinList` already supplies the "and".
- **Dead exports** `msUntilRollover` (now load-bearing) and `FOSSIL_FUELS` (deleted).

---

## 018 — Narration is cached by settlement period, not by TTL

**Date:** 2026-07-27
**Phase:** Phase 2
**Decision:** `/api/narration` is keyed on `?date=&period=`, not on a flat CDN TTL like grid.ts and curtailment.ts. The TTL it sets is however long the requested period has left to run (`msUntilRollover`, floored at 30s), so one successful generation serves every visitor for the rest of that period, and the next period gets a fresh generation rather than a stale one.

**Reasoning:** 005's flat-TTL caching works for grid and curtailment because a cache miss just re-fetches the same upstream facts — the CDN is a performance optimisation, not a correctness requirement. For narration a cache miss would produce a *different sentence describing identical data*, which breaks "one generation serves all visitors" (the project plan's cost control) and would make phase 3's regeneration-on-rollover motion moment fire on CDN misses instead. Making the settlement period the cache key makes the cache unit and the content unit the same thing.

The client always requests the period its own `settlementAt()` names; the query param is a cache key and an abuse bound, not a way to request history. The server validates it against its own clock (current or immediately previous period only) and 400s anything else — bounding the key space against a client asking for `period=99999` and forcing unbounded distinct cache entries. It does not otherwise change what gets generated: the function always describes its own current period regardless of what was asked for, and a genuine clock-skew mismatch is caught downstream by 019's period-matching check rather than by this validation.

**Where the data comes from:** the function calls `api/grid.ts` and `api/curtailment.ts`'s handlers in-process (the same shim pattern `vite.config.ts`'s dev server already uses), not over HTTP. This is the exact code path a visitor's own request runs, with no URL or CORS bookkeeping — but it does mean the function makes its own fresh Carbon Intensity and Elexon calls rather than reading the CDN copy, at most once per settlement period. **This is a known, accepted drift, not a solved one:** the narration is generated once near the top of a period and can sit on screen for most of it, while the headline MW keeps refreshing every five minutes as acceptances land. A narration citing an exact MW figure would start contradicting the number two rows above it within twenty minutes. The fix is in the prompt, not the architecture: narration figures are rounded far coarser than the screen's own (MW to the nearest 100, percentages to the nearest 5 — see `_lib/narration-prompt.ts`), which absorbs the drift rather than pretending it does not exist.

**Fixtures never call this function.** `scenarios.ts` builds every state synchronously with no network access, so `Feeds.narration` is `null` for all five toggle states by construction — the narration view falls back to its template, which is correct (paying a model to describe a grid that is not real would be worse than not doing it, not better). No special-casing was needed; this fell out of the existing scenario architecture once `feeds()` was changed to spread `emptyFeeds()`.

**Rejected:** serving a template narration from the server function itself when generation fails. Keeping the fallback client-side means a transient Anthropic failure self-heals on the next request instead of pinning a template sentence at the CDN edge for up to thirty minutes, and it means the narration slot survives even if this function is entirely unreachable — a guarantee the function cannot make about itself. See 019.

---

## 019 — The model never has to get tense right

**Date:** 2026-07-27
**Phase:** Phase 2
**Decision:** Generated narration is only ever shown when the reading it describes is current enough to speak in the present — the same `speaksOfNow`-derived `present` check the deterministic sentence already used (017) — and when its named settlement period matches the one the rest of the screen is showing. Any mismatch falls through to the local template, which already handles the past tense correctly. The narration function itself never receives or reasons about tense; it only ever describes the period it was generated against, in the present.

**Reasoning:** The alternative — generating past-tense sentences for the stale and degraded states too — turns out to be mostly illusory rather than merely harder. A client whose reading has gone stale or whose settlement period has rolled over is, in the overwhelming case, in exactly the situation where a *fresh* narration fetch would also be unreachable or would describe a different period than what is on screen (the same network or platform condition explains both). So "the model speaks in the past" would mostly mean serving a cached *present*-tense generation into a screen that has moved into the past — worse than the template, not better. Pushing the entire tense question onto client-side matching against a structural fact (does the fetched narration's named period equal the period on screen?) is both simpler and more correct than asking a model to reliably hedge its own currency.

**Consequence, and a phase 3 hook:** because of this, a client holding a valid generated sentence for period *N* will swap to the deterministic past-tense template the instant period *N* closes, until period *N+1*'s narration arrives (which, per 018, can take a moment — it is generated fresh, not pre-warmed). That swap is a real transition and belongs in the phase 3 motion inventory alongside rollover and the other narration-regenerates moment; it is not built here.

**Also decided here — the guardrail that lets a 30-minute-cached, unreviewed sentence ship at all:** the model is handed only pre-rounded, pre-labelled facts (`factsOf` in `_lib/narration-prompt.ts`) and told to use no other figure. `validate()` extracts every digit run from the output and rejects the generation unless each one traces back to a digit in the facts it was given — plus a word-count band (40–70), a ban on "!", and an outright ban on "you"/"your" and a short advice-verb list, rather than trying to pattern-match imperatives. A failed validation retries once, then the function reports `health: 'failed'` per 018 rather than caching anything. Tested against a deliberately hallucinated figure, a too-short sentence, second-person address and an exclamation mark — all four correctly rejected; the one legitimate sentence correctly passed. `npm run narrate:eval` runs this bench against the curtailing, calm and degraded fixtures (the three with anything to narrate — `waiting` and `offline` carry no data) and is the phase 2 prompt-iteration log: without a key it prints facts and prompts for editing; with one, it prints the generated text and the validator's verdict.

---

## 020 — The motion pass: one mechanism serves both witnessed moments

**Date:** 2026-07-27
**Phase:** Phase 3
**Decision:** The motion inventory is reordered by how many visitors actually see each moment, not by how it reads in the project plan. Data steps every 30 minutes and the refetch runs every two, so most visitors see a static screen for their whole visit; a motion pass built only around rollover and curtailment-engaging would be invisible in practice. The two moments every visitor witnesses — arrival, and a landing while they stay — are built first, and they share one mechanism: a per-field crossfade (`setTextCrossfade`, `dom.ts`) staggered down the paradox chain by a `--i` custom property screen.ts sets on each section root (north 0, headline 1, constraint 2, south 3, narration 4). Arrival and refresh-landing are not two animations; arrival is simply the first landing, and the placeholder-to-real-reading swap crossfades exactly like every later swap does. This was also the simpler build: no sequencer, no fetchedAt fingerprinting, no separate hide/reveal state — the delay is a CSS custom property read by the transition, not a timeline a script has to keep in sync with the DOM.

**The honesty rule this pass runs on:** motion is a claim, and it can undo 016/017/019's work silently. Three rules follow from that and are checked against every transition below:
- **No figure is ever tweened.** An odometer roll on the headline MW implies continuous observation of a value that was, in fact, polled twice, two minutes apart, across a discrete step. A crossfade says "this was replaced," which is true; a count-up says "this changed continuously," which is never true of a 30-minute-settled reading.
- **Nothing moves slower than the event it reports.** `--dur-slow` is 900ms. A 30-minute step tweened over seconds would be a picture of something that never happened.
- **Reduced motion removes duration, never information.** Every CSS transition's duration collapses to ~1ms under `prefers-reduced-motion: reduce` (tokens.css); every state a transition reaches is still reached, immediately, with no distance travelled and nothing carried by movement alone.

**The motion inventory:**

| Trigger | What moves | Duration / easing | Reduced motion | What the transition claims |
|---|---|---|---|---|
| Arrival: placeholder → first real reading | Every crossfade node, staggered by section | `--dur-quick` (180ms) each, `--stagger-step` (90ms) apart, `ease-in-out` | Instant, no stagger | "This is what was asked for, in reading order" — not "this value is rising" |
| Refresh landing: a genuine new payload changes a claim | Same crossfade, same stagger | Same | Same | "This claim was replaced" |
| Mix or curtailment share changing | `.mix__seg` flex-basis, `.share__fill` width | `--dur-base` (420ms) `ease-out`, same per-section stagger | Instant | A proportion changed; the new proportion, not the path to it |
| Tense flip: `speaksOfNow` goes false while the toggle sits on a state | Band caption, constraint body, headline predicate, narration strap — the same crossfade nodes, now firing on the 15s render tick rather than a fetch | `--dur-quick`, staggered | Instant | "The page has stopped claiming *now*" — this is its own row, not a side effect of the data-landing row above |
| Narration: template ⇄ generated | `.narration__body`, `.narration__strap` | `--dur-quick`, section index 4 (last in the chain) | Instant | Provenance changed, per 019's existing swap logic — unaffected by this pass, just now animated like everything else |
| Constraint engaging | Flow marks: `background-position` keyframe on `.constraint__rule`, `data-state='constrained'` only | 1.6s linear loop, density (dash pitch) scaled 1×–3× by curtailed share ÷ tracked capacity | `animation: none` (JS loop, so this is the one moment `prefers-reduced-motion` alone cannot reach — `lib/motion.ts` is the CSS-can't-do-this escape hatch, though this particular case is handled in CSS since it's a plain animation, not rAF) | Marks run along the rule and are *clipped at the rule's own box edge*, against the text — not faded — because the metaphor is "the power stops here," not "the power fades out" |

**Four things the initial proposal missed, found while verifying its code claims against the actual source, folded in before building:**

1. **Arrival was gated on the slowest feed.** The old `fetchFeeds()` (`client.ts`) awaited grid, curtailment and narration together in one `Promise.allSettled`. Per 018, narration is a live Anthropic call on a cache miss — several seconds, plausibly, against a 10s timeout — so the first visitor of every settlement period had their entire screen wait on the model finishing a sentence. `client.ts` is now `fetchCoreFeeds()` and `fetchNarration()`, and `main.ts`'s `refresh()` renders after each resolves independently. The narration landing late is not hidden latency; it is the template-to-generated swap row above, now actually observable instead of blocking everything ahead of it.
2. **The legend was rebuilt every tick.** `band.ts` called `legend.replaceChildren(...)` with fresh nodes on every `update()`, and `update()` runs on the 15s render tick regardless of whether the mix changed. Any transition on legend items would have refired every 15 seconds. `band.ts` now keys the legend on a content signature (`fuel:pct` pairs, joined) and only rebuilds when that signature changes — the same diff discipline every other field already had via `setText`'s no-op guard.
3. **The crossfade helper had to be opt-in, and the tense-flip needed its own inventory row.** A blanket helper would have made the masthead's "Read 4 minutes ago" crossfade every minute, since the render tick changes that text continuously — it stays on plain `setText`. Conversely, the present→past flip (row 4 above) fires from the clock, not from a payload landing, and for a visitor who stays on the page it is one of the more likely transitions to actually witness — it was missing from the first draft of this inventory entirely.
4. **Toggle-driven captures needed a labelling rule, and the toggle had a sibling.** The state toggle used to reload the page on every switch (`location.search = …`), so no transition it exists to demonstrate was ever observable from it. `toggle.ts` now exposes `setActive()` and `main.ts`'s `selectScenario()` switches in place (clearing feeds first, so a switch reads as a fresh, honest arrival rather than the old scenario's numbers under the new one's chrome), with `history.replaceState` keeping the URL honest. The dev keyboard cycler (`[`/`]` in `main.ts`) shares the same path. But a toggle-driven "curtailment engaging" recording is a synthetic juxtaposition of two fixtures, not the event — by this entry's own honesty rules, presenting one in the case study as the real transition would be exactly the failure 013/014 exist to avoid. **Any capture used in the case study that was produced via the state toggle rather than a live rollover must be labelled as a fixture demonstration, not a captured live transition.**

**What was rejected:**
- **A separate arrival animation** (opacity/translateY reveal, distinct from the ordinary data-swap crossfade). Superseded by point 3 above's realisation: the placeholder-to-real-reading swap already *is* a text replacement, so the existing crossfade produces the arrival effect for free, staggered the same way. Two animation vocabularies for what is structurally one event would have been the premature abstraction this project's own conventions warn against.
- **A continuous settlement-period countdown in the masthead.** Considered and explicitly ruled out: section 5.4 of the project plan says never imply per-second liveness, and a moving countdown is exactly that, on a page whose honest claim is half-hourly. The masthead already names the period and the age line already carries currency.
- **Counting the headline MW up or down between readings.** Directly against the "no figure is ever tweened" rule above — the number did not arrive continuously, so it must not appear to.

**Flow marks: kill criterion, pre-registered rather than decided after the fact.** The flow marks are the highest-craft, highest-risk item in this pass — the motion `constraint.ts`'s own header comment has promised since phase 1. Scoped exactly as approved: density derived from the curtailed share (not decorative), must visibly stop at the constraint rather than fade, built last in the sequence, after every other row in the inventory above is shipped and polished. **If it is not resolved to the quality bar by end of day 11 of this phase, it is cut**, per the project plan's "cut scope, never polish" risk mitigation — and cutting it under this pre-registered criterion is the plan working as designed, not a retreat, so it should be logged as such rather than as a shortfall if it comes to that.

---

## 021 — The map returns: the coastline becomes the container for data

**Date:** 2026-09-16
**Phase:** Map page (v2 direction)
**Decision:** Windfall's next page is a map of Britain: white island on cream, the Scotland–England border drawn as the bottleneck, live Scottish wind flowing from real farm locations, the Scotland and England mixes beside their countries, the curtailment headline under Scotland's mix. Built at `/map` alongside `/` and `/flow`, replacing both when it reaches the bar. The plan is [Windfall_Map_Spec.md](Windfall_Map_Spec.md).

**This reverses 008,** which rejected a map because "coastline is not data" and a map "would spend most of the screen on coastline that carries no data". Both claims were true of the product as it stood in July. Two things changed. The flow experiment (August) showed the island's shape is where the motion reads; the journey south only means anything against the geography it crosses. And the data now has locations: 112 tracked units at 76 farms, and a border with a name (B6) that the Guardian's 13 September piece calls "the key bottleneck". The coastline has become the container for three things that are data — sources, border, flow — and the flow fills the screen 008 feared would be empty. Recorded as a reversal so the case study can show the reasoning moved with the evidence, not that the earlier decision was wrong when made.

**Decisions made in the same session, each with its reason:**

- **Light only.** 011 warned a light variant is a second design. It is, and this is that design. Cream ground, white island, inky blue wind (the flow's `LIGHT_PALETTE` is the seed). The dark dashboard stays as it is until replaced.
- **Two mixes, Scotland and England, from the published regions.** South England (the current choice) is the gassiest region and reads as cherry-picked. Three regions is a density problem on a map that already carries a lot on the right. England-wide still carries the argument: on the evening of 15 September England read 35% gas and 151 gCO₂/kWh against Scotland's zero.
- **No England and Wales blend.** Tested live. For one half-hour the GB mix was exactly a weighted sum of the England, Scotland and Wales mixes (implied weights 0.917 / 0.031 / 0.052, residuals zero to one decimal), which looked like a way to derive weights from the API. Across the 48 periods of 15 September it was not: the implied Wales weight ranged from −0.43 to +0.05 and residuals reached 8 percentage points, so the GB figure is not a consistent blend of the country figures and no weight can be read from the data. A fixed demand weight (Wales ≈ 6% of England and Wales) would lift the England gas share by 2–3 points on a typical evening. Not worth a modelled number the method note would have to defend, on a product whose position since 013 is "show what can be read". Wales is also volatile on its own (3% gas at lunch, 57% in the evening on the same day, Pembroke ramping), so blending it would make the bar twitchier without making the argument stronger. The bar is labelled England wherever it sits.
- **The flow shows Scottish wind only**, and the page will say so. English and Welsh wind appear only inside the England bar. Adding English offshore sources is a later slice, and a good one given the Guardian's east-coast bottleneck point.
- **Island drawn.** The flow spec's "GB shape never drawn" test is retired for this page. Consequence: coast conformance and density no longer have to draw the silhouette, and offshore farms — which hold most of the curtailed capacity — can sit in the sea rather than snapped to the coast.
- **The border percentage waits for a spike.** Scottish wind splits three ways (used in Scotland, exported over B6, curtailed) and "not curtailed" is the first two together; the exported share needs Scottish demand or the boundary flow, neither of which is in the payload. NESO's Day Ahead Constraint Flows and Limits dataset is the candidate, and it is a forecast, so the copy would have to say so. The spike is deferred until the layout exists, but must land before any significant change to the wind visualisation, because what the border shows may change what the flow has to show.

**What was rejected:** rebuilding the dashboard's section layout in light mode (no geography, so no border and no sources); a choropleth of the 14 Carbon Intensity regions (a dashboard in disguise, and the region boundaries are not in the API); a running blend of country mixes (above); keeping both a dark and a light page (two designs, one product).

**Trigger for revisiting:** the step 1 gate in the plan, where the composition is judged against the real island for the first time.

---

## 022 — Map step 1: geometry, one projection, canvas over SVG

**Date:** 2026-09-16
**Phase:** Map page, step 1 (geometry and composition skeleton)
**Decision:** `/map` exists, wired into Vite as a third page. `buildProjection`/`buildRasterMask`/the raster mask together produce the SVG island, the SVG border and the canvas flow mask from one `Projection`, fitted to a dedicated map-area element and refitted on resize. The seven fictional `/flow` sources still drive the particles, on the light palette, unchanged. `buildWorld` now takes the ring as a parameter (`buildWorld(ring, width, height, options)`) rather than importing `GB_RING` itself, so `/flow` passes `GB_RING` explicitly and `/map` passes the new ONS ring; `/flow`'s own rendering is otherwise untouched.

**Dataset and layer.** ONS Open Geography Portal, "Countries (December 2023) Boundaries UK BGC" — the generalised-clipped layer, per the plan's preference; BUC was never needed. ArcGIS FeatureServer `services1.arcgis.com/ESMARspQHYMw9BZ9/.../Countries_December_2023_Boundaries_UK_BGC/FeatureServer/0`, layer `CTRY_DEC_2023_UK_BGC`, fields `CTRY23CD`/`CTRY23NM`. Fetched directly as WGS84 GeoJSON (`outSR=4326&geometryPrecision=6&f=geojson`) so the ArcGIS server does the BNG reprojection — the full unclamped-precision query 504-timed-out; `geometryPrecision=6` (≈11cm) brought the response back in ~17s at 6.9MB for all three countries, comfortably more precision than the ~1200-point island needs. `scripts/build-gb-countries.ts` is modelled on `build-gb-outline.ts` (same Douglas-Peucker, same spur-pruning pass ported across and left disabled by default for the same reason — a harness before/after on the Natural Earth ring found it worse, not re-tested against this ring) but written as its own self-contained script per that file's own convention, not a shared import.

**Island and border, both from a raster union rather than vector topology.** England, Scotland and Wales's mainland rings (largest ring by area per country — 356x, 31x and 29x margins over the next-largest, i.e. unambiguous) are independently generalised, so their vertices don't line up exactly at the shared border the way a single-topology dataset's would. Rather than try to match vertices, both `island` and `border` are found by rasterizing the three mainland rings and working on the pixel grid: `island` is the union (OR) of all three masks, closed with mask.ts's own 1px-radius dilate-then-erode (without it, the independently-rasterized seam between adjacent countries can fracture the union — it did: one 21px sliver split off and was dropped via largest-connected-component, out of a 461,052px mainland) and traced back to a ring the same way `build-gb-outline.ts` traces a pruned spur. `border` is the stretch of England's own traced boundary that sits within 3px (proxy-resolution) of a Scotland pixel — i.e. the arc of England's perimeter that borders Scotland, as opposed to the coastline or the England/Wales border, extracted as the longest contiguous run and oriented Solway → Tweed. Result: 131 points, `[54.953, -3.123]` to `[55.757, -2.062]` — Gretna to Berwick, as expected. Verify before use if this script is rerun against a newer ONS release: the union-split warning it prints should stay at a handful of stray px, not something structural.

**Fit rule.** `buildProjection` is unchanged; it's fitted to a dedicated `.map__stage` element (not the viewport), sized by CSS Grid to a 60%-width column of the composition row, matching the plan's "left 60%" language. The drawn island itself only fills about a third of that column's width at a typical desktop size (measured: 556 of 1590 device px, i.e. ~35%), because GB's own aspect ratio in projected-degree space is tall (spanY:spanX ≈ 1.87:1) against a landscape-oriented stage, and the page-anatomy rule elsewhere in this plan ("one viewport tall on a laptop") caps how tall that stage can get — there is no stage height at a sane desktop width that would let a GB-shaped fit use the column's full width. So "60% of the viewport" is implemented here as the reserved area for the map (island plus its overlaid panels and breathing room), not a claim that the coastline itself spans that width. Flagged for Owen's proportion judgement at the gate rather than resolved unilaterally — this is exactly what the gate is for.

**Canvas over SVG (§7.2).** Tested by reasoning through both, not by building both in parallel. The alternative — painting the island into the canvas wash the way `/flow` paints its flat background — was ruled out because it would mean either dropping the SVG island the plan's own deliverable list asks for, or maintaining two overlapping island renderers with more drift risk between them for no benefit. Canvas-over-SVG needed one change: the wash step (in `map/main.ts`'s own frame loop, not `particles.ts`) uses `globalCompositeOperation = 'destination-out'` with a low-alpha black fill instead of `/flow`'s flat-colour `fillRect`, so trails fade toward *transparent* — letting the crisp SVG island show through — rather than toward an opaque background colour, which would otherwise converge to fully hiding the SVG within a few seconds exactly like `/flow`'s own wash does to its (single, flat) background. `particles.step()`/`particles.render()` are untouched. Confirmed visually in the browser at 1440×900 and 375×812: the island reads white and crisp under the flow at every zoom level tested.

**What the ONS ring changed about containment.** Nothing structural — `flow:harness --ring=ons` (30s, 3000 particles, default field params, unmodified from the `--ring=ne` baseline) holds the hard containment invariant (escape samples: 0, both rings) and moves every other metric by single digits to low teens, not qualitatively:

| Metric | `--ring=ne` (Natural Earth) | `--ring=ons` (ONS BGC) |
|---|---|---|
| Interior coverage | 92.0% | 93.1% |
| Top-5% concentration | 34.2% | 33.0% |
| Direction coherence | 0.350 | 0.377 |
| Death: trapped / density | 18.4% / 38.7% | 11.8% / 45.8% |
| Lifespan p50 | 12.60s | 12.17s |
| ≥50% south throughput | 26.08% | 23.49% |
| Strike rate | 1.256 / particle-s | 2.043 / particle-s |
| Frame cost (avg) | 1.561ms | 1.583ms |

The strike-rate rise (steering grazing the coast more often) and the trapped→density death-cause shift are the most real-looking differences — plausibly the ONS ring's own generalisation quirks (a different Douglas-Peucker run over different source data) present slightly different pinch points than the Natural Earth ring's. Per the plan, this is not retuned in step 1 — steps 1–5 ship on `DEFAULT_FIELD_PARAMS` unmodified, and re-baselining (if these numbers are still a live concern once real sources replace the fictional seven) is step 6's job, after the border spike.

**Debug alignment layer.** Toggled on `d`, matching `/flow`, reusing `renderDebugOverlay` from `src/flow/debug.ts` unmodified. Default layer differs from `/flow`'s `{'coastline','mask'}`: `/map` defaults to `{'mask'}` only, because that layer's white coastline stroke has effectively no contrast against a white-filled island on a light ground (it's still reachable via the `1` key, same as `/flow`). The mask tint is the layer that actually does the alignment job — it fills exactly the SVG island's shape with no visible gap or spill at both 1440×900 and 375×812, confirmed by screenshot and, separately, by a pixel scan of the flow canvas: stray alpha outside `mask.isInside` is confined to a handful of px immediately adjacent to a curving coastline (stroke-width edge softness — the ~2px-wide rendered line extending a little past its centreline, which is inherent to line rendering and not a position escape) rather than anywhere structural.

**England label position (§7.7).** Provisional point `[53.3, -4.15]`, the Irish Sea west of the Lancashire/Wirral coast — confirmed outside the mask (`isInsideMask` false) before use. The panel itself (`max-width: 20rem`) is wide enough that it visibly spills onto the coast rather than sitting purely over open water; left for the gate to judge against the sketch's "or moved east over the Midlands" fallback.

**Assumptions made without a spec figure to check against:** `countries` per-country simplification target (600 points each, "lightly simplified" per the plan, not otherwise specified); `border` simplification target (300 points — short line, doesn't need many); the England-label and border-caption panels are positioned from the Projection via `getBoundingClientRect` pixel math against `.composition` (not CSS percentages, which don't resolve sensibly across the two unequal grid columns) — recomputed on every `rebuild()`, so it survives resize.

**What was rejected:** matching country-ring vertices at the border (their independent generalisation doesn't guarantee it; the raster approach is exact-enough and reuses primitives already in `mask.ts`); painting the island into the canvas wash (see above); stretching the drawn island to fill 60% of the stage width (would misrepresent the geography); a CSS-percentage-based overlay position (breaks across unequal grid columns).

---

## 023 — Map step 2: real farms, real output

**Date:** 2026-09-16
**Phase:** Map page, step 2 (real farms, real output)
**Decision:** `farms.json` carries all 76 tracked farms with a coordinate; `CurtailmentNow` gains a `farms: FarmNow[]` array rolled up from every tracked unit, not only curtailed ones; `/map`'s sources are built from that data (`buildFarmSources`/`applyFarmRates`, `src/map/farmSources.ts`) through one named `rateForMW` function; offshore farms sit in the sea via mask corridors; farm markers show declaring/held-down/silent; the composition is redrawn full-bleed per the gate 1 outcome. `buildWorld` now takes `sources: Source[]` as an explicit parameter (`/flow` passes its own `SOURCES`, `/map` passes the farm-built list) — the last piece of 022's "still reads the SOURCES constant internally" caveat.

### REPD matching (Part B)

Source: DESNZ's Renewable Energy Planning Database, the Q2 2026 quarterly CSV (`assets.publishing.service.gov.uk`, linked from the `renewable-energy-planning-database-quarterly-extract` gov.uk page — the `-monthly-extract` URL the spec named 301s to it). X/Y are British National Grid (EPSG:27700); converted to WGS84 in `scripts/build-farms.ts` with `proj4` (a `devDependency` only — nothing new in the page bundle) using the standard EPSG:27700 proj string and OSGB36→WGS84 Helmert parameters, verified against Edinburgh Castle's published lat/lon (agreed to within ~150m, comfortably inside marker precision).

Matching is two passes. First, every Scotland "Wind Onshore"/"Wind Offshore" row is normalised (strip "wind farm", roman-numeral/"extension"/"repowering" suffixes, punctuation) and compared against each of the 76 farms' own normalised name (exact match, then containment); rows sharing an exact coordinate are deduplicated first, since REPD frequently carries a farm and a near-duplicate re-registration at the identical site. A farm left with exactly one distinct-coordinate candidate is auto-matched — 52 of 76. The remaining 24 needed a hand decision, each recorded in `farms.json`'s own `source` field and in `scripts/build-farms.ts`'s `HAND_MATCHES` table:

| Farm | REPD ref(s) | Why |
|---|---|---|
| A’Chruach | 4331 | Two REPD phases; the built one (Operational, 48.3 MW) used over the unbuilt Phase 2. |
| Aberdeen Offshore | 2505 | REPD's name is "European Offshore Wind Deployment Centre (EOWDC)" — not name-matchable; matched by capacity and being the only Scottish offshore site near Aberdeen. |
| Beinneun | 3787 | Parent used over its extension (same coordinate) per the extension rule; a third, unbuilt "Beinneun II" row excluded. |
| Crystal Rig | 3114 | Parent ("Phase 1") used over "Extension II". |
| Dorenell | 4244 | The built site ("...Previously Site A and B Scaut Hill") used; an abandoned row shares its coordinate exactly, a much larger unbuilt "Extension" row excluded. |
| Dun Law | 3579 | The only tracked BM unit is registered "Dun Law Ext" (29.75 MW) — the extension's own coordinate used, not the 17.2 MW parent, since the parent isn't part of the tracked farm. |
| Gordonbush | 3662 | Parent used over its extension. |
| Hadyard Hill | 3109 | Parent used; the extension row was withdrawn. |
| Hagshaw Hill | 3301 | Four rows share this name; the plain, non-extension, non-repowering row used per the extension rule, despite its own stale-looking capacity figure. |
| Harestanes | 4119 | Parent used; the extension row was refused. |
| Keith Hill | 4516 | Two rows; the Operational one matches the tracked unit's 4.5 MW exactly. |
| Kennoxhead | 4385 | REPD status "Under Construction" lags what Elexon already tracks as live (60 MW). |
| Kilgallioch | 4386 | Parent used over the Under Construction extension. |
| Limekiln | 6005 | Three rows; the Operational, non-extension one used. |
| Lochluichart | 4123 | Parent used over its extension. |
| Millennium | 4682 | The plain-named row used; two extension rows and an unbuilt, differently-sited "South"/"East" proposal excluded. |
| North Kyle | 6607 | "North Kyle Energy Project" (Under Construction, 205.8 MW) matches the tracked units' 212 MW — status lags reality, as with Kennoxhead. |
| Pencloe | 4480 | Matches the tracked unit's 81 MW exactly — status again lags reality. |
| Pogbie | 4434+5637 | No single row covers the farm — centroid of its two REPD phases. |
| Robin Rigg | 2496+2497 | One physical offshore farm, consented as separate East/West REPD rows — centroid of both. |
| Sandy Knowe | 6703 | Two "Revised"-status duplicates plus this Operational row (81.6 MW) — the Operational one used. |
| Sanquhar | 4441 | "Sanquhar Community Windfarm" (32.4 MW) matches the tracked unit almost exactly; REPD's "Sanquhar 2" (308 MW) is a distinct, larger, separate development. |
| Whitelee | 3489 | Parent used over both extension phases. |
| Windy Standard | 4431 | The tracked unit is registered "Brockloch Rig II" — the REPD row whose name ("formerly Windy Standard II") and site match it, not the separate "Brochloch Rig 1 (formerly Windy Standard)". |

The recurring shape: REPD frequently registers a farm and its later extension as two rows, sometimes at the identical coordinate, sometimes a short distance apart at the same site — the plan's own rule (use the parent) resolves most of these outright; Dun Law is the one deliberate exception, because the tracked BM unit *is* the extension. A second recurring shape — Kennoxhead, Pencloe, North Kyle — is REPD's development-status field visibly lagging what Elexon already treats as a live, tracked unit; all three still matched cleanly on capacity once the status filter was widened to include "Under Construction"/"Awaiting Construction". `npm run farms:check` (new script, Part B) fails the build if any of the 76 lacks a coordinate or any `farms.json` entry names a farm bmus.ts doesn't track; it passes clean.

### Per-farm output (Part C)

`deriveNow` (`api/_lib/elexon.ts`) now rolls up *every* tracked unit by farm — not only units with an acceptance — reading each unit's declared PN level at the sampled instant regardless of whether it's being curtailed, so a farm with no curtailment still has a `declaredMW`/`instructedMW` for the map to draw from. The existing `units`/`curtailedMW` derivation (acceptance-only) is unchanged in meaning and value; both now share one per-unit shortfall map, so `sum(farms[].curtailedMW)` always equals the headline `curtailedMW` to rounding — asserted in `scripts/probe-api.ts`, which prints PASS/FAIL on every run. Method note text now says per-farm figures are declared output (a physical notification), never "generating".

### Fixtures (Part D)

`SAMPLE_CURTAILMENT.now` is replaced wholesale with a fresh derivation against the *same* historical settlement (24 July 2026, period 42, `sampledAt` unchanged) re-run through the current, fuller 112-unit `bmus.ts` — not a patch onto the old 15-unit/1,841 MW capture. The old capture predates several units this project added since (see 015's own history of the BMU list growing); re-deriving the same real event against today's population is more complete, not a different day. Result: 2,049.5 MW across 19 units and 10 farms (Seagreen, Moray East, Moray West, Beatrice, Creag Riabhach, Limekiln, Glen Kyllachy, Halsary, Gordonbush, Edinbane) — still headlined by the same four big offshore/Highland farms the old sample named, with six more the old 15-unit list simply didn't have coverage for. `calm` zeroes every farm's `curtailedMW`/`unitsCurtailed` and sets `instructedMW = declaredMW` — a still day isn't a windless one, so declared output stays real and only the curtailment fields go to zero. `degraded`/`waiting`/`offline` carry no `farms` at all, since `curtailment.now` itself is null for those states, unchanged from before.

### Sources, rates, corridors (Part E/F)

`rateForMW(instructedMW, capacityMW, params)` (`src/map/rate.ts`) is one linear map from 0..capacity onto `floor..cap` (defaults 1 and 20 particles/sec — the same order of magnitude as `/flow`'s fictional per-source constant of 12, so 76 real sources don't need a wholesale re-tune of `DEFAULT_FIELD_PARAMS` to read sensibly). Both ends are exposed live in a new, minimal `/map`-only control panel (`src/map/controls.ts`, `h` to toggle) — deliberately not `/flow`'s full field-weight panel, which stays out of scope until step 6's retune. A fully curtailed farm (`instructedMW` clamped to 0) reads at the floor, which is correct, not a display bug: the emission weight is meant to track what's actually flowing, and "wind, extinguished" is exactly what a floor-rate Seagreen is supposed to look like.

`buildWorld` paints an offshore corridor — a capsule from the source's true offshore position to its nearest coast point, found by walking the *pre-corridor* mask's distance-field gradient (reusing `world.ts`'s existing `snapInside`, buffer 0) — into the raster mask for every `Source` with `offshore: true`, before the distance/geodesic/divergent fields are built, so a corridor cell is simply interior to all three. Radius is `steerThreshold` (18px default, so 36px diameter — "about twice `steerThreshold`" per the plan). Verified live: all 7 offshore farms (Aberdeen Offshore, Beatrice, Moray East, Moray West, Neart Na Gaoithe, Robin Rigg, Seagreen) resolve `wasSnapped: false` — their true position, not a coast-snapped one. **Corridor, not the snap-with-connector fallback** — the corridor is invisible by construction (it only extends the *particle-containment* mask, never the drawn SVG island or any visible fill), so the "reads as a canal" risk the plan named doesn't arise: there is nothing painted over the sea for it to read as a channel. No fallback build was needed.

76 sources needed the per-source hue-offset mechanism (`palette.ts`'s `SOURCE_HUE_OFFSET`) to scale past its original 7 hand-curated letter keys. Added a deterministic string hash (`hueOffsetForChannel`) that falls back to a small (±3°, against `/flow`'s ±12°) hashed offset for any channel it doesn't recognise — `/flow`'s own 7 sources are unaffected (the curated table still wins for `a`–`g`), and every farm gets its own name as its channel, so 76 farms read as one ink with real per-farm distinguishability, not a rainbow.

The state machinery (`fetchCoreFeeds` on the same 120s cadence as `src/main.ts`, `?state=` via `scenarioByName`, the `[`/`]` cycler) drives `farmSources.ts`'s `applyFarmRates` + `particles.refreshRates()` on every landing — confirmed against the `curtailing` fixture: exactly the 10 farms named above render `data-state="held-down"`, the other 66 `"declaring"`. The information-layer panels are untouched by any of this in step 2 (still static placeholder copy, per the plan); each now carries a small `.placeholder-tag` badge so a gate screenshot is never read as a live claim the flow underneath it contradicts.

### Farm markers (Part G)

Three states, never colour alone: `declaring` is a small filled circle; `held-down` is larger, hatch-filled (`--curtailed`/`--curtailed-edge`, redrawn as an SVG `<pattern>` since a `fill` attribute can't reference a CSS `background-image`) with a stroke; `silent` (no PN at the instant — `unitsDeclaring === 0`) is hollow with a dashed stroke. Held-down farms get no special motion in this step (§5.5's sputtering emission is step 6).

### Composition corrections (Part A)

The island now fills the viewport below the masthead (`.composition { min-height: 100svh }`) with every panel — Scotland, England, the headline, the border caption — an absolutely-positioned overlay on top of it; narration, the method note and the colophon sit below the fold. Scotland and the headline aren't tied to a coastline point the sketch cares about, so they're plain CSS overlays stacked top-right, not projection-positioned.

**Border weight.** Bumped from `var(--text-muted)` at 2px to `var(--text-primary)` at 3px, 0.85 opacity — full ink, not a muted orientation line, per "the border is the most visible line on the map." Provisional; step 6 owns the final constraint-state styling.

**Border caption: North Sea, with a leader.** Tried both `[56.0, -0.9]`-ish North Sea and `[54.3, -4.27]`-ish Solway positions (both confirmed outside the mask via the distance field before use, walked out from the border until genuinely clear of the coast — not just barely outside it). North Sea kept: Solway sits close enough to the border that its caption box collided visually with the England panel's own position, which North Sea doesn't. Neither offshore point has anywhere near the ~190px CSS clearance the caption's own `max-width: 24rem` box would need to avoid touching the coast entirely — the box is wider than the firths are open — so, per the plan's own suggested fallback, a short dashed SVG leader now connects the caption's anchor to the nearest point on the drawn border line, which is what actually keeps the connection legible at this box size, not a further search for an untouched coordinate.

**England panel: Irish Sea.** Tried `[53.5, -4.6]` (Irish Sea, between Anglesey and the Isle of Man) against `[49.7, -6.6]` (Celtic Sea, south-west of Cornwall). Celtic Sea is geographically cleaner (more open water, ~112px mask clearance vs Irish Sea's ~64px) but reads worse in the composition: at a typical desktop height it sits far enough south to require scrolling, disconnected from the Scotland/headline/border cluster near the top of the screen, which is exactly the "or moved east" failure mode 022 flagged for the *previous* Irish Sea point (`[53.3, -4.15]`, ~6px clearance, which did visibly spill onto Wales). The refined Irish Sea point clears the coast outright and stays on-screen with the rest of the composition. Both candidates are kept as named constants in `main.ts` (`ENGLAND_LABEL_CANDIDATES`/`BORDER_CAPTION_CANDIDATES`), toggleable live with the `e`/`b` keys for the next review, rather than deleted after picking one.

### What the real 76 sources changed about containment

`npm run flow:harness --ring=ons --realSources` (new flag: swaps in the 76 real farm sources at the `curtailing` fixture's rates, in place of `/flow`'s 7 fictional ones) — 3000 particles, 60s, `DEFAULT_FIELD_PARAMS` untouched, per the plan ("Do not retune the field in steps 1–5"):

| Metric | 7 fictional sources (022 baseline, `--ring=ons`) | 76 real sources (this baseline) |
|---|---|---|
| Interior coverage | 93.1% | 95.2% |
| Top-5% concentration | 33.0% | 27.2% |
| Direction coherence | 0.377 | 0.428 |
| Death: trapped / density | 11.8% / 45.8% | 19.6% / 25.1% |
| Strike rate | 2.043 / particle-s | 2.032 / particle-s |
| Escape samples | 0 | 0 (holds) |
| Frame cost (avg) | 1.583ms | 2.058ms |

Coverage and concentration both move in the direction more, more-spread-out sources would be expected to move them — 76 emission points instead of 7 fill more of the interior and pile up less at any one of them. The trapped/density death-cause split shifted (more trapped, less density-recycled) rather than the total changing much, consistent with a wider spread of spawn points meaning fewer particles ever sit in a single crowded cell long enough to trigger the recycle path. Frame cost rose (2400 device-px width, 76-source rate table, still cheap) but stays two orders of magnitude under the 16.7ms/frame budget for 60fps. Two onshore sources (Edinbane, Viking) auto-snap at this harness's 2400×1600 canvas size — the same coastline-simplification-artefact mechanism `world.ts` already handles for `/flow`'s own sources, not a new failure mode; flagged, not chased, per the plan (retune is step 6's). Nothing here is retuned; recorded as the step 2 baseline for step 6 to compare against.

**What was rejected:** patching `SAMPLE_CURTAILMENT`'s old 15-unit capture in place with a `farms` array bolted on (would leave `units`/`farms` describing two different unit populations under one timestamp); a generic "any REPD row containing this substring" fallback for the 24 ambiguous farms instead of a named, reasoned table (would silently pick a wrong coordinate on the next REPD refresh instead of erroring loud); the snap-with-connector offshore fallback (never needed — the corridor never read as a canal, since nothing about it is ever drawn); deleting the England/border position candidates after choosing one (kept as named, toggleable constants since this is exactly the kind of call a designer revisits).

---

## 024 — Map step 3: islands, composition fixes, the information layer for real

**Date:** 2026-09-16
**Phase:** Map page, step 3 (islands and the information layer)
**Decision:** `gb-countries.json` gains a 17-island `islands` array; every farm not on the mainland (7 offshore, plus Viking and Edinbane) carries a sourced `landing`; `buildWorld` paints a source's corridor to that landing rather than to the nearest coast, and folds an island farm's own island into the mask first; the composition's England panel and border caption are repositioned; and every placeholder panel on `/map` is replaced by the real `src/view` modules — `mastheadView`, `bandView` (two new specs, `SCOTLAND` and `ENGLAND`), `headlineView`, a new `borderView`, `narrationView`, `colophonView` — driven by the same live `AppState` the farm sources already used.

### Island area threshold (Part A.1)

Every non-mainland ring across England, Scotland and Wales's ONS BGC polygons, at or above a raw shoelace area of **0.015** (the same unprojected `[lon,lat]` degrees² unit `mainlandRing()` already logs its own area margins in), is drawn. That threshold was picked empirically, not guessed: a script over the cached ArcGIS response (`scripts/build-gb-countries.ts`'s new island-extraction pass; the exploration itself isn't checked in) printed every non-mainland ring's area and centroid, and 0.015 is the first natural break in the sorted list — 12 rings sit at or above 0.02 (exactly the plan's named list minus Bute), and stepping down to 0.015 adds Bute (0.0174) and one more, Raasay (0.01583), without pulling in anything smaller. Isle of Wight (England, 0.04832) and Anglesey (Wales, 0.09157) both clear the same threshold by a wide margin, with each country's next-largest excluded ring (Sheppey 0.01153, Holyhead 0.0047) comfortably below it — so one threshold works for all three countries, not a per-country tuned figure.

Result, largest to smallest: Lewis and Harris, Skye, Shetland Mainland, Mull, Anglesey, Orkney Mainland, Islay, Arran, Jura, Isle of Wight, North Uist, South Uist, Yell, Hoy, Unst, Bute, Raasay — 17 rings, 405 down to 101 points each (point count scales with `√area`, so Lewis and Harris gets four times Raasay's detail). Each is named by nearest-centroid match against a curated table (`ISLAND_NAMES`) rather than by MultiPolygon part index, which ArcGIS gives no ordering guarantee over; the script throws if a qualifying ring can't be matched within 0.3° or if a named island never gets matched at all, so a future ONS re-fetch that shifts the population fails loud rather than silently mislabelling something.

### The projection extent: true extent shipped, inset built and kept as a toggle (Part A.2)

Measured directly rather than eyeballed from a screenshot: `buildProjection`'s own fit, run against a ~1440×820 stage,

| Extent | Mainland rendered height |
|---|---|
| Mainland-only (islands excluded from the fit) | 792px |
| True extent (mainland + all 17 islands) | 634px |

— an 80% ratio. That's a real cost, not nothing, but nowhere near "the composition suffers": 634px is still the tallest element on the page by a wide margin, legible at both 1440×900 and 1280×800 (screenshotted at both). **True extent ships as the default.** The deciding argument isn't the height number, though — it's that a corridor needs both its ends in one coordinate space. Viking's corridor (mainland landing to Shetland) only reads as "the cable route made visible" if Shetland is drawn where the same `Projection` that draws the mainland actually puts it; an inset box is a second, independently-fit `Projection`, and nothing painted there can share a mask with the main stage's particles.

The inset fallback was still built, not just discussed, because the plan asked for both to exist for the gate: pressing `t` swaps the main stage to a mainland-only fit (Shetland's own archipelago — Mainland, Yell, Unst — drops out of both the extent-fit and the drawn islands) and shows a small, separately-projected, outlined box top-left with Shetland and a static Viking marker in it. It carries no live flow by construction — verified live, switching to inset mode reproduces exactly the same "source projects outside the mask, auto-snapped to a bogus position" warning `world.ts` already logs for a genuine coastline-simplification artefact, because from the main stage's mainland-only projection, Shetland's true coordinates are hundreds of pixels above the canvas top and the corridor/mask logic correctly finds nothing there to attach to. That's not a bug to fix in the fallback; it's the reason the fallback is a fallback.

### Landing points (Part A.4)

Every landing is a real, documented cable landfall — none needed the "nearest coast point they use today" fallback the plan allows for. Sourced from operator or Crown Estate material, cited in full in `scripts/build-farms.ts`'s `LANDING_POINTS` table and carried into `farms.json`'s `landing`/`landingSource` fields:

| Farm | Landing | Source |
|---|---|---|
| Viking | Noss Head switching station, near Wick, Caithness (58.479, −3.0509) | SSEN Transmission's Shetland HVDC Link project page; the converter station runs from Kergord, Shetland to a new switching station at Noss Head. |
| Edinbane | Kyle of Lochalsh (57.28, −5.65) | Skye's own grid connection reaches the mainland here — the same point already used as Edinbane's `/flow` anchor (`src/flow/sources.ts`), kept identical rather than independently re-sourced. |
| Seagreen | Carnoustie, Angus (56.5001, −2.7168) | Seagreen Wind Energy's own site: cables land at Carnoustie, then ~19km underground to a new substation at Tealing. |
| Moray East | Inverboyndie Bay, near Banff, Aberdeenshire (57.6685, −2.5561) | Aberdeenshire HER record MAB54304, "Inverboyndie to New Deer, Moray East Offshore Windfarm Cable Route"; corroborated by Energy Voice's cable-landfall coverage. |
| Moray West | East of Sandend Bay, Aberdeenshire (57.6842, −2.7498) | moraywest.com's own project page: cables come ashore east of Sandend Bay, then 31km to Whitehillock and on to Blackhillock. |
| Beatrice | Near Portgordon, Moray (57.65, −3.0) | Herrenknecht's "Beatrice Offshore Wind Farm Landfall" case study; corroborated by offshorewind.biz. |
| Neart na Gaoithe | Thorntonloch Beach, East Lothian (55.9621, −2.399) | nngoffshorewind.com's own cable-installation-campaign page. |
| Robin Rigg | Near Seaton, Cumbria (54.652, −3.548) | power-technology.com and the Tethys (PNNL) project database, both naming Seaton as the landfall for the OFTO-regime cables. |
| Aberdeen Offshore (EOWDC) | Blackdog, Aberdeenshire (57.2333, −2.073) | SPT Offshore's project page and Vattenfall's own EOWDC material: cables land at Blackdog, feeding the onshore substation there. |

All nine coordinates are the named beach/village's own position (a few hundred metres' precision), not an as-built cable survey — the corridor these drive is never drawn, only its containment matters (Part A.4/A.5).

### What the corridors changed about containment

`buildWorld` now takes two new `WorldBuildOptions`: `islands` (the named rings a source's `islandName` can point at) and `projectionRing` (lets the *projection's* extent-fit differ from the *mask's* own ring — true-extent mode fits wider than the mask ever draws). Before any corridor is painted, every source naming an `islandName` has that island rasterized into the mask directly (`scanlineFillMask`, unioned in exactly like step 1's mainland/border raster union); the corridor is then painted from the source's own true position to its `landing` (falling back to the old nearest-coast walk only if a source sets `offshore`/`islandName` without one, which none of the 76 do post this step). Verified live via the exposed `window.__map.isInsideMask`: Shetland Mainland and Skye read `true`; Orkney, Mull, Islay, Anglesey and Isle of Wight all read `false` — islands are drawn, but only an island with a farm on it is walkable, exactly as the plan asks.

This broke one thing that had to be fixed before the harness run below could pass: `scripts/flow-harness.ts`'s `--realSources` path built its world without the new `islands`/`projectionRing` options, so under `--ring=ons` — a mainland-only ring, with no island geometry at all — Viking's true position projected to `y ≈ −174px`, hundreds of pixels above the canvas, and the existing `snapInside` gradient-walk (built to recover from a few pixels of Douglas-Peucker error, not hundreds) walked it somewhere nonsensical, producing 5,622 escape samples and a failed containment invariant. Fixed by having the harness build the world the same way `/map` does for this specific combination — passing `islands`/`projectionRing` whenever `--realSources` and `--ring=ons` are both set. `/flow`'s own sources and any `--ring=ne` run are untouched (neither sets `islandName`), and re-running afterwards holds the invariant at 0 escapes. Recorded because it's a real lesson, not a footnote: adding an optional field to a shared function's inputs is only safe once every caller that *could* trigger the new path is checked, not just the one caller (`/map`) the feature was built for.

### Flow harness: real sources, islands + true extent, against the step 2 baseline

`npm run flow:harness -- --ring=ons --realSources` (3000 particles, 60s, `DEFAULT_FIELD_PARAMS` untouched — no retune in step 3 either, per the plan):

| Metric | Step 2 baseline (real sources, mainland-only extent) | Step 3 (real sources, islands + true extent) |
|---|---|---|
| Interior coverage | 95.2% | 92.9% |
| Top-5% concentration | 27.2% | 26.2% |
| Direction coherence | 0.428 | 0.357 |
| Death: trapped / density | 19.6% / 25.1% | 29.1% / 11.5% |
| Strike rate | 2.032 / particle-s | 2.069 / particle-s |
| Escape samples | 0 | 0 (holds) |
| Frame cost (avg) | 2.058ms | 2.094ms |

**Not a like-for-like comparison, and that's worth saying plainly rather than presenting a clean table as if it were one.** Step 2's baseline ran the mainland-only projection; step 3's necessarily runs true-extent, which is a ~20% smaller mainland at the same canvas size (see the height table above) — so some of this movement is the island/corridor logic and some is just "the same field, on a differently-scaled map". Direction coherence's drop (0.428 → 0.357) is the most likely candidate for a real, extent-driven effect: a shorter effective north-south canvas span changes how far a particle travels per southward step relative to the field's own tuned length scales. Per the plan, nothing here is retuned in step 3; this is the baseline step 6's retune (after the border spike) compares against, and the extent-vs-tuning confound is exactly the kind of thing that pass should account for rather than this one.

### Composition fixes (Part B)

**England panel** (Part B.1): narrowed from `max-width: 20rem` to `13.5rem` (~two-thirds), and its `.band__reading` (the two figures — lead fuel share, then intensity) stacks onto separate lines via a scoped `flex-direction: column` override, with the `·` separator hidden since it no longer separates anything on one line. The mix legend — reused verbatim from `bandView`, which renders all nine fuels as an accessible `<dl>` beneath the bar — was making every overlaid panel far taller than a floating card should be (302px for England alone, mostly the legend); it's now visually-hidden (position:absolute, clipped) rather than `display:none`, so a screen reader still gets the bar's full accessible reading while a sighted visitor reads the same numbers off the bar's own inline segment labels, which already show every segment at or above 12%. The panel's anchor moved from the previous step's `[53.5,-4.6]` (Irish Sea, ~6px coastal clearance, spilled onto Wales) through two intermediate points before landing at **`[51.9, -5.6]`**, central Irish Sea/Celtic Sea approach — nudged this far only because the Solway border caption (below) also moved back into the same stretch of water, and the two panels collided at every point closer in. Confirmed programmatically (`getBoundingClientRect` overlap check, not just eyeballed) at both 1440×900 and 1280×800: no overlap between England, the border caption, Scotland or the headline panel at either size, and the England panel still clears Wales/Cumbria/the Isle of Man with visible margin.

**Border caption** (Part B.2): moved back to the **Solway** candidate (`[54.3, -4.27]`), per the plan, now that the England panel has moved off it. Leader line to the border's own drawn path kept unchanged from step 2's reasoning (the caption's `max-width: 24rem` box is still wider than the firths are open, so a hairline connector is what keeps the relationship legible, not a search for a fully-clear point). Both candidates for each panel stay live, toggleable constants (`e`/`b` keys), per step 2's own convention.

### The information layer, live (Part C)

**Every placeholder panel is gone** (Part C.8) — `map/index.html` is now a bare shell (`<div id="map-app">` and the module script), and the entire tree is built in `main.ts`, mirroring `src/main.ts`'s own `app.replaceChildren(...)` pattern: `mastheadView()`, `bandView(SCOTLAND)`, `bandView(ENGLAND)`, `headlineView()`, the new `borderView()`, `narrationView()`, `colophonView()` and `toggleView()` are constructed once and mounted, their `.el` roots wrapped where needed in the map's own `.panel`/`.map__border-caption` overlay containers, and `.update(state)` called on every one of them on every landing — the exact same `AppState` shape and update contract `/` uses, not a parallel one.

**`SCOTLAND` is `NORTH`, literally aliased** (`export const SCOTLAND: BandSpec = NORTH`), per the plan's "as NORTH today" — no rewrite, no risk of the two drifting. **`ENGLAND`** is new: reads the `england` region (added to `RegionalState`/`carbon.ts`'s `fetchRegions` — Carbon Intensity's `/regional` endpoint carries `England` directly as regionid 15, confirmed live, so no blend or sub-region substitution was needed) and carries its own three-voice caption (constrained/clear/unknown × present/past), written for "England" rather than "South England" throughout, matching the region it actually reads. `BandSpec` gained an explicit `placeholderName` field (was: `spec.side === 'north' ? 'Scotland' : 'South England'`, a two-way ternary that broke once a third spec — `ENGLAND`, sharing `SOUTH`'s `side: 'south'` — needed a different placeholder) — a small, safe refactor of shared code, not a behaviour change for `/`.

**`borderView`** (new, `src/view/border.ts`) reuses `constraintView`'s three-state copy verbatim — `CONSTRAINED`/`CLEAR`/`UNKNOWN` are now exported from `constraint.ts` for exactly this — rather than reusing `constraintView` itself, because that view's DOM is a horizontal rule spanning the paradox chain (with the flow-marks motion and `--flow-density` custom property DECISIONS 020 built for that geometry specifically), and the border caption is a point-anchored panel instead (per 023's own finding that a rule doesn't fit the map's composition). The two pages describe the same constraint from the same three strings; only the container differs. Flow-marks motion on the border itself stays deferred to step 6, per §7.4.

**CSS reuse, not just JS reuse:** `main.ts` now imports `../styles/app.css` (after `tokens.css`/`tokens-light.css`, before `map.css`), so every component class the reused views render — `.masthead`, `.band`, `.headline`, `.narration`, `.colophon`, `.method`, `.toggle` — gets its structural styling from the same stylesheet `/` uses, reskinned for light by `tokens-light.css`'s variable overrides (already in place since step 1). `map.css` now only ever adds what app.css has no opinion about (the composition/overlay positioning layer, the compact-card treatment, islands, the debug/inset boxes) or overrides what a ~13–22rem floating card needs differently from a full-width dashboard section (font sizes, the headline's forced single column, the legend visibility change above). This is a departure from step 2, which gave `/map` its own parallel `.panel__*`/`.mix__*` class names; reusing the real classes means the two pages' component styling can't drift into two designs by accident, which is exactly the risk DECISIONS 021 flagged for a light variant in the first place.

**Method note** (Part C.4): two lines appended to `colophonView`'s own `<details>` (not edited into `colophon.ts`, which `/` also uses) — which farm population the flow represents ("declared output of tracked Scottish farms only ... not a metered reading"), and a live count of `unitsDeclaring === 0` farms rolled up from `curtailment.now.farms`, e.g. "All 76 tracked farms had a declaration at the sampled instant" on the `curtailing` fixture, or a named blind-farm count whenever some aren't.

**Wind note** (Part C.5): reads `state.scenario` and the payload's own age rather than staying static — names the active fixture and its own `note` text when off `live` ("Showing the 'Curtailing' fixture, not a live reading. A windy evening..."), or flags a >30-minute-old live reading, falling through to the original static sentence only when the map is genuinely showing a fresh live reading.

**Degraded/offline/waiting carry no flow** (Part C.6): when `curtailment.now` itself is `null` (not merely "this one farm is absent from `farms[]`," which step 2's `applyFarmRates` already reads as the floor rate), every source's rate is set to exactly `0` rather than the floor — confirmed live (`window.__map.getFarmSources()`, all 76 rates `0` on `?state=degraded`) — and every marker renders `silent` (confirmed, 76/76). This is a genuine behaviour change from step 2's own documented design ("a farm absent from `farmsNow` ... reads as ... the floor"), superseded here because the step 3 spec is explicit that these three states show "no flow", not a faint one; `farmSources.ts`'s stale comment is updated to match.

**All seven states reachable and honest**, screenshotted at 1440×900: `live` (landed mid-review on a genuine settlement rollover — 017's tense/rollover logic firing unprompted on `/map`, not staged), `curtailing`, `calm`, `degraded`, `stale`, `waiting`, `offline`. `/` and `/flow` re-checked and unaffected (no console errors, unchanged visual output) — the `app.css` import addition to `/map` doesn't touch either.

**Stagger** (Part C.7): `--i` set on the Scotland/headline/border/England/narration wrapper elements (0 through 4, matching the plan's reading order), read via inheritance by the same `calc(var(--i, 0) * var(--stagger-step))` transitions `app.css` already defines — no new mechanism, the reuse extends to the motion too.

### What was rejected

Deriving Viking/Edinbane's island membership from a point-in-polygon test against `gb-countries.json`'s islands at build time (an explicit `island` string field on each `FarmSite`, matching the codebase's existing preference for named, hand-verified tables over inferred geometry — see `HAND_MATCHES`'s own precedent); an inset box that tries to carry live flow via a second `ParticleSystem` (two independent simulations sharing a farm list but not a coordinate space is a maintenance and honesty problem — a corridor either connects two points in one mask or it's decorative, and pretending otherwise would be worse than the documented static fallback); rewriting `narrate.ts`/`situation.ts` to say "England" instead of "South England" in the client-side narration fallback (explicitly out of step 3's scope — "No copy editing beyond the new lines named above" — and the fallback is not the thing `borderView`/`ENGLAND` needed to reuse); keeping `/map`'s own parallel `.mix__seg`/`.headline__*` CSS class names from step 2 now that the DOM producing them is the real `bandView`/`headlineView` (would mean styling two different sets of identical class names depending on which page loaded them, a drift risk with no upside once the DOM itself is shared).

---

## 025 — Map step 3b: the Shetland inset becomes the default, the narration finally reads England

**Date:** 2026-09-16
**Phase:** Map page, step 3b (correction pass between steps 3 and 4)
**Decision:** `/map` now ships with the Shetland inset as its default extent, true extent moved behind the `t` toggle — the reverse of 024's own call; Viking degrades honestly to the spec's snap-with-connector fallback when its island isn't in the current fit, as a generic rule any future Shetland farm inherits, not a name check; the client narration template and the server prompt both take a southern region parameter so `/map` describes England rather than South England; and seven reference plates plus a mobile-curtailing reference shot are exported to `capture/case-study/map/step-3/`.

### The inset as default, and why 024's true-extent argument lost (Part A)

024 shipped true extent because it was "the only mode where Viking's corridor is a real, connected, in-position thing rather than a decorative aside," and accepted an 80%-height mainland (634px vs. 792px, measured) as the cost of that fidelity — paid on *every* visit, for *one* farm's corridor. Revisited here on the argument that a reader lands on `/map` to read Britain, not Shetland: the mainland is the subject of every other element on the page (the border, both mixes, the headline), and shrinking it 20% on every load to keep one offshore-adjacent corridor honest inverts the priority the rest of the composition already sets. 024's own fallback — the inset — already existed and was already judged, in the same entry, a genuine loss ("never carries live flow... a corridor needs both ends in one coordinate space and the inset deliberately isn't"). The fix here is not to pretend that loss away but to make Viking's degraded state honest on its own terms rather than accepting the mainland-wide cost to avoid it.

**The generic rule (Part A.3), not a Viking special case.** `farmSources.ts` gained `isOffMainFit(site, availableIslands)`: true when a farm names an `island` that isn't in the current projection's fit. `buildFarmSources` now takes that available-islands set and, for any farm it excludes, builds a Source whose `latLon` **is** the farm's `landing` — no `offshore`, no `islandName` — so it resolves exactly like an ordinary mainland farm: no corridor is painted, nothing is rasterized that isn't drawn. This is the plan's own snap-with-connector fallback (§5.2), done honestly rather than as a Viking-shaped patch: any future farm on a Shetland island (or any island a fit later excludes) gets the same treatment automatically, because the rule reads `FarmSite.island` against whatever `islandsForFit()` currently returns, not a farm name.

The farm's marker moves with it: `markers.ts`'s `FarmMarkerLayer` gained `setHidden(farms)`, called every `rebuild()` with the current off-fit set, so a farm's main-stage circle disappears exactly when its source stops being a main-stage source. It reappears in the inset instead — `drawInset()` now builds one marker per off-fit farm (not a single hardcoded Viking circle), styled with the exact same `styleFarmMarker` function (now exported from `markers.ts`) the main stage uses, so declaring/held-down/silent reads identically in both places — plus a one-line caption from the new `landingCaption(site)`, built from a `landingName` field added to `FarmSite`/`farms.json` (populated for Viking → "Noss Head" and Edinbane → "Kyle of Lochalsh," the only two farms that can currently become off-fit; `scripts/build-farms.ts`'s `LANDING_POINTS` table carries the same field so a future regeneration reproduces it — the REPD CSV wasn't re-fetched for this pass, so the JSON was hand-patched with the matching field the generator now also writes). `landFarms()` restyles the inset's markers on every live landing, not only on rebuild, since a data refresh is far more frequent than an extent toggle.

Because which farms are off-fit depends on `extentMode`, `farmSources` itself moved from a module-scope constant to a value rebuilt inside `rebuild()` from the current fit's available-islands set, with `landFarms(lastFarmsNow)` called at the end of `rebuild()` to reapply live rates and marker states to the freshly-built Source objects (their rates start at the floor, same as any fresh `buildFarmSources()` call, and would otherwise flash to the floor for one frame on every resize or toggle). Verified live: `window.__map.getExtentMode()` reads `'inset'` on load; `isInsideMask([57.4,-6.2])` (Skye) is `true`, `isInsideMask([60.3,-1.3])` (Shetland Mainland) is `false`; `getOffMainStageFarms()` is `{'Viking'}`. `npm run flow:harness -- --ring=ons --realSources` (unaffected by default, since the harness never passes an `availableIslands` set and so nothing is ever off-fit for it) holds the containment invariant at 0 escape samples, direction coherence 0.355 against step 3's 0.357 — no meaningful drift, as expected, since the harness's own path through `buildFarmSources()` is unchanged.

**A side effect worth recording rather than silently fixing.** In inset mode, Viking's Source now resolves through the *ordinary* main-stage snap path (`world.ts`'s ~24px-buffer `snapInside`, the one that logs a warning) rather than the corridor's silent buffer-0 snap it used in true-extent mode, because its `latLon` is now consumed directly as an origin rather than as a corridor endpoint. Its landing coordinate (Noss Head, a narrow promontory near Wick) sits just outside the simplified mainland ring, so the console now logs the same "coastline-simplification artefact" warning 023's harness run already documented for Edinbane and Viking under a different projection. The snap recovers correctly — the resulting position is confirmed inside the mask, so no particle is drawn outside it — and this is exactly the category of artefact 023 and 024 both already logged as "flagged, not chased" rather than fixed; treated the same way here rather than inventing a special-cased silent path for one farm's coordinate.

### The narration region (Part B)

`situation.ts` gained `SouthernRegion = 'south-england' | 'england'`, a parameter to `situationOf` (default `'south-england'`, so `/`'s callers are unchanged) that picks `grid.regions.england` instead of `southEngland`/`southEastEngland`. `narrate.ts` takes the same parameter and now prints `situation.south.name` (which the payload names correctly either way) instead of a hardcoded "South England" literal — the actual bug this pass exists to fix, since the template previously asserted "South England" regardless of which region's figures it had just been handed. `narrationView` (`src/view/narration.ts`, shared by both pages) takes the region too, defaulting to South England for `/`'s own call, and `/map`'s `main.ts` now calls `narrationView('england')`.

`api/_lib/narration-prompt.ts` needed no change — `factsOf` already read `situation.south.name` rather than a literal, so once `situationOf` was handed the right region the prompt was already correct. `api/narration.ts` gained a validated `region` query param (`south-england` | `england`, default `south-england`, an unrecognised value is a 400 like a malformed `period`) threaded into `situationOf`. No separate cache-key logic was needed: the CDN already keys on the full request URL (005), so adding `&region=` to the params both pages send is the entire mechanism. `client.ts`'s `fetchNarration(region)` sends it; `/map`'s `refresh()` — which never called `fetchNarration` at all before this pass, so its narration slot always fell back to the (previously wrong) client template — now fetches it in parallel with the core feeds, mirroring `/`'s own `src/main.ts` pattern exactly.

**The cost, stated plainly:** this doubles generated narrations per settlement period for as long as both `/` and `/map` ship side by side, since a South-England sentence and an England sentence are two distinct cache entries even when nothing about the underlying grid differs between the two regions' *other* facts (Scotland's figures, curtailment). It collapses back to one generation per period at step 7, when `/map` replaces `/` and the South-England reader disappears. Verified with `npm run narrate:eval` (extended to loop both regions × the three narratable fixtures, six runs total): the England facts for `curtailing` read "England: around 35% gas... 151 grams," against South England's "around 50% gas... 206 grams" — the model-facing facts, rounded to the nearest 5 (`narration-prompt.ts`'s own hedging rule). Confirmed against the client template too, loading `/map/?state=curtailing` and `/?state=curtailing` side by side and reading `.narration__body` on each: `/map` prints "England is at 35% gas and 151 grams"; `/` prints "South England is at 49% gas and 206 grams" — 49, not 50, because the client template's `formatPct` rounds to the nearest whole number rather than the nearest 5 the server prompt uses; both are the same fixture's true `gasPct`, correctly read by each page's own region, just displayed at two different, already-existing rounding granularities.

### "South England" occurrences, grepped repo-wide

| File | Stays or goes | Why |
|---|---|---|
| `Windfall_Map_Spec.md`, `DECISIONS.md` (entries 002, 021, 024, this one) | Stays | Historical record — the case study needs the reasoning as it happened, not retouched. |
| `spike/carbon-intensity.ts` | Stays | A phase-0 exploratory spike script's console log, not product copy. |
| `api/_lib/carbon.ts`'s `byName('South England')` | Stays | The literal string Carbon Intensity's API expects for `/`'s `southEngland` field — data plumbing, not prose. |
| `src/lib/sample.ts`'s `"name": "South England"` | Stays | `/`'s own captured fixture payload, correctly named for the region `/` shows. |
| `src/view/band.ts`'s `SOUTH.placeholderName` and its doc comments | Stays | `/`'s own copy — unchanged per this pass's brief ("the homepage's own copy stays") and per 021, which the comments cite accurately. |
| `src/lib/types.ts`'s doc comment on `RegionalState.england` | Stays | Accurately describes why `england` was added alongside, not instead of, `southEngland` — cites 021 correctly. |
| `api/narration.ts`, `src/view/narration.ts`, `src/map/main.ts`, `scripts/narrate-eval.ts` (this pass's own new comments) | Stays | Accurately describe the two-region mechanism just built. |

Nothing found needed to go. The bug was never a stray string to grep away — `narrate.ts`'s hardcoded "South England" was reachable by both pages and wrong for one of them, which is a parameter problem, not a copy problem; every other occurrence already named the region it was actually attached to.

### Capture pack (Part C)

`scripts/capture-states.ts` (new): no screenshot-to-disk primitive exists in the Claude Browser pane used for day-to-day preview work, so per the plan's own fallback this is a dev-only Playwright script — `playwright` added as a `devDependency` (nothing new ships in the page bundle). It spins up its own Vite dev server on a dedicated port, drives real Chromium at 1440×900 through all seven states (`live` via a plain `/map/` load, the six fixtures via `?state=`) waiting ~20s per page for the flow to develop, plus one 375×812 `curtailing` shot for mobile reference, and writes all eight PNGs to `capture/case-study/map/step-3/`. Reused as-is for step 7's own capture pack per the plan. `capture/case-study/map/step-3/INDEX.md` names each plate, its state and provenance, and records one pre-existing (not introduced by this pass) particle-system property visible in the `waiting`/`offline` plates: particles already alive when a source's rate drops to zero keep animating until they age out naturally rather than vanishing on the frame the rate changes, which `refreshRates()`'s own docs already describe as deliberate.

### What was rejected

Keeping true extent as the default and instead shrinking the corridor-fidelity argument's cost some other way (e.g. a smaller inset overlay on top of the true-extent map) — considered and dropped, because it would mean carrying *both* the mainland-height cost 024 measured *and* Shetland's own true-extent screen space, for no honesty gain over the inset already built and judged in 024; a Viking-only conditional in `main.ts` rather than `isOffMainFit`/`buildFarmSources`'s data-driven rule (the plan explicitly asks for the rule, not the farm, to be Shetland-generic); silently re-routing Viking's off-fit source through the corridor's buffer-0 snap to suppress the new console warning (would special-case one farm's coordinate resolution against the shared `world.ts` path every source goes through, for a warning a real visitor never sees); a `region` field on `NarrationResponse` to let the client cross-check which region a cached response describes (unnecessary — each page's own `AppState.narration` is a separate object populated only by that page's own region-scoped fetch, so there is no cross-page value to protect against); adding `england` landing names for the seven offshore farms alongside Viking/Edinbane's (out of scope — only farms whose *island* membership can change with the fit are ever off-stage, and no offshore farm sits on an island).

## 026 — The simplified page: one headline, two mixes, no generative element

**Date:** 2026-09-17
**Phase:** Map page, ahead of step 4
**Decision:** The map page's information layer is cut to the elements below, per Owen's Figma exploration (16–17 Sept). Everything else moves to the method note or goes. Recorded here with the reasoning; the anatomy in [Windfall_Map_Spec.md](Windfall_Map_Spec.md) §3 is rewritten to match.

**What stays, and where:**

- **Masthead.** "Windfall ≈ Scotland wind tracker", top left. Settlement period and reading age top right, with the notice slot and the hollow/amber/red freshness rules from 010, 016 and 017 unchanged. The strapline is dropped: the headline introduces the product.
- **Headline.** One sentence in the largest type on the page, the page's whole argument: "At least 16% of Scotland's tracked wind is currently being held off the grid." / "None of Scotland's tracked wind is currently being held off the grid." / an unavailable form when Elexon does not answer. Tense follows freshness as it does now.
- **Breakdown under the headline.** The share bar, "2,134 of the 8,400 MW Scotland is making", and the held-down farm list. Kept because it is the only place a reader can check the headline against another tracker.
- **Two mixes.** Scotland to the right of Scotland, England to the left over the sea, each with its intensity figure, its bar in fixed fuel order, its legend, and one template sentence beneath it in the three voices (constrained, clear, unknown), tense-aware.
- **The border**, drawn as the bottleneck, with the constraint sentence on hover or tap rather than as a paragraph on the map. The sentence also lives in the method note so touch and screen-reader users can reach it.
- **Method note, source health, colophon**, at the foot. The settled MWh figure moves here from the main screen.

**The headline percentage.** It is curtailed output over declared output for the tracked farms at the sampled instant: the share of the wind Scotland is making, not the share of installed capacity. On the curtailing fixture that is roughly 25% rather than the 16% the capacity denominator gives, because capacity counts every farm standing idle for lack of wind. The bar and the line beneath the headline use the same denominator, so the three figures cannot disagree. Rounding is always down: 5.8% prints as "at least 5%", because "at least 6%" is a claim the floor cannot support (003).

**No generative element.** The Claude-written narration is cut from the map page. Owen's call, made knowingly: the product does not need it, and the two template sentences under the mixes say what the narration said. Consequence for the case study, stated plainly: the project plan's first proof ("AI in the product loop") and the headline claim "AI narrates Britain's grid" are no longer supported by the product as it will ship. The narration exists in the codebase (018, 019, 020) and ran against fixtures, but was never keyed in production — the live endpoint reports "no API key configured" on 17 September, so windfall.scot has shown the template sentence since launch. The case study can describe the narration as built and validated, not as shipped. The narration function and `narrate.ts` stay in the repo for `/` until step 7 and are then removed or archived.

**Type.** Eczar for display, Mukta for body, both self-hosted through fontsource. This closes 011's provisional DM Sans.

**Colour.** The light palette is rebuilt as a system from the roles the dark palette was built on: wind the one saturated hue (the flow's blue), gas its warm opposite, everything else receding into the ground. Owen's inverted version of the dark palette proved the roles hold on cream; the provisional light tokens from step 1 were never composed as a system and are replaced.

**What was rejected:** keeping the generated sentence as the headline's standfirst (proposed, declined: the page reads complete without it); making the two mix captions generated in one call (proposed, declined for the same reason); a percentage of installed capacity (understates the share on every windy day); the constraint as a caption box on the map (covers coast, and the border's own treatment can carry the state).

---

## 027 — Step 4 built: the simplified layer, and a role-based palette checked against AA

**Date:** 2026-09-17
**Phase:** Map page, step 4
**Decision:** Step 4 is built per 026 and Windfall_Map_Spec.md §3/§6. Recorded here: the headline's denominator and rounding as implemented, the percentage on each fixture, the palette values with their contrast ratios, the card-vs-wash call, the tooltip's implementation and its fallbacks, and what was removed.

### The headline denominator and rounding

`src/map/views/headline.ts` — a new, leaner view, not a reskin of `../view/headline.ts` (which `/` keeps unchanged) — computes the percentage as `curtailedMW / declaredMW × 100`, where `declaredMW` is `curtailment.now.farms[].declaredMW` summed across every tracked farm at the sampled instant. The bar's fill width and the breakdown line (`"{curtailed} of the {declared} MW Scotland is making."`) read the same `declaredMW` sum, so the three can never disagree (§4.3). Rounding is always down via a new `formatPctFloor` (`src/lib/format.ts`): below 1% but above zero prints "Less than 1%"; otherwise `Math.floor`. The capacity-denominator percentage (16% on the same fixture, per 026's own worked example) no longer appears anywhere on the headline — capacity moves to the method note, which already carried it via `colophonView`'s existing coverage line and needed no change.

Percentage on each fixture, live-captured at the step 4 gate:

| Fixture | Headline reads |
|---|---|
| `curtailing` | "At least **38%** of Scotland's tracked wind is currently being held off the grid." (2,050 of 5,363 MW declared) |
| `calm` | "**None** of Scotland's tracked wind is currently being held off the grid." |
| `stale` | Same 38%, past tense: "…was being held off the grid when this was last read." |
| `degraded` | "**Unavailable.** Elexon's balancing data did not answer this time. The generation mix above is unaffected." |
| `offline` | "**Unavailable.** Windfall could not reach its own reading of the balancing mechanism." |
| `waiting` | "Reading. Windfall is asking Elexon what is being held down this half-hour…" (muted, not wind-hue — nothing has been claimed yet) |
| `live` (capture time) | 51% (4,266 of 8,259 MW) — cited to show the mechanism works against real data, not as a fixture figure |

Note the fixture figure differs from 026's own worked example (25% on an earlier capture of the same `curtailing` fixture) — the fixture is a live capture rebased onto the clock (012), so its absolute figures drift release to release; the mechanism (declared-output denominator, floor rounding) is what 026 fixed, not a specific percentage.

### The palette: built as a role system, checked against AA

`src/styles/tokens-light.css` replaces the step-1 provisional palette outright. Wind (`#0f5fd6`) is unchanged — lifted from the flow's own `LIGHT_PALETTE.baseHue` (216) so the page's protagonist hue and the flow's stroke are the same by construction. Every other value was chosen with a WCAG contrast calculator open, not eyeballed, and re-tuned where the first pick fell short. Full table (`bg` = the cream ground `#e9e5dc`; `label` = the on-segment text colour that token actually gets, per the rule below):

| Token | Value | vs cream | Label pairing | Ratio |
|---|---|---|---|---|
| `--text-primary` | `#1c1f16` | 13.29:1 | — | — |
| `--text-secondary` | `#4a4d40` | 6.88:1 | — | — |
| `--text-muted` | `#65624f` | 4.89:1 | — | — |
| `--fuel-wind` | `#0f5fd6` | 4.60:1 | cream text | 4.60:1 |
| `--fuel-gas` | `#a34518` | 4.88:1 | cream text | 4.88:1 |
| `--fuel-coal` | `#6b5f56` | 4.92:1 | cream text | 4.92:1 |
| `--fuel-nuclear` | `#847e9c` | 3.07:1 | dark-ink text | 4.33:1 |
| `--fuel-solar` | `#a37c30` | 3.05:1 | dark-ink text | 4.36:1 |
| `--fuel-hydro` | `#5f86a3` | 3.08:1 | dark-ink text | 4.32:1 |
| `--fuel-biomass` | `#71845a` | 3.24:1 | dark-ink text | 4.10:1 |
| `--fuel-imports` | `#7d786a` | 3.50:1 | dark-ink text | 3.79:1 |
| `--fuel-other` | `#8a8272` | 3.03:1 | dark-ink text | 4.39:1 |
| `--signal-ok` | `#0f5fd6` | 4.60:1 | — | — |
| `--signal-ageing` | `#7d5f1c` | 4.74:1 | — | — |
| `--signal-stale` | `#943e15` | 5.65:1 | — | — |
| `--signal-failed` | `#b13d2c` | 4.68:1 | — | — |
| `--curtailed` (fill) | `#b9cdf0` | 1.28:1 | n/a — decorative fill, never text | — |
| `--curtailed-edge` | `#0f5fd6` | — | vs `--curtailed` fill: 3.60:1 | — |

`--text-muted` was darkened from a step-1 `#7a7768` (3.58:1, failing AA) to `#65624f` (4.89:1) — the one ground/text token that needed correcting rather than just measuring.

**The disclosed trade-off.** Wind, gas and coal are dark/saturated enough to clear 4.5:1 against cream on their own — the reverse of `app.css`'s dark-theme override list (`imports`/`coal`/`other` get light labels there), so `src/map/map.css` scopes a new `.map-band .mix__seg[data-fuel='wind'|'gas'|'coal'] .mix__label` rule to invert it for the light palette, rather than editing `app.css`'s selector and risking `/`'s dark bars. The other six fuels sit between 3.0:1 and 3.5:1 against cream — below AA's 4.5:1 text threshold, at or just above its 3:1 large-text/UI-component threshold. This is the deliberate "recede toward the ground" instruction in tension with AA, and it is resolved by where the colour carries meaning: the swatch itself is never the only reading of a fuel's share — the legend's `dt`/`dd` text sits at `--text-secondary`/`--text-primary` against cream (6.88:1 / 13.29:1, comfortably AA) right beside every swatch, and the on-segment inline label (only shown above a 20% share — raised from the dashboard's 12%, since the map's panels are much narrower) still clears 4.1–4.4:1 in dark ink. No figure on the map depends on a receding swatch's contrast to be read.

### Type

`--font-display: 'Eczar Variable'` (masthead wordmark, headline, region names) and `--font-body: 'Mukta'` (everything else), both self-hosted via `@fontsource-variable/eczar`/`@fontsource/mukta`, imported from `src/map/main.ts` only — `/` and `/flow` keep DM Sans untouched. Type scale, recorded as tokens rather than ad hoc `clamp()`s scattered through the CSS: `--type-display` (headline), `--type-region` (Scotland/England), `--type-body`, `--type-small`, `--type-caption` — see `tokens-light.css`'s own per-token comments for what actually renders at each. First pass, set against the real overlay panels rather than a formula; a strict modular scale fought the ~22–33rem panel widths at both ends.

### Card vs wash

Built both, toggled with `c` for comparison (`capture/case-study/map/step-4/panels-{wash,card}.png`). **Wash — a translucent cream scrim, `rgb(233 229 220 / 0.6)`, no border, no inset shadow — is the shipped default.** The headline and both mixes stay fully legible over the flow at this alpha, and the softer edge reads as the type and spacing carrying the panel rather than a card doing it, which is what §6 step 4 asked to judge by looking rather than argue. Card (`rgb(245 242 234 / 0.92)`, `inset 0 0 0 1px var(--ink-line)`) is kept as the named alternative — Owen can flip the default in Figma against the pair if the wash reads as too little separation on a busier live capture.

### The border: tooltip, not a caption card

`src/view/border.ts` is repurposed from a permanently visible caption box into a pure tooltip-content view (`borderView` now renders `.map__border-tooltip`, state-and-tense-resolved by a new exported `constraintSentenceOf(state)` — the one place both the tooltip and the method note's constraint line call from, so they can't drift). `src/map/main.ts` builds the interactive part directly: a wide (`stroke-width: 28`), transparent `<path>` (`.map__border-hit`) sharing the visible border's own `d`, `tabindex="0"`, `role="button"`, an `aria-label` naming it, wired to `mouseenter`/`mouseleave`/`focus`/`blur`/`click` (click toggles, for tap). Alongside it, a tiny always-on decorative label (`aria-hidden`, `pointer-events: none`) reading "The constraint" so the affordance is discoverable before anyone touches it. Both sit at the border line's own geometric midpoint (`BORDER_LINE[⌊length/2⌋]`), not an offshore point — step 3b's offshore caption candidates existed to give a *large* permanently-visible card clearance from the coast; a small pill and an on-demand tooltip don't need that, and putting the discoverable label anywhere other than on top of the actual hit target would separate the two spatially for no reason.

**Two bugs found wiring this up, worth keeping because they'll recur:** (1) the flow canvas paints over the SVG (§7.2) and, with no `pointer-events` rule of its own, silently absorbed every hover/click meant for the border hit-path underneath it — fixed with `pointer-events: none` on `.map__canvas`, which never needs to receive one. (2) `.map__border-overlay`, the positioning wrapper around the label and tooltip, has no visible background but is still a hit-testable box — its transparent area between the two children was shadowing the SVG path below it. Fixed the same way: `pointer-events: none` on the wrapper, with the exception carved back in for the open tooltip (`.is-open .map__border-tooltip { pointer-events: auto }`) in case its own text ever needs to be interacted with. Both are the same species of mistake — an invisible element still occupies its box for hit-testing — and both were only caught by checking `document.elementFromPoint` against the intended target, not by looking at the screen.

**Fallback for touch and screen readers:** the same sentence `constraintSentenceOf` produces for the tooltip is always printed as a plain paragraph in the method note (`methodConstraint`, `src/map/main.ts`), regardless of whether the tooltip has ever been opened — per 026's own requirement, no one is dependent on discovering the affordance.

### What was removed

The narration view and its fetch (`narrationView`, `fetchNarration`) — `/map` no longer imports either; `narrate.ts` and `../view/narration.ts` are untouched and still serve `/`. The floating "wind note" (`.map__wind-note`) — its "declared output, not metered" content is already load-bearing in the method note's `methodFlowScope` line, which stays. Every eyebrow heading (`THE WIND IS HERE`, etc.) — the map's own `mapBandView`/`mapHeadlineView`/`mapMastheadView` simply never render one, rather than hiding the dashboard's via CSS. The border's caption card and its leader line. The dashboard masthead's standfirst — `mapMastheadView` (`src/map/views/masthead.ts`) keeps only the *warning* half of that slot (stale/failed/rollover notices), now positioned under the clock, top right, rather than sharing a slot with an introductory sentence that no longer exists on this page.

### Also fixed in this pass, found while building

The headline panel and the Scotland panel were sharing one CSS rule (`position: absolute; right: var(--gap-lg)`) inherited from step 3, when 026's own anatomy puts the headline top-left and Scotland top-right — an artefact of the step-3 layout never having been revisited when the anatomy was rewritten. Split into `.panel--headline` (`left`) and `.panel--scotland` (`right`); the Shetland inset, which used to sit top-left, moved to bottom-left to stay clear of the headline's new position. `.composition`'s `min-height` was `100svh` in step 3 and briefly regressed to `80svh` while drafting this step's CSS from scratch — caught by the headline's own evidence (the farm list) clipping off the bottom of the viewport, restored to `100svh`.

**What was rejected:** editing `app.css`'s dashboard classes to carry a light-theme variant (would have coupled `/`'s dark bars to `/map`'s light ones through shared, conditionally-themed selectors — exactly the drift 010/017's "one place, both consumers" pattern exists to prevent); a second `BORDER_CAPTION_CANDIDATES`-style toggle for the tooltip's position (the ambiguity that motivated step 3's two candidates was about clearing a large card from the coast, which no longer exists); raising every receding fuel to 4.5:1 by darkening them further (would have stopped them receding at all, defeating the point of the role system for the sake of a ratio the legend text already satisfies).


---

## 028 — Step 4b built: the grid, the two layouts, the navy palette

**Date:** 2026-09-20
**Phase:** Map page, step 4b ([Windfall_Map_Spec_4b.md](Windfall_Map_Spec_4b.md))
**Decision:** The map page leaves the full-bleed model — a viewport-sized map with every panel floated over it — for a contained, responsive 12-column grid, and takes Owen's updated palette. Two layouts flip at exactly 1280px: from 1280 a clean text column (columns 1–5) beside the map (columns 7–12, the full height of the screen, pinned); below 1280 the text block full-width on top and the map filling the rest of the screen underneath. The three geography-anchored overlays (Scotland mix, England mix, the border label) stay **overlaid on the map at every tier, mobile included** — the step 4 mobile behaviour of stacking Scotland/headline/border/England *below* the map is retired. Built against the four Figma frames (Desktop HD 1440, Desktop 1280, Tablet 744, Mobile 393), read node by node rather than sampled from screenshots; where the frames and the spec disagreed, the frames won and the difference is recorded below.

### The grid and the breakpoints

`src/styles/grid.css` is the one place a pixel breakpoint is written (a media query cannot read a custom property, and a `@custom-media` plugin would be a new build dependency for the sake of four numbers). Everything that varies by tier — page margin, the two-column flip, which columns the text block and the map take, the mix panel's width in columns, the headline's size, how the mix panel arranges itself, where the mix panels hang against the coast — is a token set there; `map.css` and `main.ts` read the tokens and contain **no media queries**. To move a breakpoint, this is the one file.

| Tier | Range | Layout | Margin | Headline | Mix panel |
|---|---|---|---|---|---|
| Desktop L | ≥1440 | two-column | 64px | 40px | 2 of 12 cols (199px) |
| Desktop M | 1280–1439 | two-column | 64px | 32px | 2 of 12 cols (172px at 1280) |
| Tablet | 744–1279 | stacked | 64px | 32px | 3 of 12 cols (136px at 744) |
| Mobile | ≤743 | stacked | 24px | 20px | 4 of 12 cols (99px at 393) |

12 columns and a 24px gutter at every tier. The panel widths above are what the Figma frames measure — 199/172, 136 and 99px — and they are exactly 2, 3 and 4 columns of the frame grids, which is how the spec's "3 of 12 on tablet, 4 on mobile" was confirmed rather than assumed. Boundaries are in `rem` so they scale with the reader's font size; at the default 16px they are the spec's pixel values. Verified at 743/744, 1279/1280 and 1439/1440. Past 1440 the page centres (`--page-max`) rather than stretching, since the frames stop there.

### Where the frames overrode the spec

- **The breakdown bar's colours were the wrong way round in the spec.** §3 has `#2E469A` as the fill on a `#E9ECF8` track. The frame fills are: the whole 32px bar is `#2E469A` (the declared output), and the curtailed share is the *lighter* `#4865CB` run at its left. Built as the frames have it. New tokens `--bar-track`, `--bar-share`, `--bar-label`.
- **Wind is two blues.** §3 gave `--fuel-wind` as `#2141BF` "wind segment, farm markers; matches the flow stroke". The frames' wind segment and legend swatch are `#2E469A`; `#2141BF` is the blue sampled from the flow's stroke cores in the flattened map image. So `--fuel-wind` is now `#2E469A` (bars, legend), and a new `--wind-live: #2141BF` is what wind looks like *on the map* — the farm markers, `--curtailed-edge`, the hatch tint — so the markers keep matching the flow, which is untouched.
- **The link blue is two lightness points darker than the frame's.** `#4865CB` is 4.18:1 on cream, below AA for the 12px MW figures in the farm list. `--link: #405EC9` is the same hue at 4.56:1, the smallest step that clears 4.5. The frames' `#7a7769` for muted text (3.58:1 — the step-1 value 027 already corrected) is deliberately **not** re-adopted; `--text-muted` stays `#65624f`.
- **The headline figure is megawatts, not a percentage.** The spec's §4.1 wireframe and the frames both read "At least **2,134 MW** of Scotland's tracked wind…" with "**13%** of 13,105 MW" inside the bar, where step 4 had the percentage in the sentence and "2,134 of the 13,105 MW Scotland is making" under the bar. §1's "view modules are not rewritten" could not hold for this: `views/headline.ts` now prints `curtailedMW` in the sentence and `pct of declaredMW` in the bar. The 026/027 denominator is unchanged (declared output, never capacity) and the figures still come from the one payload, so sentence, fill and label cannot disagree. The MW figure is **floor-rounded** (`formatMWFloor`, alongside `formatPctFloor`): "at least 2,134 MW" on 2,133.6 MW would claim more than the floor supports. The old breakdown line stays in the DOM, visually hidden, as the one plain sentence a screen reader gets for the (aria-hidden) bar.
- **The text block at 1440 is columns 1–5 *plus* the gutter after them** (557px on the frame; columns 1–5 alone are 533). The spec's "ends ~596px" was 24px short, and at 40px that is the difference between the frame's three-line headline and a four-line one. The 1280 frame is exactly columns 1–5 (466px). One token, `--text-bleed`, on Desktop L only.
- **Tablet's margin is 64px, not 24px.** Spec §5.1 says 24px for both stacked tiers; the Tablet frame's masthead, headline and bar sit at 64px in and its mix panel lands on the column-10 line only with 64px margins. Mobile is 24px. One token (`--page-margin` in the tablet block) if 24 was meant.
- **The map is fit to everything it draws.** Before 4b the inset extent fit the mainland alone and let Orkney and the Outer Hebrides poke into a generous fractional margin. With an exact 24px padding that clips Orkney by ~13px at 1280×720, so the fit ring is now the mainland plus every island in play in both extent modes (Shetland still stays out of it — that is the inset's whole point). It shrinks the mainland ~5% where height-limited; it is the honest reading of "the map fits its cell with 24px padding".

### The footprint

- **The clock row moved.** The settlement-period / "Read N ago" row is now between the headline sentence and the bar, as in the frames. The masthead view still builds and updates it (its freshness dot, hollow/amber/red rules and the stale/failed notice, 010/016/017, all travel with the element); `main.ts` re-parents it. Likewise colophonView's `<details>` ("How this number is worked out") is re-parented into the text block, and its byline is set to the frames' "Built by Owen Thomas" (the "figures are lower bounds" clause is dropped from the screen — the headline's "At least" and the method note already say it — not from `colophon.ts`, which `/` still uses). Source health stays at the foot, visible.
- **Copy:** masthead "Windfall ≋ Scotland wind energy tracker" (Windfall bold; the frames' glyph is U+224B, not the step 4 "≈"); the farm list's tail reads "and N more" (was "…, X and Y among them") and its separator is "•", matching the frames; the mix bars are 8px slivers with no inline label (the legend has every share).
- **Mix panels are placed by the grid horizontally and by the coast vertically.** Scotland takes the last N columns of the map cell, England the first N; each panel's top edge hangs from a latitude (`--anchor-*-lat`, per tier, read off the frames). So the panels are flush to the columns and level with their country at every fit. The border label is still placed by the projection alone, on both axes. The step 3 England candidates and the `e` key that cycled them are removed — the mechanism they served is replaced.
- **Tablet and mobile arrangement, all tokens:** name / bar / intensity / legend stacked (desktop puts name and intensity on one line); legend a single-column stack; on mobile only, the caption sentence is taken off the screen (`max-height: 0`, never `display:none`, so it is still read aloud) and the Scotland panel is right-aligned with its swatch trailing, as the Mobile frame has it.
- **The Shetland inset moved from the map's bottom-left corner to the foot of the Scotland panel.** It is not in the frames at all. Every corner failed somewhere: bottom-left collides with England's tall panel and, stacked, with Cornwall; top-right collides with Scotland at 1280×720; on a phone the island fills the width and no corner is free. The sea east of Scotland is free at every tier, and the inset is Scotland's (the Viking farm and its landing), so it sits in that column, ranged the way the panel ranges. Its logic is untouched.
- **The stacked footer is its own row under the map** (the spec's §4.2 wireframe puts the byline last), so it never overlays the flow. The feed descriptors ("NESO · mix, regions, forecast") show at desktop and are dropped from the stacked layouts, where they cost a line each.
- **Fixed on the way — tap on the border.** The step 4 tooltip had a latent bug the old mobile layout (tooltip forced permanently visible) hid: a tap focuses the hit path or fires a compat `mouseenter`, which opens the tooltip, and then the same tap's `click` toggled it shut, so on a phone it never appeared. Hover is now pointer-events for mouse only, a mouse click pins it, a tap toggles it (ignoring the click that follows the tap that just opened it), a tap elsewhere closes it, and the open tooltip is clamped inside the page margins. Verified with real touch input at 393 and 744.
- **Fixed on the way — degraded region heads.** With Carbon Intensity unavailable or pending, "Carbon Intensity unavailable" / "Waiting for Carbon Intensity" sat `nowrap` beside the region name and overprinted it on desktop (and was clipped on mobile). Those states now stack the sentence under the name and let it wrap. Found only by reading all six non-live fixtures at both widths, which is why 4b.5's gate is a read-through and not a screenshot.

### Palette, re-checked against AA

The 027 table re-run with the values above, computed live on `/map?plate=tokens` (the plate now has a contrast section that resolves every token from its computed style, so it cannot drift from the CSS):

| Pair | Ratio | Need |
|---|---|---|
| `--text-primary` `#152767` on cream | 11.01 | 4.5 |
| `--text-muted` `#65624f` on cream | 4.89 | 4.5 |
| `--link` `#405EC9` on cream (farm-list MW) | 4.56 | 4.5 |
| white on `--bar-track` `#2E469A` | 8.54 | 4.5 |
| white on `--bar-share` `#405EC9` | 5.73 | 4.5 |
| `--fuel-wind` `#2E469A` on cream | 6.79 | 3 (graphic) |
| `--wind-live` `#2141BF` on cream / on `--curtailed` | 6.49 / 5.07 | 3 (graphic) |
| receding fuels on cream | 3.03–3.50 | 3 (graphic), unchanged from 027 |

Two things change on 027's table by construction. The held-down marker's edge against its fill rises from 3.60 to 5.07. And the on-segment label rule (wind/gas/coal take light ink) is moot: the bars are 8px with no label, so every swatch is now read only beside its legend text, which is `--text-muted`/`--text-secondary` on cream at 4.89/6.88. **One disclosed exception:** `--bar-share` against `--bar-track` is 1.49:1 (1.63:1 at the frame's own `#4865CB`). It is two fills of one bar, read by the label inside it — "38% of 5,363 MW" — never by the boundary between them, and it is the frame's pair, kept as drawn. If a stronger edge is wanted the smallest fix is a 1px `--bar-label` seam at the boundary.

### Verification

- **Padding:** exactly 24px (48 device px at 2x) at the limiting side, measured from the projection's bounds, at 1440×1024, 1440×900, 1280×720, 1024×768, 744×1133 and 393×852, at 1x and 2x.
- **Coast-to-mask alignment:** a 6px grid of the mask against the rendered pixels, away from a 3px coast band and outside drawn-island polygons: ≤0.6% mismatches at every tier and DPR, all of them offshore farm corridors (in the mask, not drawn as land) and offshore farm markers and the border line (drawn over sea). No coast-adjacent drift, and the same rate at 1x and 2x.
- **Against the frames:** ink rows of the text column, and of the mix panels, compared with the frame images pixel-row by pixel-row. The text column lands within 1px on every row at all four frames (1440, 1280, 744, 393); the mix panels within ~5px at 1440/1280 and ~7px on the stacked frames, where the frames place them by hand. That precision needs `text-box: trim-both cap alphabetic`, which reproduces the frames' cap-to-baseline gaps; a browser without it (Firefox, today) gets the same layout a few pixels looser.
- **Fixtures:** the six fixture states read through at 1440 and 393 (the seventh, `live`, is whatever the grid is doing), and `curtailing` at 744. `/` and `/flow` load with no errors and keep their dark palette; the production bundle builds.

### Not decided here — for Owen

- **The fuel palette.** The frames carry *two* different sets for the non-wind fuels: the 1440 frame has solar `#9a822e`, nuclear teal `#2e7c9a`, biomass `#7c9a2e`, imports `#a89e8c`, gas brick `#9a4c2e`; the other three have solar `#81724e`, nuclear crimson `#a73b4f`, biomass violet `#806699`, imports `#a19489`, gas blue `#2e7aa6`. The spec names neither, hydro/coal/other appear in neither, and the second set makes gas a blue beside an indigo wind. I changed wind only and kept 027's role system (gas the warm opposite, the rest receding).
- Whether tablet wants 24px margins after all, and whether the farm list should keep "and N more" or go back to naming two of them.

**What was rejected:** `postcss-custom-media` or lightningcss for the breakpoints (a build dependency for four numbers, when one file of tokens serves); container style queries on `--tier` (not in Firefox); `text-wrap: balance` on the headline (it re-breaks the frame's three lines into different, more even ones); a JS-set `data-tier` attribute so `map.css` could style by tier (a second source of truth for what the tokens already say); sizing the stacked map from the island's aspect (the frames fill the remaining screen, and an aspect-derived height made the page taller than the frame on a tablet); overlaying the stacked footer on the map's corner, as the frames do with the bare byline (the source-health rows collide with Cornwall and the inset); keeping the inset in a corner, on the evidence above; reverting to the step 4 mobile stack (Owen's call: overlaid).


---

## 029 — Step 4c: the positive reframe, the source list, the passive border

**Date:** 2026-09-21
**Phase:** Map page, step 4c ([Windfall_Map_Spec_4c.md](Windfall_Map_Spec_4c.md))
**Decision:** The headline turns from the megawatts held off the grid to the share of tracked wind that is on it; the farm list becomes an always-present, interactive source panel; every explanation moves into one disclosure; the border becomes a passive line. Built in gated stages 4c.1–4c.4, with windspeed (4c.5) as a follow-on. **This entry is written as each stage lands, so it is incomplete until 4c.4 closes.**

### Confirmed with Owen before building (21 Sept)

- **Windspeed source (4c.5): Open-Meteo**, as the spec assumed: free, no key, km/h, and it batches all 76 farm coordinates in one cacheable call.
- **Source-row MW: on-grid MW (`instructedMW`), not declared output.** The spec assumed declared. The consequence: the row's figure is the numerator of the same ratio its mini-bar draws, and it agrees with the big bar's `{onGrid} of {declared} MW` reading. The bar still carries the share, so there is no percentage in the row (spec decision 4). The visible row text carries only one of the two numbers, so a row's accessible name should state both.
- **`--highlight`: start at `#0a7cff`, tune on the live map at the 4c.3 gate.** About 211° hue against `--wind-live`'s ~227°; 3.13:1 on the cream ground, which clears the 3:1 graphic bar. Against `--wind-live` itself it is only ~2.1:1, which is why dimming the rest of the field, not the hue, is what makes the selection legible; that stays whatever the hue ends up. Rejected: `#0091ff`, which separates more from `--wind-live` but is 2.57:1 on cream, below the graphic threshold.
- **Palette source: PNG exports of frame `49:747` from Owen** (the curtailed and not-curtailed states, 1440×1024) **plus the Figma "Selection colors" list** (13 hexes). The cloud Figma connector answered `get_screenshot` and `get_metadata` for the frame with its Starter-plan tool-call limit. The desktop bridge was not used: Owen said not to, and the spec records that it errors on this file. Flat fills sample exactly from a 1x export, and every one of the 13 hexes was found in the frame.

### 4c.1 — quick wins (built)

- **The border is passive.** Removed: the hit path, "The constraint" label, overlay, tooltip view (`borderView` is deleted from `view/border.ts`; `constraintSentenceOf` stays and still feeds the method note), the pointer/tap/focus handling in `main.ts` (62 lines), and the CSS for all of it. The line is `--text-primary` at full opacity and `pointer-events: none`, so nothing about it is hoverable, focusable or clickable. The landing stagger loses the border's step: Scotland 2, England 3.
- **It is drawn coast to coast.** New `src/map/borderLine.ts` joins each end of the source line to the nearest point on the coast ring (only if within 15 km, and more than 0.3 km away). The west end was ~10 km short (the Solway), the east ~1.5 km. *Rejected:* carrying the end segment on until it meets the coast. The landing point moved between 24 km and 60 km, or missed altogether, depending on how many points the direction was read from, because the source line's tail is a staircase. The nearest point does not depend on that. *Checked at 1440:* each end tests as on the drawn coast edge (inside the fill at the end and 4 device px back, outside 4 px beyond), and the close crops show the line stopping at the Solway inlet and at the North Sea edge.
- **Shetland.** Swapped to first in Scotland's panel. The "…output enters the mainland at…" caption removed (the `landingCaption` rendering and the `.map__inset-captions` block). *Box and label as first built (outline removed, 16px label under the island) were superseded at the gate; see "Owen's calls at the 4c.1 gate" below.*
  - *Where the band sits, checked against the frame.* It is the mix **band's** top edge that hangs from the latitude anchor, as 4b's frames measured it, and the inset hangs **above** it: `positionOverlays` subtracts the band's offset within the panel from the anchor. The alternative, the inset taking the anchor and the band being pushed down, moved Scotland's mix down 157px at 1440. Measured against `49:747` at 1440×1024, the England panel and masthead land within 1–2px, but Scotland's heading sat 27px lower than the frame's (y=218 against 191), so the frame moved the band up when the inset arrived. `--anchor-scotland-lat` at Desktop L is retuned **57.33 → 57.58** (with a comment saying why). The heading now measures y=190 against the frame's 191, and the inset's top y=42 against the frame placeholder's 40. Desktop M, tablet and mobile are unchanged: there is no new frame for them, so the 4b anchors stand.
  - Where the anchor is too high for the inset to fit above it, the panel clamps to the top of the cell and the band sits below its anchor. That happens at 1280×720 (band 149px) and would at 1440×800 or shorter; it is a mechanism, not a measurement, and unverified against any frame.
  - Two robustness fixes on the way: the label has `line-height: 1.25` (a number, so its box is the same height in any face), and `positionOverlays` runs again on `document.fonts.ready`. The lead-in was first measured before Eczar loaded and put the band ~9px off its anchor.
- **The landing disclosure has nowhere to live yet.** With the caption gone, nothing on screen says that Viking's flow is drawn entering the mainland at its landing rather than at the farm. *Proposal for 4c.4:* one line for it in the consolidated disclosure. `landingCaption` is kept in `farmSources.ts` for that.
- **Colophon.** `.source__mark` is removed from the DOM on `/map` (in `main.ts`; `colophon.ts` is shared with `/`). Health is still stated in words beside each source. The source rows lose their row gap (was 0.15rem) and the byline takes `margin-top: var(--gap-md)` (1.25rem) so it stands clear of them.
- **Byline.** "Built by Owen Thomas ✺ owenthomas.work": the glyph is U+273A in its own span, `aria-hidden`, with `0.25em` either side set in CSS (the frame measures 4px each side; my first `0.75em` was 10px), and the domain is a link (see the gate calls below: it takes the byline's own colour). It keeps an underline. With those gaps the byline's ink box is (65,959)–(283,970) at 1440×1024, identical to the frame's. The glyph is not in Mukta, so it draws from a system fallback font and will vary by OS.

### 4c.1 palette — re-matched to Desktop HD

Sampled from the PNG exports and cross-checked against the Figma list. New value against old, contrast on the cream ground (`#E9E5DC`) computed live on `?plate=tokens`:

| Token | Frame | Was | On cream | Plate |
|---|---|---|---|---|
| `--fuel-wind` | `#2E469A` | same | 6.79 | pass |
| `--fuel-nuclear` | `#2E7C9A` teal | `#847e9c` | 3.74 | pass |
| `--fuel-gas` | `#9A4C2E` | `#a34518` | 4.85 | pass |
| `--fuel-solar` | `#9A822E` | `#a37c30` | **2.98** | disclosed |
| `--fuel-biomass` | `#7C9A2E` | `#71845a` | **2.56** | disclosed |
| `--fuel-imports` | `#A89E8C` | `#7d786a` | **2.11** | disclosed |
| `--signal-ok` (freshness dot) | frame: `#7C9A2E` green; **built: `var(--bar-track)` `#2E469A`, pulsing to `--bar-share`** | `var(--link)` blue | 6.79 at rest, 4.18 at the light end (5.75 / 3.53 on the box) | pass |
| `--text-primary` | `#152767` | same | 11.01 | pass |
| `--text-secondary` | `#4A4D41` | `#4a4d40` | 6.88 | pass |
| `--bar-share` | `#4865CB` | `var(--link)` `#405ec9` | 4.18 (white on it 5.25) | pass; vs track 1.63 disclosed as in 028 |
| `--ink-box` (new) | `#DBD3C4` | — | — | secondary 5.82, primary 9.31 on it |

Plate totals: **23 pass, 4 disclosed, 0 fail.** Three of the four are new (solar, biomass, imports). The fourth is 028's `--bar-share` against `--bar-track`, now 1.63 because the token is the frame's exact value.

- **The frame's fuel set is not the role system 027 built** (wind the one hue, gas its warm opposite, everything else receding toward cream). Nuclear is a teal and biomass a green. It is the frame, so it is the page; the `tokens-light.css` comment now says so.
- **Adopted as drawn, disclosed, not darkened, and accepted by Owen at the gate ("Colour looks good").** 028 darkened the link blue and kept muted text darker than the frame to clear AA, but those are text; these are 8px swatches always read beside a legend name and figure. The AA-clearing versions were offered, not built, and stay as an option: solar `#99812e` (one unit, invisible), biomass `#728d2a`, imports `#8e826c` (visibly browner).
- **Kept against the frame:** `--text-muted` stays `#65624f` (the frame's `#7A7769` is 3.58:1, the 027/028 exception re-confirmed) and `--link` stays `#405ec9`.
- **Not in the frame, unchanged:** `--fuel-hydro`, `--fuel-coal`, `--fuel-other`. Hydro (`#5f86a3`) sits close to the new nuclear teal, so check the two apart if hydro ever appears on `/map`.
- **The map raster is not a palette source.** The frame's map is a flattened render. Its inset marker samples as `#2241BF`, which is `--wind-live` (`#2141BF`), so nothing drifts; the hatched marker (`#C5D7F1` against `--curtailed` `#b9cdf0`) is left alone.
- **`--ink-box` is added ahead of its use** by the bar's chevron button (4c.3) and the settlement row (4c.4), so the plate shows every colour the frame carries.
- **Border colour.** The frame's border line samples as a dark warm grey (about `#41433B`); built in the navy the spec calls for (`--text-primary`), and Owen confirmed at the gate that it looks good.

### Owen's calls at the 4c.1 gate

- **Colours accepted as drawn** (fuels, ink, bars), including the three sub-3:1 fuel swatches above. **Border colour** stays the navy `--text-primary`.
- **The freshness dot pulses between the tracked-wind bar's two blues** (`--bar-track` `#2E469A` and `--bar-share` `#4865CB`), in place of the frame's static green. `--signal-ok` is now `var(--bar-track)`, which is also the dot's resting colour. The pulse is a 2.4s ease-in-out `alternate` colour animation on the dot's `::before` (`--dur-pulse`), and only while `data-freshness='fresh'`: the ageing, stale, failed and pending dots keep the looks 010/016/017 gave them (an animation would override their backgrounds), which I checked on the stale, waiting and offline fixtures. Under `prefers-reduced-motion` the iteration count token `--pulse-iterations` is 0, the same pattern `tokens.css` uses for the durations, so the dot holds the navy. This removes the dot's two disclosed contrast exceptions: both blues clear 3:1 on cream and on the settlement box. 020's rule that no *figure* is ever tweened is untouched: this is a status pip, not a number.
- **The byline's domain takes the byline's own colour** (`--text-muted`), still underlined, as the frame draws it. `--link` has no user on `/map` other than the old farm list, which 4c.3 replaces; after that it can go.
- **Shetland is a square with a 1px `#DBD3C4` outline** (`--ink-box`), as the frame's placeholder is: square corners, no fill, 120px where the panel allows and the panel's width where it does not (99px on a phone). This reverses the spec's "remove the box outline" for the outline only; the caption stays gone. The name is **Eczar regular 12px** in its top corner, **12px** in from the top and the side, on the left from tablet up and on the right on mobile (two tier tokens in `grid.css`, `--inset-label-left/right`). Owen wrote "12pt"; the frame's label is 44px of ink, which is Eczar at exactly 12px (16px would be 60px, and CSS 12pt is 16px), so it is built as 12px. *The spec had 16px for this label; the frame and Owen's 12 supersede it.*
  - The island is drawn in a 120×90 area below a 30px strip kept for the name (`--inset-label-band`), scaled to the square's width, so a phone's narrower square shrinks the island and never runs it under the name. Box-to-band gap is 2rem (the frame's is 31px). At 1440×1024 the box's top is y=39 (the frame's is 40), the band 191 (the frame's 191).
  - The band's lead-in is now 152px (120 + 32), which `positionOverlays` handles as before.

### Verification so far (4c.1)

- **Against the frame** at 1440×1024, dev toggle hidden, ink bounding boxes compared pixel row by pixel row: masthead within 1px; England heading within 1px vertically (2px in x, as in 4b); Scotland heading 1px vertically and 2px in x; byline identical. The England bar's six fuel hexes match the frame's one for one.
- All seven `?state=` fixtures load at 1440×1024 with no page errors, no `.source__mark`, and no border hit/label/tooltip elements in the DOM. `?plate=tokens` loads with no errors. The production bundle builds (`vite build`, to a scratch folder). Band and inset positions measured at 1440×1024, 1440×900, 1280×720, 744 and 393.
- **Baseline:** `tsc --noEmit` reports 17 errors, all in the untracked `scripts/export-map-svg.ts` and none in `src/` or `api/`, both before and after this stage. That means `npm run build` (`tsc && vite build`) fails on `main` today; I did not touch it.

### Not verifiable against the frame

- The two source rows (Carbon Intensity, Elexon Insights) are not in the frame at all, so their gap and the byline's clear space above them are my reading of the spec, not a measurement. The frame's Shetland is a placeholder box with an outline and a small label; built to the spec (no box, Eczar 16px) instead.
- `scripts/capture-step4.ts` still hovers and clicks `.map__border-hit` for its step-4 tooltip plates, so those steps will fail now. Left alone: it is a historical capture script and not part of 4c.

### 4c.2 — the on-grid headline and the bar (built)

The headline says how much of Scotland's tracked wind is **on** the grid, where through 4b it said how much was held off. `views/headline.ts`, `map.css`, the bar tokens.

- **Copy.** "**83%** of Scotland's tracked wind is currently on the grid." The figure is the large, bold `.map-headline__figure`; the apostrophe is the typographic ’, as in the frame and the rest of that file. Stale: "…was on the grid when this was last read." Fully clear: "**100%** …". Pending ("Reading.") and failed ("Unavailable.") keep their existing sentences. The "At least" lead and its element are gone.
- **The number.** `instructedMW = declaredMW − curtailedMW` (clamped to `[0, declaredMW]`, so a curtailed figure that ran past the declared one reads as 0%, never a negative share), over `declaredMW` (the sum of the farms' declared output, never capacity, as 026/028). `pct = instructedMW / declaredMW`. The percentage is `formatPctFloor`: no "Up to", floored, so the frame's 84% reads 83% and a constrained day can never claim more than it has. Below 1% it reads "Less than 1%", from `formatPctFloor`, as before.
- **The bar.** Label `{on-grid} of {declared} MW`, fill width the exact on-grid share. Sentence, label and fill read the same two numbers. The label is 16px Eczar in **one weight** (the 4b bold percentage is gone), inset 16px, vertically centred, and the bar is **42px** tall: all measured off the frame (the label's 135px of ink is 16px Eczar, whose advance for that string is 137.5px). The frame's bar also has an 8px gap and a 42px chevron button on its right; the bar stays full width until the chevron arrives in 4c.3. Screen-reader sentence: "10,971 of the 13,105 MW Scotland is making is on the grid." The bar stays `aria-hidden` and the sentence labelled.
- **The on-grid MW in the label is floored while anything is held down** (the spec says `formatMW`, which rounds to nearest). Rounding the numerator up could print more on-grid megawatts than there are, the same overstatement the percentage's floor exists to prevent. When nothing is held down it is the declared figure rounded as its denominator is, so a clear day reads "13,105 of 13,105 MW" and never "13,104 of 13,105". Floored, it can never exceed the rounded denominator.
- **The bar is turned over, and its tokens renamed to say what they mean.** `--bar-track` (the whole bar, navy) and `--bar-share` (the curtailed run, light) become **`--bar-on`** (`#2E469A`, the on-grid run) and **`--bar-off`** (`#4865CB`, the rest of the declared output). Same two colours, opposite roles; the old names named the old reading and would have misled the next person. The freshness dot's pulse, `--signal-ok` and the plate rows follow. The label runs over the light blue only when the on-grid share is small (white on it 5.25:1). Pending and failed keep the empty grey gauge, so an unread bar never reads as "nothing is on the grid".
- **The frame's own bar is a static mock:** the not-curtailed frame still draws the 84% split under "100%" and "13,105 of 13,105 MW". Built the honest way, a 100% bar is all navy.

**Two changes I made that the spec did not list, both for honesty:**

- **The list of held-down farms is gone from the headline, a stage early.** "Seagreen 631 MW • Moray West 577 MW • …" showed megawatts *held down*; under an "on the grid" headline the same pattern reads as megawatts on it. 4c.3 was going to replace it with the source list anyway, so it comes out now (`farmNodes`, `byFarm`, the CSS, and `--link`'s last user with it) rather than mislead for a stage.
- **The method note's floor paragraph is corrected, map-only and interim.** `colophon.ts` says "real curtailment is higher, and this figure will never overstate it", said of the megawatts held off; the on-grid headline turns that backwards, since it is now the on-grid share that could be a little lower. `main.ts` now says: "…real curtailment is higher, so the true share of Scotland's wind on the grid may be a little lower than the one shown." Same fact, the right way round; the rest of the paragraph is unchanged. **4c.4 replaces the whole note with copy Owen signs off.** `/` still uses `colophon.ts` as it was.

**Verified.**

| Fixture | Sentence | Bar label | Fill |
|---|---|---|---|
| curtailing | 61% … currently on the grid. | 3,313 of 5,363 MW | 61.79% |
| calm (none) | 100% … currently on the grid. | 5,363 of 5,363 MW | 100% |
| stale | 61% … **was on the grid when this was last read.** | 3,313 of 5,363 MW | 61.79% |
| degraded, offline | Unavailable. … (unchanged) | none | empty gauge |
| waiting | Reading. … (unchanged) | none | empty gauge |

The 61% is `floor(61.79)`; rounding would have said 62. The label's on-grid MW plus the old headline's "at least 2,049 MW" curtailed differ from 5,363 by one, because both are floored. Driven through the real view with hand-built states: 0.6 MW curtailed reads "99%" / "5,362 of 5,363 MW"; 99.5% curtailed "Less than 1%" / "26 of 5,363 MW"; 100% curtailed and curtailed-past-declared both "0%" / "0 of 5,363 MW". Bar, label centring and fit checked at 1440, 1280, 744 and 393 (no overflow; the sentence is two lines at each). Plate: 23 pass, 4 disclosed, 0 fail (unchanged). Fixtures load with no page errors at 1440×1024; typecheck clean apart from the known baseline; production bundle builds.

**Corners the spec does not cover, left as they are:**
- **Under a megawatt held down:** the label is exact at megawatt resolution ("5,363 of 5,363 MW") while the floored percentage reads 99%. Both are true of a 99.99% share; noted in the file's header.
- **Nothing declared (`declaredMW` 0):** renders "100% … 0 of 0 MW". Vacuously true, and more misleading under an on-grid headline than the old "None … held off" was. Scotland's 76 farms all declaring zero is not something the data does, so I have not invented copy for it; if you want one, it is a sentence to write.

### 4c.3 — the source list, select-to-highlight and the bar disclosure (built)

New `views/sources.ts` and `onGrid.ts`; `flow/particles.ts` and `map/markers.ts` for the highlight; wiring in `main.ts`.

- **One reading, three readers.** `onGrid.ts` reads `curtailment.now` once and returns the declared and on-grid megawatts, the exact share, the bar label and the screen-reader sentence, plus `onGridFigure()`, the floored-while-held-down rounding from 4c.2. The headline sentence, the bar and every row now call it, so they cannot disagree. That moved the bar out of `headline.ts` (which is now just the sentence and the settlement row's seat) into `sources.ts`, where it is the disclosure's summary.
- **One native `<details>`.** The bar with its chevron is the `<summary>`; the farms are the content. The chevron is the frame's 42px `--ink-box` square, an 8px gap from the bar, a filled triangle pointing down when open and right when shut. With no reading (pending, failed) the bar is the empty gauge, the chevron and list are not shown, and clicking the bar does nothing; `open` is left alone, so a desktop that starts open is still open when the reading lands.
- **Open on desktop, shut elsewhere.** The spec's `matchMedia('(min-width: 1280px)')` would write the breakpoint a second time; `main.ts` reads grid.css's own `--layout` token (`two-col` from 1280) instead, so it is still written in one place. Tablet (744–1279) is therefore shut by default, as the spec has it, and opens to two columns.
- **The list.** All tracked farms, largest **declared** output first, ties by name, so the order does not reshuffle as farms are switched down and up. Top **8**, then a control reading "and 68 more…" (the frame's copy, with its hollow dot) that reveals the rest. All 76 rows are in the DOM from the start (`hidden` while folded), so "View all" is instant. Two columns from tablet up, one on a phone (`--sources-cols` in grid.css), **filled down the first column then the second**, so it reads as a ranking; the frame's placeholder rows are identical across the two columns, so it does not say. Every row is a `<button>` with `aria-pressed` and an `aria-label` reading "Moray West: 84 MW on the grid of 661 MW".
- **Row anatomy, measured off the frame:** a 10px dot; the name in **Eczar bold 12px** ("Seagreen" is 52.1px against the frame's 52); a 64×4px mini-bar, `--bar-on` for the on-grid share on `--bar-off`; the figure in Mukta 12px in `--fuel-wind`, right-aligned; a 20px pitch; columns 287px apart; the list 10.4px under the bar. At 1440 the bar, chevron, dots, names and figures land within 1px of the frame's.
- **The MW figure is on-grid MW** (Owen's call, over the spec's declared), floored while that farm is held down. On the curtailing fixture that reads Moray West "84 MW", Seagreen "0 MW": striking, and right; the mini-bar carries the share.
- **The MW column is 50px, not the frame's 42px**, so a four-digit figure fits ("1,075 MW" is 48.8px; Seagreen at full output is one). The mini-bars therefore sit 8px left of the frame's.
- **Rows at the edges, never an assumed zero.** A farm that declares nothing (`unitsDeclaring` 0) gets a hollow dashed dot (as its map marker), "—" for its megawatts and no share. A farm that declares exactly **0 MW** has said so and reads "0 MW", but has nothing to divide, so its bar is a plain grey rail: a full lighter bar would read as "all of it held down". (The fixture has eight of the second kind, none of the first.) A fully held-down farm with a declaration ("Seagreen") is a bar with a 0% fill, all `--bar-off`.
- **Select-to-highlight.** Selecting a row calls `onSelect(farm)`; `main.ts` picks the farm out on the map and nowhere else. It is single-select; selecting the row again, clicking anywhere outside the list (the map, the bar), pressing Escape, closing the disclosure, or folding the list past the selected farm's row all clear it. "and N more…" is inside the list and does not.
  - *Flow.* `ParticleSystem.setHighlightSource(farmId, style)`. Source ids are the farm names, so the mapping is direct; the index is re-resolved on `setWorld`, so a resize keeps the selection. While a farm is picked, every other source draws at **0.22** of its opacity and the picked one draws last, on top, in `--highlight`, 1.35× heavier. A paint change only: no particle is added, moved or re-timed. The trails fade over the usual few frames. `globalAlpha` is restored at the end of `render()`, because the caller's next draw is its trail-fade wash.
  - *Markers.* `data-highlight` on the picked marker, `data-highlighting` on its svg; the others fade to 0.28 and the picked one grows 1.6×, filled `--highlight` (declaring) or ringed in it 2.5px (held-down, silent). The Shetland inset is a separate svg and is styled and driven the same way, so selecting Viking lights its inset marker. Highlight is re-applied when the inset redraws on a rebuild.
  - *Measured on the live canvas:* selecting Moray West took the azure pixel count from 1,903 to 4,990 and the mean opacity of the rest of the field from 135 to 82. It survives a resize (map rebuilt).
- **`--highlight` is `#0a7cff`, as agreed; to tune by eye at this gate.** 3.13:1 on cream, and 3.52:1 on the selected row's tint, `--ink-raised`. Because a fully held-down farm emits at the floor rate, its own flow is a few short streaks and the ring on its marker is the main cue; the dimming does the rest.
- **Selected row:** a lighter tint (`--ink-raised`) and the `--highlight` dot, so the dot on the list is the same blue as the marker. Hover is a soft `--ink-box` wash. Focus is a 2px `--text-primary` outline on the row or the bar.
- **Keyboard.** Rows are native buttons: Tab to reach, Enter or Space to select, Escape to clear; Enter on the bar opens and shuts the list. Tab visits every visible row (up to 76 when unfolded); there is no arrow-key roving. Screen reader: the summary is named by the bar's plain sentence plus "The farms behind it, largest first."; the bar itself stays `aria-hidden`.
- **Copy I supplied:** "Show fewer" for the control once the list is unfolded (the frame shows only "and 15 more…"). For Owen to confirm.

**Verified (40 checks, driven through Playwright):** open by default on desktop, shut on tablet and mobile and opens to two columns (744) or one (393); 8 rows of 76 and "and 68 more…"; selecting by click, Enter and Space; markers dimmed to 0.28 with the picked one at full opacity and scaled; the flow's azure and dimming measured on the canvas; toggling, clearing by outside click, Escape, closing the bar and folding past the row; Viking lighting its inset marker; the states with no reading (waiting, degraded, offline) showing an empty gauge with no chevron or list and ignoring clicks on the bar; calm and stale unchanged; rows fit the viewport at 744 and 393 with no horizontal overflow; no page errors. 4c.2's edge cases re-run through the new views give the same numbers. Plate: 28 pass, 4 disclosed, 0 fail (the five new rows all pass). Typecheck clean apart from the known baseline; production bundle builds.

**For 4c.5, noted early:** the frame draws the windspeed glyph as ≋ (U+224B, the same glyph as the masthead's), where the spec's text says ≈. The rows will use the frame's.

### 4c.4 — the consolidated settlement disclosure (built; copy awaiting Owen's sign-off)

New `views/settlement.ts`; `main.ts` retires colophon's own `.method` toggle from this page; `map.css`.

- **One disclosure, hung off the settlement row.** The boxed "Settlement period 31 · 15:00 to 15:30 · ● Read moments ago" row (unchanged: still `mapMastheadView`'s own clock element, with its freshness dot, stale/failed/ageing notice — 010/016/017 — travelling with it) is now a `<summary>` in an `--ink-box` box with a chevron, matched to the frame at 1440 (556.7×42px, both measured). Its `<details>` body is the one explanation.
- **Everything that used to explain something is retired into it, once.** Gone from the page: colophon's `.method` (`method__basis`, `method__coverage`, the floor and parity paragraphs) — detached in `main.ts` rather than edited, since `colophonView` is shared with `/`, which keeps it unchanged — and the four map-only paragraphs `main.ts` used to append to it (`methodSettled`, `methodConstraint`, `methodFlowScope`, `methodBlindFarms`), along with `updateMethodMapNotes()`. The border's tooltip sentence was already gone at 4c.1. Verified: the constraint sentence and both parity figures (23.75 GWh, 23.50 GWh) each appear exactly once in the rendered page, across every fixture.
- **Closed by default, every tier — a judgement, not spelled out in the spec.** The pre-4c `.method` was "closed by default and one click away" (its own doc comment); this is the same kind of content (reference material a reader checks, not the page's argument), so it keeps that default rather than taking the bar-and-list's open-on-desktop rule. Flagged for Owen to confirm at the gate.
- **The copy** (four paragraphs, assembled from `AppState` so the dynamic parts can't drift from what the rest of the page is saying):
  1. What "on the grid" means and why it's a floor (folds in `method__basis` and the reframed floor point), then the coverage figure (`method__coverage`'s units/capacity) and the blind-farms count (`methodBlindFarms`) — kept as **"tracked farms"**, not "them", since `unitsTracked` (BMU-level) and `farms.length` (farm-level) are different counts and a pronoun would have pointed at the wrong one. Caught by reading the assembled text on the live page, not by inspection — worth flagging as the kind of thing string-templating hides until you read the output.
  2. The constraint: one static sentence on the mechanism (new copy, per spec §7), then `constraintSentenceOf(state)`'s exact three-state sentence, reused verbatim from `constraint.ts` exactly as the border tooltip and `/`'s own `constraintView` did — so the screen-reader path the gate asks to preserve is the same sentence, in the same place a sighted reader gets it, not a paraphrase.
  3. Verification, trimmed hard per spec: kept the single-day comparison (Windfall's 23.75 GWh against a widely-cited 56.45) and the independent tracker's corroboration for the same day (23.50 GWh), plus one aggregate sentence over six sampled days. Dropped: the named dates for the two outlier days, and the tracker's-own-gaps adjustment that brought one of them from 30% to about 5% — a defensive footnote-to-a-footnote that made the original two sentences read as hedging rather than reporting. The 30% divergence itself is kept, disclosed rather than smoothed over.
  4. The last **settled** (non-provisional) half-hour's curtailed volume (`methodSettled`'s line, `settledLine()` unchanged) — a different, smaller figure than the historical 23.75 GWh in §3 (one half-hour against one day), kept as its own short closing line as before.
- **Written through `owen-thomas-work:house-style` and `design:ux-copy`**, against the existing page copy's own established terms (`balancing mechanism`, `declared`, `instructed`) rather than introducing new vocabulary. One `it's not X, it's Y` construction was drafted and cut in favour of a direct statement ("It's a floor.") per the style's own flagged pattern.

**Verified:** all seven fixtures render the disclosure with no page errors and no leftover `.method` element or "How this number is worked out" text anywhere in the DOM; closed by default confirmed on all seven; click and Enter-on-summary both toggle it; the map cell's position and the `World`/`ParticleSystem` object identity are unchanged across a toggle (checked in-page, not by comparing two `page.evaluate` return values, which Playwright clones — an early version of this check was comparing clones and always failed regardless of behaviour). Body fits with no horizontal overflow at 744 and 393. Plate: 28 pass, 4 disclosed, 0 fail (unchanged — this stage touches no tokens). Typecheck clean apart from the known baseline; production bundle builds. Footer (source health, byline) unaffected by detaching `.method`.

**Not yet true:** the copy above is a draft. Per spec §4c.4/§7 it needs Owen's sign-off before this gate closes; nothing here is final until he's seen it.

### 4c.4 — redraft at review: the copy, the order, the chevron (built; awaiting final sign-off on §3 alone)

Owen's first pass on the draft caught three things.

- **The copy is rewritten**, merging what were separate "reading" and "constraint" paragraphs into one (lead with what farms declare, the transmission limit as the reason output is held back, "What remains is on the grid.") and tightening the coverage/floor paragraph and the settled-line to his own phrasing. `settledLine()` (`views/headline.ts`) now reads "970 MWh curtailed between 11:00 and 11:30." — tighter than the previous "…over the last complete half-hour, 11:00 to 11:30." The verification paragraph (§3, the parity check) was not part of his note and is unchanged from the first draft — **still awaiting his confirmation**, since sign-off was asked for the whole disclosure, not by omission.
- **A units/farms mismatch, caught in his own rewrite.** His draft read "It tracks 112 transmission-connected Scottish wind units... Of those, 76 had declared" — the same bug I'd already fixed once in my first draft (`unitsTracked`, BMU-level, and `farms.length`, farm-level, are different populations; "of those" pointed at the wrong one). Flagged rather than built as written; fixed by naming both counts explicitly — "112... units across 76 farms... 76 of those farms had declared" — keeping his wording otherwise. The live constraint sentence (`constraintSentenceOf`) is still appended after his paragraph, for the same reason as the first draft: it is the one place `/` and `/map` are guaranteed not to describe the network's state differently, and the gate asks that the screen-reader path to it survive. Not something he asked for in his edit — flagged, not assumed.
- **The disclosures were in the wrong order, and their chevrons disagreed.** The settlement row was seated in `.map-headline__meta`, ahead of the bar and list — backwards from the frame's own order (§1: bar, list, settlement row, explanation) and from what `views/headline.ts`'s own 4c.2 comment had already flagged as 4c.4's job to fix. Caught because Owen described the settlement chevron as "the top" one — true only because of this bug. Fixed: `main.ts` appends `sources.el` then `settlement.el` to `headline.el`; `.map-headline__meta` is deleted from `headline.ts` (nothing sits in it any more) and the clock's layout selectors retarget from `.map-headline__meta` to `.map-settlement__summary`. Separately, the two chevrons were rotating opposite ways: the bar's (4c.3) was built right-when-shut/down-when-open (the standard disclosure-triangle convention — native `<details>`, GitHub, Finder); the settlement one was down-when-shut/up-when-open. The frame is no help here — its one static capture shows both disclosures open, so both chevrons happen to be drawn "▼" in the source regardless of which convention the designer intended. Standardised both on the same pattern as the bar's, since that is the more universal one and the two now sit on the same page. Verified: both chevrons resolve to the identical CSS transform in each state (`none` open, `matrix(0,-1,1,0,0,0)` shut).

**Verified again after the redraft:** full regression suite re-run (fixtures × 1440/744/393, click/keyboard toggling, closed-by-default, duplication checks, the map/`World` untouched by a toggle) — all pass; DOM order confirmed `sentence → sources → settlement`; plate 28/4/0 unchanged; typecheck and build clean.

**Still open:** Owen's sign-off on the verification paragraph (§3), and on the disclosure's default-closed state (flagged, not yet confirmed either way).

### 4c.4 — final cut: no parity paragraph, no live constraint sentence

Owen's answer on the two open items from the redraft, both "no":

- **The verification/parity paragraph is dropped entirely.** The spec's own §7 allowed this ("if they still read as honest under the new frame — trim hard" implicitly permits trimming to nothing), and it's Owen's content call to make. The disclosure is now three paragraphs: the mechanism and floor, what's tracked, the last settled half-hour.
- **The live constraint sentence is dropped too**, on his reasoning that the opening paragraph already explains what happens when the network is full. **This is a confirmed, deliberate departure from the spec's own 4c.4 gate line** — "screen-reader path to the constraint sentence is preserved" — which I flagged once more before cutting it, rather than assume the point was settled by silence. After this, nothing on `/map` states in words whether the network is constrained *this specific half-hour*: only the general mechanism (static, in the disclosure) and the headline's percentage, which implies it (anything under 100% means something is being held back) without saying so outright. Recorded here rather than left for someone to notice later.
- **`src/view/border.ts` is deleted.** `constraintSentenceOf` was its only export and had no remaining caller once the live sentence came out — the map's last use of the three-state CONSTRAINED/CLEAR/UNKOWN copy. Consistent with how 4c.1 handled `borderView` (removed outright, not left unused): a retired mechanism doesn't stay in the tree as an unused export. `constraint.ts`'s own doc comment (which named `border.ts` by file) is updated to say so; `/` still owns and uses `constraint.ts` and its own `constraintView` unchanged.
- **The static text moved out of `update()`.** With the live sentence gone, the mechanism paragraph and the disclosure's screen-reader label are the same in every state, so they're set once at construction rather than recomputed (harmlessly, since `setText` no-ops on an unchanged string, but honestly) on every 15-second render tick.

**Verified:** typecheck clean (including after deleting `border.ts` — confirmed nothing else imported from it); the disclosure renders three paragraphs across all seven fixtures with no page errors; plate 28/4/0 unchanged; production build passes.

This closes 4c.4, and with it the main run (4c.1 → 4c.4). 4c.5 (windspeed) remains a follow-on.

### 4c.4 — a second wording pass: "Scottish wind farms", and the settled line dropped

Two more from Owen, on the version with the parity paragraph and live constraint sentence already gone:

- **"These wind farms" → "Scottish wind farms".** The opening sentence no longer has a "these" for the demonstrative to point at (nothing precedes it), so it read as a dangling reference; naming the country is also just plainer, matching the rest of the page's own habit of naming Scotland rather than implying it.
- **The settled-half-hour line is dropped, not reworded.** It named a different period from the one the row above it shows (the last complete, settled half-hour, against the one now running) and, on his own reading, was mistakable for describing the current one. I asked which he wanted — drop, or reword to lead with "the half-hour before this one" so the distinction is unmissable — rather than guess, since this is exactly the kind of tense/period confusion 010/016/017 exist to prevent and the two outcomes are materially different. He chose to drop it: the same logic as the parity paragraph, that a fact raising more questions than it answers has no place in a disclosure meant to remove doubt, not add it.
- **`settledLine()` (`views/headline.ts`) is deleted**, along with its now-unused imports (`formatMWh`, `formatTime`, `CurtailmentResponse`) — its only remaining caller was the paragraph just removed, and `/`'s own `view/headline.ts` has always had its own separate, untouched implementation of the same name.

The disclosure is now **two paragraphs**: the mechanism (static, Owen's exact words) and the floor-and-coverage paragraph (dynamic: unit/farm counts and the blind-farms note).

**Verified:** typecheck clean; the two-paragraph disclosure renders across all seven fixtures with no page errors; plate 28/4/0 unchanged; production build passes.

## 4c.5 — the windspeed feed (follow-on, built)

New `api/windspeed.ts`; `src/lib/types.ts`, `src/lib/client.ts`, `src/lib/state.ts` for the wire type, the independent fetch and its place in `Feeds`; `src/lib/format.ts` for `formatWindspeed`; `src/map/views/sources.ts` and `src/map/map.css` for the row; `src/map/main.ts` for the independent fetch, mirroring `fetchNarration`'s own pattern.

- **The route.** One batched call to Open-Meteo for all 76 farms — `latitude`/`longitude` as comma-joined lists built from `farms.json`, `current=wind_speed_10m&wind_speed_unit=kmh` — trusting response-array-position to match request-array-position (confirmed against the real API: a two-point test call returned the two locations in request order) rather than matching back by lat/lon, since floating-point round-tripping through a query string is not a safe equality check. `health` is `ok`/`partial`/`failed` by how many farms actually got a usable number back; a response that isn't the expected array shape, or the fetch itself failing, degrades the whole route to `failed` with empty `speeds` — the client already treats "no entry for this farm" and "the whole feed is down" identically, so failing shut costs nothing extra.
- **The client.** `fetchWindspeed()`, independent of `fetchCoreFeeds()`, exactly as `fetchNarration()` is on `/`: `map/main.ts`'s `refresh()` now runs `fetchCoreFeeds()` and `fetchWindspeed()` in parallel and lets each land into state and re-render on its own resolution, so a slow Open-Meteo can never hold up curtailment or the mix, and `state.pending` is gated on core alone.
- **Fixtures never populate it**, same convention as `narration` (`state.ts`'s own comment on the field): `scenarios.ts` never touches the network, so every `?state=` fixture renders the source list with no windspeed at all — confirmed, and the correct behaviour, not a gap.
- **The row.** The clause runs on from the name inside the same flexible grid cell, not a column of its own — `Seagreen ≋ 25 km/h` — matching the frame's layout rather than the spec text's "≈" (the frame's actual glyph is ≋, U+224B, the same one the masthead uses; noted as an open item at the 4c.3 gate and now resolved by using the frame's). Colour and face match the MW figure (`--fuel-wind`, Mukta), so both numeric asides read as one register against the bold display-ink name. The glyph is `aria-hidden`; the reading itself is folded into the row's existing `aria-label` ("Seagreen: 535 MW on the grid of 535 MW, 25 km/h") rather than left to a sighted-only aside, consistent with how the rest of this page treats decorative marks.
- **Never a zero or a guess.** A farm with no entry in `speeds` — feed down, partial failure, or a coordinate Open-Meteo genuinely can't serve — renders with an empty windspeed span (an empty inline element costs nothing) and no windspeed clause in its `aria-label`. Checked both ways: the whole feed aborted (every one of the 76 rows renders with no clause, the bar and headline untouched, `data-state="ok"` on the list unaffected) and a partial response (half the farms deleted from `speeds` server-side mid-flight) rendering exactly the answered half with a well-formed clause and the other half with none — never a `0 km/h` or a stale-looking dash.
- **Long names truncate, not the row.** `.source-row__label` gets `min-width: 0` and `.source-row__name` gets `text-overflow: ellipsis`, so a long name ("Neart Na Gaoithe" → "Neart Na G…" at the tightest column width tested) truncates rather than pushing the mini-bar and MW figure out of alignment or overflowing the row. Not something the frame's own four short-named example rows could have shown; found by rendering real data, not a case list.

**Verified against the real Open-Meteo API** (not a mock): `curl` confirmed the batched request/response shape directly, then the live route (`/api/windspeed`) returned `health: "ok"` with all 76 farms answered and the expected `Cache-Control` header. The full `/map` page, loaded live (not a fixture), showed all 76 rows with a windspeed clause and correct `aria-label`s. Checked at 393 and 744 with no row or page overflow. All seven fixtures still render with no page errors (and, as expected, no windspeed). Plate 28/4/0 unchanged. Typecheck clean apart from the known baseline. Production bundle builds.

This closes 4c.5, and with it the whole of Windfall_Map_Spec_4c.md.
