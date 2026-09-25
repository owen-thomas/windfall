# Windfall Map Page — Step 4b: Responsive layout + palette

*Handover document for the executing agent (Sonnet 5). Written 20 September 2026 from a review of the [Windfall Figma file](https://www.figma.com/design/U0SX1DLul7zwXW59uuF0xl/Windfall?node-id=1-2) with Owen. Sits under [Windfall_Map_Spec.md](Windfall_Map_Spec.md) — that document's step 4 built the simplified information layer and the first foundations pass; this document is **step 4b**, which puts the page on a 12-column responsive grid, flips its composition across breakpoints, and applies Owen's updated colour palette. Where this document and the parent spec disagree, this one wins for the map page's layout and palette. Everything the parent spec defers (border spike, flow retune, step 6/7) stays deferred.*

---

## 1. What this builds

The map page today ([`src/map/map.css`](src/map/map.css), [`src/map/main.ts`](src/map/main.ts)) is a **full-bleed map with the headline floated over the top-left corner**: `.composition` is a full-viewport box, `.map__stage` is `inset: 0`, and every panel is an absolutely-positioned overlay on top of the map.

Step 4b replaces that with a **contained, responsive grid**. Two structural layouts, flipping at 1280px:

- **≥1280px — two columns:** a clean text column on the left (no map behind it), the map contained in a right-hand column.
- **≤1279px — single column stacked:** the text block full-width on top, the map full-width below.

In both layouts the three geography-anchored overlays (Scotland mix, England mix, border label) stay overlaid on the **map area**, positioned by the shared projection exactly as they are today.

This is a **CSS composition + projection-sizing + palette** job. The view modules ([`src/map/views/headline.ts`](src/map/views/headline.ts), [`src/map/views/band.ts`](src/map/views/band.ts), [`src/map/views/masthead.ts`](src/map/views/masthead.ts)) already render the right content and are **not** rewritten. The flow engine, geometry, data, farm sources and markers are untouched (§7).

---

## 2. Foundations: what exists, what to add

**No Figma token library is needed, and none exists.** `get_variable_defs` on the design returns empty — the Figma uses raw fills, and that is fine. The foundation layer lives in code: [`src/styles/tokens.css`](src/styles/tokens.css) (shared) and [`src/styles/tokens-light.css`](src/styles/tokens-light.css) (map-only). **That CSS is the source of truth; Figma is the reference picture.**

The foundation is missing exactly two things for this task, both added here:

1. The **updated palette** (§3).
2. A **12-column grid + breakpoint system** (§5). Today there is no grid and only a single `@media (max-width: 48rem)` mobile query.

---

## 3. Palette (updated)

The blue family moved from a bright azure to a **navy → indigo ramp**, and the display ink is now blue-tinted rather than near-black. Values below were **sampled from the flattened Figma frames** — verify against Figma and adjust by a point or two if needed; keep them as CSS tokens, not inline values.

| Token | Old (`tokens-light.css`) | New | Used for |
|---|---|---|---|
| `--text-primary` | `#1c1f16` | **`#152767`** | masthead wordmark, headline, region names — display ink |
| `--fuel-wind` | `#0f5fd6` | **`#2141BF`** | wind segment, farm markers; matches the flow stroke hue |
| `--curtailed-edge` | `#0f5fd6` | **`#2141BF`** | curtailed edge, headline figure |
| *(new)* `--link` / accent | — | **`#4865CB`** | MW figures in the farm list, inline links |
| breakdown bar fill | thin hatched track | **`#2E469A`** on **`#E9ECF8`** track | the headline breakdown bar (§4, §6.5) |
| `--ink-ground` / cream | `#e9e5dc` | `#E9E5DC` (unchanged) | page ground |

Body and secondary text stay warm grey (`--text-secondary`, `--text-muted`). After changing these, **re-run the WCAG AA contrast check from DECISIONS 027**: navy `#152767` on cream, white text on the `#2E469A` bar, `#2141BF` wind against cream and against its on-segment label. Confirm the whole set on the `?plate=tokens` swatch plate ([`src/map/swatchPlate.ts`](src/map/swatchPlate.ts)) before moving on.

---

## 4. Layout anatomy

### 4.1 Two-column (≥1280px)

```
┌────────────────────────────────────────────────────────────────┐  64px margin
│ Windfall ≈ Scotland wind energy tracker                         │  masthead, full width
│                                                                  │
│  At least 2,134 MW of               ·····∙∙∙                    │
│  Scotland's tracked wind is      ·····∙∙∙∙∙∙       Scotland 0 g │  Scotland mix
│  currently being held off       ∙∙∙ (island +     ▓▓▓▓▓░░       │  (overlay, top-right)
│  the grid.                      ∙∙∙  flow, fit     Wind 67% …    │
│                                 ∙∙∙  to cell,                   │
│  Settlement period 31   Read…   ∙∙∙  24px pad)                  │
│  ▓▓▓ 13% of 13,105 MW    England ░░▒▒                           │  England mix
│  Seagreen 887 MW · Moray…       ▓░░▒▒  (overlay, over Irish Sea)│
│  ▸ How this number is worked out                               │
│                                                                  │
│  Built by Owen Thomas                                           │  colophon, bottom-left
└────────────────────────────────────────────────────────────────┘
   cols 1 ── 5     6 (gap)     7 ─────────────── 12
```

- **Masthead:** full-width, top.
- **Left text column — cols 1–5:** headline sentence (Eczar, the largest and heaviest type on the page — the deliberate focal point, §6.5) → settlement period + "Read N ago" row → the indigo **breakdown bar** → farm list → "How this number is worked out" toggle. No map behind it.
- **Column 6:** empty gap.
- **Map — cols 7–12:** the island + flow, fit to the cell with 24px padding (§5.3).
- **Overlays on the map:** Scotland mix top-right over Scotland; England mix over the Irish Sea; border label on the line. All projection-anchored (unchanged mechanism).
- **Colophon:** bottom-left.
- **1440+ vs 1280–1439** are the *same* layout scaling fluidly: type steps down a notch, mix legend and gutters tighten. Not a distinct composition.

### 4.2 Single-column stacked (≤1279px — tablet and mobile)

```
┌──────────────────────────────┐  24px margin
│ Windfall ≈ Scotland wind…     │  masthead
│                               │
│ At least 2,134 MW of          │  headline, full width
│ Scotland's tracked wind…      │
│ Settlement period 31   Read…  │
│ ▓▓▓ 13% of 13,105 MW          │  breakdown bar, full width
│ Seagreen 887 MW · Moray…      │  farm list
│ ▸ How this number worked out  │
│                               │
│        ∙∙∙∙       Scotland 0g │  map full-width below,
│      ∙∙∙∙∙∙∙      Wind 67% …  │  mixes STILL overlaid,
│  England ∙∙∙∙                 │  anchored to countries
│  ▓░░▒▒  ∙∙∙∙∙∙                │
│         ∙∙∙∙∙∙∙∙              │
│ Built by Owen Thomas          │
└──────────────────────────────┘
```

- The whole text block (headline, bar, farm list, toggle) becomes a **full-width band on top**.
- The map drops **full-width below** it.
- **The mixes stay overlaid on the map** (Owen confirmed — do *not* revert to the current mobile behaviour of stacking Scotland/headline/border/England below the map). Scotland top-right; on mobile it becomes right-aligned to fit. England over the Irish Sea.
- **Tablet (744–1279) vs mobile (≤743)** are near-identical; the only differences are:
  - type sizes step down at mobile;
  - the mix **panel width** on the grid: each mix panel's legend stays a single-column stack of items, but the panel itself spans **3 of the 12 columns on tablet → 4 of 12 on mobile** (wider share of the grid on the narrower screen, so the overlaid panel stays legible over the map);
  - the farm list wraps to two lines at mobile.

---

## 5. Grid, breakpoints and map sizing

### 5.1 Breakpoints

| Tier | Range | Layout | Page margin |
|---|---|---|---|
| Desktop L | ≥1440px | two-column | 64px |
| Desktop M | 1280–1439px | two-column | 64px |
| Tablet | 744–1279px | stacked | 24px |
| Mobile | ≤743px | stacked | 24px |

**The layout flip is at 1280px.** Define these as custom-media / tokens once so both `map.css` and any grid helper read from them, rather than scattering pixel queries.

### 5.2 Grid

12 columns across all tiers, with gutters between columns. The current `--page-x` is `clamp(1.25rem, 4vw, 4rem)` — it already maxes at 64px, but set the map page's margin explicitly per §5.1 (64px desktop, 24px tablet/mobile) rather than relying on the clamp.

- **Two-column:** text = **cols 1–5**, gap = col 6, map = **cols 7–12**. (On a 1440 frame with 64px margins and 24px gutters this puts the text block ending ~596px and the map spanning to the right margin — matches the frame. Verify against Figma before committing the exact split.)
- **Stacked:** every block spans the full 12 columns.

Elements expand/contract to hold their grid ratios within a tier (Owen's brief) — i.e. widths are column-based, not fixed px.

### 5.3 Map sizing

The map "expands to fit vertical/horizontal space, whichever is more limited, with **24px padding** around the edge." This is nearly free: [`buildProjection`](src/flow/projection.ts) already fits with `scale = min(availW/spanX, availH/spanY)`. The work is:

1. Size `.map__stage` to the **grid cell** (cols 7–12 on desktop; full width on stacked), not `inset: 0` of the whole viewport. Drop the full-bleed model.
2. Apply **24px** padding inside the map cell. `buildProjection`'s `padding` option is currently a *fraction* of the shorter side; either pass `24 / min(cellW, cellH)` or add an absolute `paddingPx` option to `ProjectionOptions`. Prefer the explicit `paddingPx` option so the 24px is exact at every size.
3. `positionOverlays()` already measures the stage against `.composition` via `getBoundingClientRect`, so the Scotland/England/border overlays keep tracking correctly once the stage is a real grid cell. No change to the projection-anchoring math.

---

## 6. Build order and gates

Each step lands separately; stop and show at each gate; log decisions in DECISIONS.md as they're made.

**Step 4b.1 — Palette + type foundation.**
Apply §3 to `tokens-light.css`. Re-run the DECISIONS 027 AA contrast check. Confirm on `?plate=tokens`.
*Gate:* the swatch plate matches the Figma palette; every text/swatch pair clears AA (or the disclosed exceptions are re-confirmed).

**Step 4b.2 — Grid + breakpoint tokens.**
Add the four-tier breakpoint system (§5.1) and the 12-column grid primitives (§5.2), including the 64/24px page margins. No visual change yet beyond margins.
*Gate:* tokens exist and are referenced from one place; margins are correct at each tier.

**Step 4b.3 — Two-column desktop (≥1280).**
Rewrite `.composition` as a CSS grid. Move `.panel--headline` out of absolute overlay into the real left column (cols 1–5). Constrain `.map__stage` to cols 7–12 and size the projection to that cell with 24px padding (§5.3). Keep Scotland/England/border as projection-anchored overlays on the map cell.
*Gate:* screenshot review against the 1440 and 1280 frames; coast-to-mask alignment still holds at 1x and 2x DPR; overlays sit where the frames put them.

**Step 4b.4 — Stacked layout (≤1279).**
Below 1280, switch the grid to single column: text band full-width on top, map cell full-width below. **Keep the mixes overlaid on the map** (§4.2). Handle the tablet/mobile specifics: type steps, mix-panel grid width (3 cols tablet → 4 cols mobile; legend stays a single-column stack of items), farm-list wrap, Scotland panel right-aligned on mobile. Remove/replace the current `@media (max-width: 48rem)` stack-below rules.
*Gate:* screenshots against the 744 and mobile frames; overlays legible on a real phone width; border tooltip still reachable by tap.

**Step 4b.5 — Reconcile details.**
The breakdown bar restyle (§6.5); inset placement across the new layouts; the 24px map padding tuned live; the mix legend grid at each column count.
*Gate:* a read-through of a few fixture states at each breakpoint — truth and legibility, not just tone.

### 6.5 The breakdown bar

The `13% of 13,105 MW` bar is a **solid indigo bar** (`#2E469A` fill on `#E9ECF8` track) with its label inline, giving the headline block more graphic weight — Owen's intent is that the headline + bar are the page's focal point, heavier than the mixes. This is a deliberate change from today's thin hatched share track (`.map-headline .share` in `map.css`). In scope for 4b.

---

## 7. Out of scope (unchanged from the parent spec)

The flow engine and its tuning; the drawn-island retune (§5.3 of the parent — waits for step 6); geometry, islands, the Shetland inset logic; farm sources, markers and the data payload; the border **figure** and its spike; the seven-state fixtures and honesty rules; `/` and `/flow` (light tokens stay scoped to `/map`). Step 4b touches composition, breakpoints, projection *sizing* (not tuning), and palette values only.

---

## 8. Acceptance criteria

1. Two-column at ≥1280, single-column stacked at ≤1279, flipping cleanly at 1280px.
2. Desktop margins 64px; tablet and mobile margins 24px; 12-column grid; elements hold grid ratios within a tier.
3. The map fits its cell by the more-limited dimension with exactly 24px padding, at every tier and at 1x/2x DPR, with no coast-to-mask drift.
4. Scotland, England and border overlays stay projection-anchored on the map area in **both** layouts, including on mobile (overlaid, not stacked below).
5. Each mix panel spans 3 of 12 grid columns on tablet and 4 of 12 on mobile; the legend inside stays a single-column stack of items.
6. The updated palette is applied via tokens and clears AA (or re-confirmed exceptions).
7. The breakdown bar reads as the solid, weighted focal element beside the headline.
8. All existing honesty rules and the seven fixture states still hold on `/map`.
9. DECISIONS.md updated for the palette change, the composition reversal (full-bleed → grid), and the mobile-overlay decision.
