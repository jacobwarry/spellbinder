# Spellbinder — Design System (MASTER)

Source of truth for all Spellbinder UI. Version 1.0 (pre-migration).
Direction: **Planar (refined)**. Stack target: Vue 3 + TypeScript + Tailwind + shadcn-vue.

---

## 1. Brand foundation

**Idea.** Spellbinder is the *cartographer of your collection*. Its one trick — "this card is in Binder A, page 3, slot 2" — is the hero. A premium collector's tool with a quiet fantasy soul: modern and trustworthy first, magical in the details.

**Personality.** Precise · premium · quietly magical · collector-grade · calm under data density.

**Principles (these break ties):**
1. **Placement is the hero.** The binder spread and slot grid get first-class polish.
2. **Fantasy is seasoning, not the meal.** Restraint over spectacle.
3. **The five colors are ours — as data.** W/U/B/R/G/C drive meaning (filters, identity, art), never decoration.
4. **Light and dark are equal.** Designed together, each contrast-verified independently.
5. **The viewport is the frame.** Always render the richest representation that *fits*; don't make the user pan/zoom to cope.

---

## 2. The spectrum rule (brand signature)

The five-color mana spectrum is a **data signature, not decoration**. Test: *if removing it loses no meaning, it doesn't belong.*

**Allowed:** the logo mark (identity anchor); one hero hairline; the "Collection by color identity" data bar; anywhere a true W/U/B/R/G breakdown is shown.
**Forbidden:** spectrum on buttons, ambient borders/glows, every stat card, or any spot where it doesn't map to the five colors.

`--accent-grad` (two-tone violet→cyan) is a *separate, calmer* tool for things like progress fills. It is not the spectrum.

```
--spectrum:    linear-gradient(100deg,#e9d49a 0%,#4aa3e8 27%,#6b5f7e 50%,#ef5a44 73%,#4fc172 100%);
--accent-grad: linear-gradient(135deg, var(--accent), var(--accent-2));
```

---

## 3. Color tokens

Three layers: **primitive** (raw) → **semantic** (themed, used in components) → **component** (only when a component needs its own). Components reference **semantic** tokens only — never raw hex.

Implemented as CSS custom properties. Dark mode via a `.dark` class on `<html>` (shadcn-vue convention).

### 3.1 Semantic tokens

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#08070e` | `#eceaf5` | App canvas |
| `--surface` | `#14121f` | `#ffffff` | Cards, panels, popovers, sheets |
| `--surface-2` | `#1c1930` | `#f3f1fb` | Insets, inputs, hover fills, secondary |
| `--surface-3` | `#252037` | `#e9e6f5` | Raised/hover-on-surface |
| `--ink` | `#f2f0fb` | `#131022` | Primary text |
| `--ink-soft` | `#a7a2c6` | `#565078` | Secondary text |
| `--ink-faint` | `#6f6a90` | `#8b86a8` | Tertiary/meta, disabled label |
| `--line` | `#241f3a` | `#e6e3f3` | Borders, dividers, inputs |
| `--line-strong` | `#352e54` | `#d4cfe8` | Emphasized borders, focus on surface-2 |
| `--accent` | `#9a7dff` | `#6f48ff` | Brand accent: primary buttons, links, active, focus ring |
| `--accent-foreground` | `#0d0a18` | `#ffffff` | **Text/icon on `--accent`** (see §11 contrast) |
| `--accent-2` | `#6fccff` | `#1f93e6` | Gradient pairing, decorative accent. **Not** body-text color (see §11) |
| `--accent-soft` | `rgba(154,125,255,.14)` | `rgba(111,72,255,.10)` | Accent tint backgrounds (active chip, hover) |
| `--accent-glow` | `rgba(154,125,255,.30)` | `rgba(111,72,255,.18)` | Soft glow shadows behind brand elements |
| `--owned` | `#4fdd8f` | `#11a45f` | Ownership: owned |
| `--owned-soft` | `rgba(79,221,143,.14)` | `rgba(17,164,95,.12)` | Owned badge bg |
| `--skipped` | `#ff7766` | `#e24a32` | Ownership: skipped **and** destructive actions |
| `--skipped-soft` | `rgba(255,119,102,.14)` | `rgba(226,74,50,.12)` | Skipped badge bg |
| `--missing` | `#6f6a90` | `#8b86a8` | Ownership: missing (neutral) |
| `--scrim` | `rgba(4,3,10,.62)` | `rgba(30,22,70,.42)` | Modal/sheet scrim (≥40% — §11) |

Binder-surface tokens (skeuomorphic paper/rings — see [pages/binder-view.md](pages/binder-view.md)):

| Token | Dark | Light |
|---|---|---|
| `--paper` | `#171426` | `#f7f5ff` |
| `--paper-edge` | `#0f0d1b` | `#dcd6ee` |
| `--ring` | `#5b5570` | `#b3acc9` |
| `--ring-hi` | `#8f88a8` | `#ffffff` |

