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
