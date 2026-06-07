# Screen inventory & override triage

Extends [MASTER.md](MASTER.md). Decides **which screens get a `pages/*.md` override** and which inherit MASTER in full. Do this once; revisit only when a new screen or flow is added.

## Rule: override-only

Create a `pages/<screen>.md` **only** if the screen has at least one of:
- a distinct **responsive layout / IA** not covered by MASTER §8,
- a **dense form** needing progressive disclosure / validation specifics,
- a **multi-step or unique flow** (import, linking, wizard),
- meaningful **empty / first-run** states with their own copy and CTA.

Otherwise the screen inherits MASTER (its components already live in MASTER §9). Don't restate MASTER in a page file — document only the deltas.

## Inventory

| Route(s) | Component | First-run / empty state | Built mostly from | Override? | Why |
|---|---|---|---|---|---|
| `/` | `HomePage` | **Yes** — welcome + storage notice when no sets | search box, mana chips, segmented tabs, **advanced-search form**, card tile, pagination, stat card, color-identity bar | **Yes →** `collection.md` | Empty state copy/CTA + dense advanced-search form + results/pagination behavior |
| `/sets`, `/sets/:id` | `PlanEditor` | **Yes** — no plan / no binders / no segments | binder spread (embeds binder-view), segment list, card picker, set selector, box card list | **Yes →** `plan-editor.md` | Largest workspace; unique multi-panel responsive IA, ordering/insert interactions, set-creation flow |
| (sub-surface of editor + a future standalone route) | binder spread viewer | n/a | slot, spread, overview, card action sheet | **Yes →** `binder-view.md` ✅ done | Skeuomorphic responsive spread; unique rules |
| `/decks`, `/decks/:id` | `DecksView` | **Yes** — no decks | deck list, deck detail, **import modal**, **card-linking modal** (same/any/scryfall) | **Yes →** `decks.md` | Archidekt import flow + 3-mode card-linking flow + empty state |

## Shared surfaces (documented in MASTER, not per-page)

- **App shell** (top bar, section nav, theme toggle) → MASTER §8/§9. The binder viewer carries its *own* chrome (see binder-view.md).
- **Modals / sheets / dialogs** (deck import, card picker, set selector, card-linking, card action sheet) → MASTER §9 component specs (Dialog/Sheet) + the owning page file documents the *flow*, not the chrome.
- **Ownership badges, mana chips, card tile, stat card, color-identity bar, buttons, inputs, progress** → MASTER §9. Reused everywhere; never re-specced per page.

## Proposed override files (outline)

### `pages/collection.md` (the `/` home + search)
- **Empty / first-run**: welcome headline, what Spellbinder does, the local-storage privacy notice (reframe the legacy `⚠️` as an SVG info callout), single primary CTA "Create your first set". Stats hidden until data exists.
- **Search**: Quick vs Advanced as segmented control. Advanced = **progressive disclosure** (collapsed by default); fields grouped (name, type, colors+commander-identity, rarity, mana value range, ownership) with labels (not placeholder-only), validate on blur, explicit Search action. 16px inputs (no iOS zoom).
- **Results**: card-tile grid, result count, sort note, binder-location line (uses `--accent` per §11), ownership badges. Pagination vs. virtualized infinite — decide (see open Qs). Loading skeletons; empty "no matches" state.

### `pages/plan-editor.md` (the `/sets` workspace)
- **Responsive IA**: how the panels (binder list / segment list / binder preview) lay out desktop → tablet → phone. Likely: desktop = preview + side panel; phone = preview-first with segment/binder management behind a sheet or tab.
- **Binder preview**: embeds the binder-view `BinderSpread` (compact, non-fullscreen) + link to the focused full-stage route.
- **Editing interactions**: segment ordering, card insert into empty slot, spacer/blank handling, target-binder pinning — all surfaced via the card action sheet + drag with threshold; keep the ownership-index invariant (CLAUDE.md) intact.
- **Flows**: create set / add binder / add storage box; empty states for no plan / no binders / no segments.

### `pages/decks.md` (the `/decks` views)
- **Empty / first-run**: no decks → CTA to import from Archidekt.
- **Import flow**: modal with URL-or-ID input, loading/submit/error states (clear recovery), success feedback.
- **Deck detail**: deck card list with owned/linked status; **card-linking flow** with three modes (find same printing / replace with any owned card / search all Scryfall printings) as progressive tabs; per-card link via sheet.
- **Boxes**: links to collection-box matches (ties to the StorageBox treatment open question in binder-view.md §10).

## Recommended order

1. `collection.md` (smallest, high-traffic, validates the form rules)
2. `plan-editor.md` (biggest; resolve its IA + the two binder-view open questions here)
3. `decks.md` (self-contained flows)

Total page files: **4** (binder-view done + these 3) — not one per route, and nothing for purely-inherited surfaces.