### 3.2 Mana data tokens (the five colors)

Fills for data only (filters, card identity art, color-breakdown bar). Always paired with the color letter or a legend — never color-alone (§11).

| Token | Value | MTG |
|---|---|---|
| `--mana-w` | `#e9d49a` | White |
| `--mana-u` | `#4aa3e8` | Blue |
| `--mana-b` | `#534a66` | Black |
| `--mana-r` | `#ef5a44` | Red |
| `--mana-g` | `#4fc172` | Green |
| `--mana-c` | `#b7b1c8` | Colorless |

Card-art gradients (placeholder art / slot fills by color identity), e.g. red:
`radial-gradient(circle at 50% 30%, #ff6a52, #a32417)`. Full set lives in component CSS; keyed by `--mana-*` hues. On White, slot text uses dark ink (`#5a4a2c`), not white.

---

## 4. Typography

| Family | Role | Notes |
|---|---|---|
| **Sora** (700/800) | Display: wordmark, page/section headings, stat numerals, nav labels in binder | Geometric, techy. `font-display: swap`. |
| **Inter** (400/500/600/700) | UI + body: everything else | Workhorse. |

**Type scale (px):** 11 · 12 · 13 · 14 (base UI) · 16 (base body) · 18 · 20 · 24 · 30 · 36 · 46.
Body line-height **1.5**; display headings **1.05–1.15**; letter-spacing `-0.01em`/`-0.02em` on large display only.

**Weights:** headings 700–800 (Sora) · labels 600 · body 400 · secondary 500.

**Numbers:** `font-variant-numeric: tabular-nums` on all counts, set codes, collector numbers, page/slot numbers, progress, stats. Prevents layout shift.

**Body minimum 16px on mobile** (avoids iOS auto-zoom). UI chrome may use 13–14px.

---

## 5. Spacing, radius, sizing

**Spacing scale (4/8 rhythm):** `2 4 6 8 12 16 20 24 32 40 48 64`. Section rhythm tiers: 16 / 24 / 32 / 48.

**Radius:** `--r-sm 10` · `--r-md 14` · `--r-lg 20` · `--r-pill 100` · cards/slots `8–12`.

**Touch targets:** ≥ **44×44px** for every interactive element; ≥ **8px** between targets. Expand hit area with padding when the glyph is smaller. (This is why the binder card menu became a bottom sheet — see §9.)

**Container widths:** content max ~1200px; reading panels ~620px.

**Icon sizes (Lucide, stroke 1.8–2):** `sm 16` · `md 18` (default UI) · `lg 24`. One icon family, consistent stroke. **No emoji as icons** — replace the legacy `⚠️ ✓ ⊘` with SVG.

---

## 6. Elevation (shadow scale)

Use the scale; don't invent per-component shadows.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--shadow-1` | `0 2px 8px rgba(0,0,0,.4)` | `0 1px 3px rgba(30,20,80,.06), 0 6px 20px rgba(30,20,80,.08)` | Cards, inputs, resting surfaces |
| `--shadow-2` | `0 24px 60px rgba(0,0,0,.6)` | `0 18px 50px rgba(80,50,200,.18)` | Hover lift, binder pages, popovers, overview thumbs |
| sheet | `0 -10px 40px rgba(0,0,0,.4)` | (same family) | Bottom sheet (shadow points up) |

Brand glow (`--accent-glow`) is additive on the logo/primary CTA only, not a general elevation tool.

---

## 7. Motion

| Token | Value |
|---|---|
| `--ease` | `cubic-bezier(.22,.61,.36,1)` (standard ease-out) |
| micro | 120–160ms (press, hover, toggles) |
| transition | 200–280ms (sheet, overview, page-turn) |
| max | ≤ 400ms |

Rules: animate **transform/opacity only**; ease-out entering / ease-in exiting; exits ~60–70% of enter; ≤1–2 elements per view; every animation conveys cause→effect.

Named animations (canonical):
- **Page-turn:** directional slide+fade of the leaf, `inRight`/`inLeft` ~260ms. Forward = from right, back = from left.
- **Bottom sheet:** `translateY(110%) → 0`, ~280ms; scrim fades 200ms; live finger-tracking during swipe-to-dismiss.
- **Overview:** fade + 8px rise, ~240ms.
- **Press:** card scale `0.97`.

**Always honor `prefers-reduced-motion: reduce`** — disable slides/scale, keep instant state changes.

---

## 8. Layout system

**Breakpoints:** 375 / 640 / 768 / 1024 / 1440. Mobile-first.

**Responsive navigation:**
- App shell uses a **top bar** (brand + section nav + theme) on all sizes; on phones the section nav collapses to a bottom nav or overflow as needed (≤5 items; icon **+** label).
- The binder viewer has its **own** top bar + bottom nav (page-turn). See page override.

