# Page override — Binder View

Extends [MASTER.md](../MASTER.md). Documents only what is specific to the binder viewer (the signature screen). Everything else inherits Master.

Reference prototype: [`../../design-poc/binder-view.html`](../../design-poc/binder-view.html) (authoritative where it agrees with this file; this file wins on conflicts).

---

## 1. Purpose & mental model

The user is **looking at a digital representation of their physical binder.** That metaphor is the core driver of every layout decision: where possible for the given viewport, show a real binder page or two-page spread, scaled to fit — not a generic card grid or a scroll feed.

---

## 2. Physical binder model (must retain)

- **Page 1 is alone** on the right, against an *inside front cover* on the left.
- Then pages pair into spreads: **2–3, 4–5, 6–7 …**
- If the last page has no partner, it sits **alone on the left**, against an *inside back cover* on the right.
- A **spine** with binding **rings** sits between the two open pages.

Spreads are derived, not stored: `[[1], [2,3], [4,5], …]`. Single-page mode steps one page at a time but the pairing still defines the rhythm and the position is preserved when switching modes.

---

## 3. Responsive layout — fit-to-viewport (replaces zoom)

Sizing is **measured, not device-assumed.** A `ResizeObserver` on the binder *stage* (the region between the top bar and bottom nav, which shares space with editor chrome) drives a decision ladder on every resize:

Given the binder geometry (3×3 = 9 slots, or 4×3 = 12 slots; card aspect 63:88) and a **card-readability floor** (`MIN_SPREAD_CARD ≈ 84px`):

1. **Spread** if a two-page spread (`2 × pageWidth + spine`) fits the stage width **and** height with cards ≥ floor, and stage width ≥ ~620px.
2. else **Single page**, contained to the stage (a single page always fits a phone, so it never overflows).
3. Card pixel size = the `min(width-fit, height-fit)` for the chosen mode, clamped `[58, 210]px`.

Constants (from prototype): `GAP 6 · PAD 10 · SPINE/GUTTER 28 · ASPECT 88/63 · MIN_SPREAD_CARD 84 · MIN_CARD 58 · MAX_CARD 210`.

**In-app zoom is removed.** Auto-fit makes a manual zoom redundant; for magnification users rely on native browser/OS zoom (which we never disable). The mode chip ("Spread" / "Single page") in the top bar reflects the current decision.

Practical result: desktop / tablet-landscape → spread; tablet-portrait → one large page; phones → single page, swipe to turn.

---

## 4. Navigation (page-turn, never infinite scroll)

- **Controls:** bottom nav with Prev / page indicator + progress / Next. `←`/`→` arrow keys. **Drag/swipe** with live finger-tracking (leaf follows pointer at ~0.5×, commits past ±60px, else snaps back). Drag threshold ~6px so card taps aren't consumed.
- **Direction:** forward animates in from the right, back from the left (`navigation-direction`).
- **Indicator text:** spread → "Pages 4–5 of 24"; single/lone → "Page 4 of 24". Progress bar = last visible page / total. Tabular numerals.
- **State preservation:** current page survives spread↔single switches and overview jumps.
- Prev disabled on first view; Next disabled on last.

---

## 5. Overview mode

The only surface where scrolling-many-pages is correct.

- Toggle in top bar (active state shown). Full-stage scrollable grid of page thumbnails (`auto-fill, minmax(120px,1fr)`).
- Thumbnail = mini page grid: filled cells colored by **card color identity**, missing = faded, empty = dashed. Label "Page n". Current page = accent ring.
- Tap a thumbnail → jump to that page's view and exit overview. Esc/close button exits.

---

## 6. Slot & card actions

- **Slot** per Master §9: art by color identity, 2-line name clamp, corner ownership indicator (owned check / skipped ✕ / missing none), set·rarity·№ footer (tabular). Missing → grayscale; skipped → desaturated warm tint. Empty slot → dashed border + slot number + "+" affordance, tap to insert.
- **Tap a card → bottom sheet** (Master §9 "Bottom sheet"). This **replaces** the old hover-only corner ⋮ menu (unreachable on touch, sub-44px). Sheet actions: Mark owned (primary) · Skip · Blanks-before stepper · Open on Scryfall · Remove (danger). Status changes re-render the slot immediately.
- Quick states still legible at a glance via the corner indicator + grayscale, so the sheet is for changes, not for reading status.

---

## 7. Skeuomorphic binder chrome

Uses the paper/ring tokens (Master §3.1): `--paper`, `--paper-edge`, `--ring`, `--ring-hi`.

- **Page:** `--paper` fill, `--line-strong` border, `--shadow-2`. Outer corners rounded 12px, spine-side corners 4px (`.left`/`.right`).
- **Spine:** ~28px, gradient of `--paper-edge`; vertical run of metallic **rings** (`radial-gradient(--ring-hi → --ring)` + inset shadow), count = rows + 1.
- **Covers:** inside front/back cover = subtle hatched placeholder filling the empty half of a lone-page spread, so a single page never balloons to full width and the binder reads correctly.

---

## 8. Performance

- Render only the current view (the one or two visible pages) — never mount all pages. Overview renders lightweight thumbnails on open.
- Reserve every slot with `aspect-ratio`; lazy-load card art (`loading="lazy"`); skeletons for >300ms.
- Page-turn animates `transform`/`opacity` only (no reflow/CLS). Honor `prefers-reduced-motion`.

---

## 9. Accessibility specifics

- Stage is keyboard-navigable: arrows turn pages; slots are real `<button>`s in reading order with descriptive `aria-label` ("Lightning Bolt, LEA 161, owned. Page 3, slot 2. Open actions.").
- Bottom nav buttons and overview toggle are labelled; page-turn announces the new "Page N of M".
- Sheet is `role="dialog" aria-modal`, focus-trapped, Esc/scrim/swipe-down to close, focus returns to the originating slot.
- All controls ≥44px; spine/rings are decorative (`aria-hidden`).

---

## 10. Open questions (resolve before/with implementation)

- **Edit vs view:** is the binder viewer a focused full-stage mode (esp. valuable on mobile, given the segment editor also needs space), or always embedded in PlanEditor? Recommendation: a dedicated, deep-linkable binder view route + an embedded compact version in the editor, both using the same `BinderSpread` component.
- **Box (StorageBox) representation:** boxes are unlimited/linear (no pages). Likely a virtualized vertical list of slots rather than the spread — confirm visual treatment so it still feels part of the same system.
