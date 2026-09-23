# Windfall Map Page — Step 4d: the held-back reframe, labelled bar, quieter controls

*Handover document for the executing agent. Written 23 September 2026 from a gut-check review of the text column with Owen; reference picture is the [Windfall Figma file](https://www.figma.com/design/U0SX1DLul7zwXW59uuF0xl/Windfall?node-id=49-746), node `49:746`. Sits under [Windfall_Map_Spec_4c.md](Windfall_Map_Spec_4c.md). 4d changes only the **text column** — headline, bar, farm list, settlement/method disclosure, footer freshness. The map cell, flow, markers, inset, mix panels and data payload are untouched. Where this document and 4c disagree, this one wins.*

*Values marked **≈** were measured off a 2× screenshot because the Figma MCP was rate-limited when this was written. Read the exact fills and sizes off `49:746` (`get_design_context` on the official Figma connector, fileKey `U0SX1DLul7zwXW59uuF0xl`) before building, and log any that differ in DECISIONS.md.*

*Log every decision in DECISIONS.md as it is made. Land each stage separately; stop and show at each gate.*

*Built 23 September 2026 — see DECISIONS 035. Measured against Owen's screenshot while building: the large figures are Eczar SemiBold 600 (−0.01em), not Bold; row, control, toggle and footer text is 12px (`--type-row`); the bar figures are 24px (`--type-subhead`); `--signal-ok` is #3F8F4F. Where this spec's ≈ values differ, DECISIONS 035 wins.*

---

## 1. Overview

The page's story is that Scotland makes wind power the network can't carry south. 4c framed the headline positively ("83% … on the grid"); review found that framing hid the story — the held-back share was an unlabelled stub. 4d leads with what's held back, labels both halves of the bar in words, and strips the grey toggle boxes so the column reads as one clean measure.

## 2. Decisions already made (build to these — do not relitigate)

1. **Held-back frame.** Headline: *"At least **{held}%** of Scotland’s tracked wind is currently being held back from the grid."* `held = curtailedMW / declaredMW`. **Floor** the figure (`formatPctFloor`): "at least" + floor can never overstate. This reverses 4c decisions 1–2.
2. **The bar is labelled above, not inside.** Left: **`{onGrid} MW`** on the grid. Right, right-aligned to the bar's end: Held back **`{held} MW`**. Both labels are real text; the bar graphic is `aria-hidden`.
3. **The bar is no longer a disclosure.** No chevron, no `<details>`. The farm list is always shown. Reverses 4c decision 6 (bar half).
4. **Farm list: 7 farms + the "more" control in the 8th slot**, so the grid stays even. The control **loads farms in batches** rather than revealing all 69 at once (§7). It has a hollow dot and is underlined. The list fills **row-first** (left to right, then down), not column-first. That way a batch only ever adds rows at the bottom and never moves farms that are already on screen.
5. **Method disclosure keeps its `<details>`**, but the toggle is text: `▼ Hide method` / `▶ Show method`, right-aligned on the heading row, underlined, no box.
6. **The heading row leads with the time**: **`15:00 to 15:30`** then `Settlement period 31`.
7. **Underline = interactive** for the two text controls. Farm rows stay un-underlined (they are a list of buttons, signalled by hover/selected state — §6).
8. **Freshness moves to the footer**: `Carbon Intensity • Elexon Insights  ● Updated 6 minutes ago`.
9. **Method copy is final** as in §8.
10. **Farm rows are 24px tall at every breakpoint** (Owen, in the frame). That also clears WCAG 2.2 AA target size, so no coarse-pointer override is needed.
11. **Method starts closed** at every breakpoint.
12. **The freshness dot is static green**, as drawn. Drop the 4c.1 pulse.
13. **Type scale for the heading row:** large headings 24px, secondary headings 16px. The time ("15:00", "15:30") is 24px bold. "to" is 16px **bold**. "Settlement period 31" is 16px regular.

## 3. Layout

The text column's grid placement, margins and breakpoints are unchanged from 4b/4c (`--col-text`, `grid.css`). Vertical rhythm, top to bottom (desktop L, CSS px):

| From → to | Gap | Token |
|---|---|---|
| Headline → bar labels | 32px | `--gap-group` (existing) |
| Bar labels → bar | ≈8px | `--gap-xs` |
| Bar → first farm row | ≈10.5px | existing `.map-sources__body` margin (0.65rem) |
| Farm rows | 24px pitch | `.source-row` min-height 1.5rem (was 1.25rem) |
| Last farm row → settlement heading | ≈40px | `--gap-group` + existing −0.5rem pull; confirm in Figma |
| Heading → first paragraph | 12px | existing `.map-settlement__body` margin (0.75rem) |
| Paragraph → paragraph | 1em | existing |

The bar spans the **full text-column width** (no toggle beside it). Farm list: two columns ≥ 46.5rem, one below. **Row-first fill**: replace the CSS `column-count` list with `display: grid; grid-template-columns: repeat(var(--sources-cols), minmax(0, 1fr)); column-gap: 1rem`. A column-first list reflows when a batch lands, e.g. Moray East would jump from the top of column 2 to row 5 of column 1. Row-first means the ranking reads across then down, and new farms only ever appear below the ones already there.

## 4. Design tokens

### Changed / new

| Token | Value | Usage | Note |
|---|---|---|---|
| `--bar-off` | ≈`#94A3E1` (was `#4865CB`) | Held-back segment of the main bar and every farm mini-bar | Pale periwinkle. Sample from Figma. It carries no text now, so its own contrast on cream (≈2:1) is fine; against `--bar-on` it's ≈4:1. |
| `--held-text` *(new)* | `#405EC9` (= current `--link`) | Headline figure, "Held back" label and its figure | One token for all held-back text. `#405EC9` is 4.56:1 on cream — clears AA for the 16px regular "Held back", which the frame's `#4865CB` (4.18:1) doesn't. Retire `--link` into this. |
| `--type-subhead` *(new)* | 1.5rem (24px) | The two times in the heading row | Owen: "larger headings are 24". Mobile scale not designed yet (§10). |

### Knock-ons of changing `--bar-off`

- **The freshness dot pulse** (`@keyframes signal-pulse`, navy ↔ `--bar-off`) is **removed**. The dot is static green (decision 12). Point `--signal-ok` at the frame's green (sample from Figma) and re-check it against 3:1 on cream.
- `--bar-label` (white) has no user on /map once labels leave the bar. Leave the token; delete if unused elsewhere.
- `--ink-box` has no user on /map once the chevron squares go.

### Reused, unchanged

| Token | Value | Usage |
|---|---|---|
| `--text-primary` | `#152767` | Headline text, on-grid label + figure, farm MW figures |
| `--bar-on` | `#2E469A` | On-grid segment, mini-bar fill, farm dots |
| `--text-secondary` | `#4A4D41` | Farm names, time heading, "Settlement period", both text controls |
| `--text-muted` | `#65624F` | Windspeed, method paragraphs, footer |
| `--font-display` | Eczar | Headline, bar labels, farm names, heading row |
| `--font-body` | Mukta | Windspeed, MW, controls, paragraphs, footer |
| `--type-display` | 40px desktop L (tiered) | Headline |
| `--type-heading` | 20px | Bar figures (bold) |
| `--type-region` | 16px | "on the grid" / "Held back" (regular), "Settlement period 31" (regular), "to" (bold) |
| `--type-small` | 12px | Farm rows, both text controls (≈), footer |
| `--dur-quick` / `--dur-base` | 180ms / 420ms | See §7 |

## 5. Components

| Component | Structure | Notes |
|---|---|---|
| **Headline** | `<p class="map-headline__sentence">` — "At least " + `<b class="map-headline__figure">{n}%</b>` + " of Scotland’s tracked wind is currently being held back from the grid." | Figure: `--wt-bold`, `--held-text`. Rest regular, `--text-primary`. Recommend making this the page `<h1>` and demoting the logo `<h1>` to a plain `<a>`/`<div>` (flagged in the first review). |
| **Bar labels** | Flex row, `justify-content: space-between`, `align-items: baseline`, `flex-wrap: wrap`, `column-gap: --gap-md` | Left: `<span>` figure (`--type-heading`, bold) + " on the grid" (`--type-region`, regular), all `--text-primary`. Right: "Held back " (`--type-region`) + figure (`--type-heading`, bold), all `--held-text`, `margin-left: auto`. |
| **Bar** | `<div class="share" aria-hidden="true">` with `.share__fill` | 32px tall, square ends, background `--bar-off`, fill `--bar-on` at `width: {onGrid/declared}%`. No label inside, no summary, no chevron. |
| **Farm row** | Existing `button.source-row[aria-pressed]` | Unchanged except MW figure colour → `--text-primary` (the frame draws it navy; it's `--text-muted` today). |
| **More control** | Existing `button.map-sources__more` | Text per §7 (batch labels). `--text-secondary`, `--type-small`, underlined (§6). Hollow 1px `--bar-off` dot, as built. Always the last cell of the list grid (see §7 on DOM). |
| **Method disclosure** | Existing `<details class="map-settlement">`; `<summary>` holds the heading and the toggle text | Heading: `<span class="time">15:00 <span class="to">to</span> 15:30</span>`. Times are `--type-subhead`, bold. "to" is `--type-region`, bold. "Settlement period 31" is `--type-region`, regular. All `--text-secondary`. Toggle: `<span class="map-settlement__toggle">` right-aligned (`margin-left: auto`), leading triangle + "Hide method"/"Show method". Remove the boxed `.map-settlement__chevron`. |
| **Footer freshness** | Sources line + dot + "Updated {n} minutes ago" | Moves from the settlement row. Keep the existing ageing/stale/failed states and colours; see §10, item 1 for the dot colour. |

## 6. States and interactions

| Element | State | Behaviour |
|---|---|---|
| Text controls ("Show N more farms", "Hide method") | Default | `text-decoration: underline`, `text-decoration-thickness: 1px`, `text-underline-offset: 0.2em`, colour `currentColor` |
| | Hover | Text + underline → `--text-primary`; `cursor: pointer`. Keep the existing faint tint on the more-control. |
| | Focus-visible | 2px solid `--text-primary` outline, 2px offset (existing convention) |
| | Pressed/open | "Hide method ▼" ↔ "Show method ▶". More control: see §7 |
| Method summary | Default | Closed on first load, every breakpoint |
| Method summary | Click target | The **whole summary row** toggles (native `<summary>`), not just the text. Hover underlines the toggle text only. |
| Farm row | Hover | Existing tint (`--ink-box` at 45%) |
| | Selected (`aria-pressed=true`) | Existing: `--ink-raised` background, dot → `--highlight`, map highlights the farm and dims the rest |
| | Clearing | Existing: click row again, click outside the list, Escape, or collapse the list while the selected farm is beyond row 7 |
| | Focus-visible | Existing 2px `--text-primary` outline |

## 7. Behaviour

**Headline figure.**
- `held = floor(curtailedMW / declaredMW × 100)`, from the same `readOnGrid` payload as the bar and rows.
- If `held ≥ 1` → *"At least **{held}%** of Scotland’s tracked wind is currently being held back from the grid."*
- If `curtailedMW = 0` → *"**100%** of Scotland’s tracked wind is currently on the grid."* (Owen). Figure in `--text-primary`, not `--held-text`, because nothing is held back.
- If `0 < curtailedMW` and the floor is 0 (under 1%) → never print "at least 0%". *Proposed:* switch the figure to megawatts: *"At least **{curtailedMW} MW** of Scotland’s tracked wind is currently being held back from the grid."* §10, item 1.

**Bar labels at small shares.** The right label is always right-aligned to the bar's end, so on a thin segment it sits mostly over the navy run. Colour carries the link (`--held-text` ↔ `--bar-off`). Give the held-back fill a **minimum rendered width of 4px** whenever `curtailedMW > 0`, so a real value never vanishes. When `curtailedMW = 0`, the right label reads "Nothing held back" in `--text-muted` (proposed, §10, item 1).

**Bar labels on narrow screens.** At a 345px column the two labels (≈175px + ≈165px + gap) don't fit on one line. Below 46.5rem, step the figures down to `--type-region` and the words to `--type-small`. If they still collide, `flex-wrap` drops "Held back …" onto its own line, still right-aligned. Test at 320px.

**Farm list: batched loading.**
- Initial: 7 farms plus the control in the 8th cell (desktop/tablet). On mobile: 3 farms plus the control.
- Each click adds **8 farms** at every breakpoint. On two columns that's 4 new rows, so the control always lands back in the right-hand cell of the last row and the grid stays even. On one column, 8 is enough to make progress without a 23-click walk through 69 farms.
- Control labels:
  - More than 8 remain: `Show 8 more farms`
  - 1–8 remain: `Show last {n} farms` / `Show last farm`
  - All shown: `Show fewer farms`. This collapses back to the initial count and scrolls the control into view (`block: 'nearest'`).
- Implement the control as the last `<li>` of the same `<ul>`, not a sibling after it, or it won't take the grid's last cell.
- After each batch loads, move focus to the first new row, so a keyboard user continues from where the list grew.
- New rows: no animation. The page just grows, and because the fill is row-first nothing above moves.
- If a selected farm is folded away by "Show fewer farms", clear the selection (existing rule).
- If there are 8 or fewer farms in total (4 or fewer on mobile), show all of them and no control.
- Replace `SHOWN = 8` in `views/sources.ts` with `INITIAL` (7, or 3 below 46.5rem, read from the same `matchMedia` tier main.ts already uses) and `BATCH = 8`.

**Method disclosure.** Native `<details>`, closed on first load.

## 8. Copy

Headline and labels as §5/§7. Method body, four paragraphs, in this order (replaces `MECHANISM` and siblings in `views/settlement.ts`). Curly apostrophes throughout.

> Britain’s grid runs in half-hour blocks called settlement periods. Every figure on this page is for the half hour shown above.
>
> Scotland’s wind farms tell the grid how much power they could make. The cables south to England can only carry so much, so when there’s more wind than they can take, farms are paid to switch off. Whatever isn’t switched off goes onto the grid.
>
> We only count the switch-offs ordered by the grid operator. Farms also get held back in ways our data can’t see, so the real share is probably higher.
>
> We’re tracking {units} transmission-connected wind units across {farms} Scottish farms, with {capacity} MW of registered capacity between them. All {declaring} had reported their figures when this data was taken.

Paragraph 3 opens with "We only count…" (confirmed voice: first person plural, matching "our data" and "We’re tracking"). The last paragraph's numbers are live. If not all farms declared: "{declaring} of {farms} had reported their figures when this data was taken." Update `SR_LABEL` to "How these figures are worked out, and why Scotland’s wind gets held back."

## 9. Responsive behaviour

| Tier | Changes in the text column |
|---|---|
| Desktop L (≥ 90rem) | As the frame. Headline 40px. |
| Desktop (80–90rem) | Same structure; headline per existing tier token. |
| Tablet (37.5–80rem; 46.5rem before DECISIONS 035's follow-up) | Same structure, two-column farm list; headline 32px; margin 36px at 600px easing to 64px at 744px. |
| Mobile (< 37.5rem) | One-column farm list, 3 farms to start, batches of 8 (§7). Bar labels step down or wrap (§7). Heading-row and headline sizes on mobile are not designed yet (§10). |

## 10. Open items

Resolved with Owen on 23 September 2026: freshness dot (green), mobile count (3), headline copy, method default (closed), copy voice ("We only count"), heading-row type. They're folded into §2 and §7. Still open:

1. ~~Under 1% and zero-share labels.~~ Signed off by Owen, 23 September 2026.
2. **Mobile type scale.** The headline is now three lines at desktop L, and the heading row mixes 24px and 16px. Neither has been designed below 46.5rem. Until it is, use the existing tier tokens for the headline, and step `--type-subhead` down to `--type-heading` (20px) on mobile as a placeholder.
3. **Row-first ranking.** Row-first reads 1, 2 across then 3, 4, so the second-largest farm sits top right instead of second in the left column. It's the price of batches not reflowing. Check it reads acceptably in the build.

## 11. Accessibility

- **Focus order** (DOM = visual): farm rows 1–7 (column 1 top to bottom, then column 2) → more control → method summary → footer link. Headline and bar have no stops.
- **Bar**: graphic `aria-hidden`. The visible labels are the accessible reading; drop the `.map-sources__sr` sentence (it existed because the labels were inside an `aria-hidden` bar).
- **Focus after batches**: focus the first newly loaded row (§7).
- **Farm rows**: keep the existing `aria-label` ("Seagreen: 887 MW on the grid of 1,075 MW, 34 km/h") and `aria-pressed`.
- **More control**: `aria-controls` pointing at the `<ul>`. Drop `aria-expanded`, because it's no longer a binary toggle. After each batch, announce "{n} more farms shown" through a polite `aria-live` region.
- **Method**: native `<details>`/`<summary>` gives the expanded state for free. Keep the toggle text in the summary so its name includes "Show method"/"Hide method".
- **Target size**: rows and the more control are 24px tall (decision 10), which meets WCAG 2.2 AA 2.5.8.
- **Contrast**: `--held-text` 4.56:1 (AA for the 16px label). `--text-secondary` and `--text-muted` already clear AA on cream (DECISIONS 027). Re-run the `?plate=tokens` check after changing `--bar-off`.
- **Controls aren't signalled by colour alone**: underlines on the text controls; the pressed state has a background, not just a dot colour.
- **No live region** on the headline. It refreshes every half hour, and announcing every refresh would be noise.

## 12. Motion

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Headline figure, bar label figures | New reading | Crossfade (existing `.is-swapping`) | `--dur-quick` 180ms | `--ease-in-out` |
| Bar fill, mini-bar fills | New reading | Width | `--dur-base` 420ms | `--ease-out` |
| Method triangle | Toggle | Rotate −90° ↔ 0° | `--dur-quick` | `--ease-in-out` |
| Farm list batch / collapse | Click | None (instant). Row-first fill means nothing already on screen moves | — | — |

Reduced motion: existing `tokens.css` override collapses all durations. Add the new label figures to the crossfade selector list in `map.css`.

## 13. Edge cases

- **Pending** (no reading yet): headline "Reading…" in `--text-muted` (existing). Bar is an empty gauge (`--ink-raised`, 1px `--ink-line` inset). Both labels and the farm list are hidden. The method disclosure stays available.
- **Failed / stale**: existing notices and dot states, now in the footer.
- **Silent farm** (no declaration): dashed hollow dot, "—", grey rail (existing). Check it reads differently enough from the more-control's solid hollow dot. They sit in the same list now.
- **0 MW declared**: "0 MW", grey rail (existing).
- **Long farm names**: ellipsis (existing). Windspeed missing: clause omitted (existing).
- **All farms fit** (≤ 8 desktop, ≤ 4 mobile): no control.
- **Numbers**: en-GB thousands separators, whole MW. The headline %, bar figures and rows all come from one `readOnGrid` call so they can't disagree.

## 14. Acceptance criteria

- [ ] Headline reads "At least {floor}% … currently being held back from the grid." (and the 100% / under-1% variants), from the same payload as the bar.
- [ ] Bar is full-width, 32px, labelled above, no chevron, `aria-hidden`. Labels fit or wrap cleanly at 320px.
- [ ] Held-back segment and mini-bar tails use the new pale `--bar-off`, in **both** list columns.
- [ ] List shows 7 + control (3 + control on mobile), row-first. Each click adds 8 and nothing already shown moves. Labels, focus and scroll behave as §7.
- [ ] Method starts closed. Toggle is underlined text with a leading triangle, whole row clickable, no box.
- [ ] Time leads the heading row.
- [ ] Freshness is in the footer, static green, no pulse.
- [ ] Method copy is exactly §8, curly apostrophes, live numbers.
- [ ] Zero / near-zero / pending states render as §7 and §13.
- [ ] Rows 24px tall. `?plate=tokens` contrast re-run and logged (new `--bar-off`, `--held-text`, green `--signal-ok`).
- [ ] §2 decisions 10–13 and the §10 outcomes logged in DECISIONS.md.

## 15. Out of scope

Map cell, flow engine, markers, Shetland inset, Scotland/England mix panels, border line, data payload and API routes, masthead: all unchanged from 4c.