**Adaptive layout decisions are container-measured, not device-assumed** — use `ResizeObserver`/container queries where a region shares space with sidebars (the binder stage is the prime example).

**Z-index scale:** `base 0` · `sticky chrome 10` · `overview 20` · `scrim 30` · `sheet 31` · `toast 40` · `tooltip 50`.

No horizontal scroll on mobile. `min-h-dvh` over `100vh`. Respect safe-area insets on fixed top/bottom bars (`env(safe-area-inset-*)`). `viewport-fit=cover` + never disable user zoom.

---

## 9. Component specs

All components reference semantic tokens. States required for every interactive component: **rest / hover / active(pressed) / focus-visible / disabled**, distinct in both themes.

### Buttons
- **Primary** — `bg: var(--accent)`, `color: var(--accent-foreground)`, radius md, weight 700, glow `--accent-glow`. Hover `brightness(1.08)` + `translateY(-1px)`. One primary CTA per screen.
- **Ghost/secondary** — `bg: var(--surface-2)`, `color: var(--ink)`, `border: var(--line-strong)`. Hover border→accent.
- **Icon button** — 40×44px min, `border: var(--line)`, `color: var(--ink-soft)`, hover color→accent. Always `aria-label`.
- **Nav button (binder)** — 44px tall, used for prev/next/zoom-less controls.
- Disabled: opacity .4, `cursor:not-allowed`, semantic `disabled`.

### Inputs / search
- Search box: `surface-2` fill, leading search icon (`--ink-faint`), focus → border `--accent` + `0 0 0 4px var(--accent-glow)`. 44px+ tall. Visible label or aria-label (never placeholder-as-label).

### Segmented control / tabs
- Pill segmented control on `surface-2`; active segment = `surface` + `--shadow-1`. Used for Quick/Advanced search.

### Badges — ownership (canonical)
Always **icon/text + color**, never color alone.
- Owned: `--owned` on `--owned-soft`, check glyph.
- Skipped: `--skipped` on `--skipped-soft`, ✕ glyph.
- Missing: `--missing` on `--surface-2`, no glyph / "Missing" text.

### Mana chips (filters)
- 32–34px circles using `--mana-*`; selected = ring `0 0 0 2px var(--surface), 0 0 0 4px var(--accent)`. Letter label inside (W/U/B/R/G/C).

### Stat card
- `surface` + `--line` + `--shadow-1`; small monochrome Lucide icon + label (`--ink-faint`), Sora numeral. No spectrum bars.

### Color-identity bar (earned spectrum)
- Segmented horizontal bar of `--mana-*` widths = real proportions, + counted legend. The canonical spectrum moment.

### Card tile (search results)
- `surface` card; art top (aspect 63/88) = real Scryfall image (`loading="lazy"`), with the colour-identity gradient as the missing/loading fallback. Body: name (2-line clamp, always — the searchable label), set/№/rarity meta (tabular), ownership badge, optional binder location (`--accent` text — see §11). Hover: `translateY(-4px)` + `--shadow-2`. Not-owned → grayscale art.

### Slot (binder)
- aspect 63/88, art fill by color identity, name (2-line clamp), corner ownership indicator (16px dot), set/rarity/№ footer. Empty slot = dashed `--line-strong` + slot number + "+" on hover. Tap → action sheet. See page override.

### Bottom sheet (canonical card actions) — replaces the old corner context menu
- `surface`, top radius 18, grip handle, scrim `--scrim`. Header: thumb + name + meta + location + status pill. Actions as 48px rows: **Mark owned** (primary), Skip, Blanks-before stepper, Open on Scryfall, Remove (danger, visually separated). Dismiss: scrim tap, Esc, swipe-down (live-tracked). `role="dialog" aria-modal`.

### Overview thumbnail
- Mini page grid; filled cells = color-identity, missing = faded, empty = dashed. Label "Page n". Current page highlighted with accent ring. Tap → jump.

### Top bar / bottom nav
- Sticky, `backdrop-filter: blur(14px)` over translucent `--bg`, `--line` divider. Active nav item: accent underline/indicator (not spectrum) + weight. Both icon and label.

### Progress
- Track `surface-2`, fill `--accent-grad`, height ~5–8px, radius pill.

---

## 10. Interaction patterns

- **Tap, not hover, for primary actions.** Hover-only affordances are desktop enhancements; every action has a tap/visible path. (Root cause of the context-menu → sheet change.)
- **Card actions = bottom sheet** everywhere (touch and desktop) for consistency and reach.
- **Binder = page-turn**, never an infinite scroll of pages. Overview mode is the only many-pages-scroll surface. (Full model in page override.)
- **Destructive actions** (Remove, delete) use `--skipped` and sit visually separated from primary actions; confirm or offer undo for bulk/irreversible ones.
- **Drag threshold** ~6px before a swipe begins (so taps aren't eaten); swipe shows live transform feedback.
- **Loading**: skeletons/shimmer for >300ms; reserve space with `aspect-ratio` to avoid CLS; lazy-load card art.

---

## 11. Accessibility standards (CRITICAL — non-negotiable)

- **Contrast:** body/UI text ≥ **4.5:1**; large text (≥24px, or ≥18.66px bold) and UI glyphs ≥ **3:1**. Verify each theme independently.
- **Resolved contrast decisions (corrections over the POCs):**
  - **`--accent-foreground`**: white-on-accent in *dark* mode is ~3.1:1 (fails). Primary buttons therefore use `--accent-foreground` = **near-black `#0d0a18` in dark**, **white in light**. Do not hardcode white button text.
  - **Links / binder-location text** use **`--accent`** (≈5.2:1 light, ≈5.9:1 dark), **not `--accent-2`** (cyan fails 4.5:1 as text on light surface). `--accent-2` is for gradients/decoration only.
  - **Mana colors** are data fills paired with letters/legends; they are exempt from text-contrast but must never be the *sole* signal.
- **Focus:** visible focus ring (3px `--accent`, 2px offset) on all interactive elements; never remove it. Tab order matches visual order.
- **Color is never the only signal:** ownership = color **+** glyph/text; nav active = indicator **+** weight.
- **Touch targets** ≥44×44px, ≥8px apart.
- **Reduced motion** honored globally.
- **Screen readers:** every icon-only control has `aria-label`; slots announce "card, set №, status, page, slot"; sheet is a labelled `dialog`; page-turn announces "Page N of M"; sequential heading hierarchy.
- **Never disable zoom**; support OS text scaling without breakage.

---

## 12. Tailwind + shadcn-vue mapping

shadcn-vue components consume Tailwind classes (`bg-background`, `text-foreground`, `bg-primary`, `border-border`, …). Map shadcn's expected token names to our semantic tokens in `tailwind.config` + `tokens.css`.

> ⚠️ **Naming collision:** shadcn's `accent` token is a *subtle hover surface*, **not** our brand accent. Our brand accent maps to shadcn **`primary`**. Map shadcn `accent` to our `--surface-2/3`.

| shadcn token | Our token |
|---|---|
| `background` / `foreground` | `--bg` / `--ink` |
| `card`, `popover` (+ `-foreground`) | `--surface` / `--ink` |
| `primary` / `primary-foreground` | `--accent` / `--accent-foreground` |
| `secondary` / `secondary-foreground` | `--surface-2` / `--ink` |
| `muted` / `muted-foreground` | `--surface-2` / `--ink-soft` |
| `accent` / `accent-foreground` (shadcn hover surface) | `--surface-3` / `--ink` |
| `destructive` / `destructive-foreground` | `--skipped` / `#ffffff` |
| `border`, `input` | `--line` |
| `ring` | `--accent` |

Plus app-specific tokens not in shadcn's set, exposed to Tailwind directly: `owned`, `skipped`, `missing`, `ink-soft`, `ink-faint`, `surface-2/3`, `mana-{w,u,b,r,g,c}`, `paper*`, `ring*`.

**Token storage:** keep raw values (hex/rgba) in `:root` / `.dark` and reference via Tailwind `colors: { bg: 'var(--bg)', … }`. Theme swap = swapping the `.dark` class. Radius/shadow/ease likewise as CSS vars consumed by Tailwind theme extensions.

---

## 13. Migration order (foundation-first, each step shippable)

1. **Tokens + Tailwind.** Add Tailwind, `tokens.css` (this file's §3–§7 values), `.dark` toggle in `App.vue`, retire `src/style.css`. Wire the shadcn mapping. No view rewrites.
2. **Primitives.** Add shadcn-vue Button, Input, Tabs, Dialog, Sheet, DropdownMenu, Badge, Tooltip. Swap into the app header + `HomePage` search first.
3. **Signature components.** Build themed `CardTile`, `BinderSlot`, `BinderSpread`, `CardActionSheet`, `OverviewGrid` per §9 + page override.
4. **PlanEditor** last; port section by section behind the stable token/primitive layer.

---

## 14. Changelog

- **1.0** — Initial system. Direction = Planar (refined). Decisions captured:
  - Spectrum rationed to data (§2); brand accent solid (`--accent`), `--accent-grad` separate.
  - **In-app binder zoom removed** — auto fit-to-viewport replaces it; native zoom remains for magnification.
  - **Bottom sheet** is the canonical card-action pattern (replaces corner context menu).
  - **Contrast fixes** over the POCs: `--accent-foreground` token; links/location use `--accent` not `--accent-2` (§11).
