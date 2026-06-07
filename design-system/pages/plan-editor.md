# Page override — Plan Editor (`/sets`, `/sets/:id`)

Extends [MASTER.md](../MASTER.md) and composes [binder-view.md](binder-view.md). The largest, most unique workspace: plan/binder/box/segment management + placement preview. Documents only deltas.

Reference: `src/views/PlanEditor.vue` and `src/components/{binder,segments,sets}/`.

---

## 1. Responsive IA

Three logical regions: **(a) plan structure** (ordered binders + boxes), **(b) segment list** (ordered sets/segments with layout controls), **(c) binder/box preview** (the placement result).

- **Desktop (≥1024px):** preview is the primary canvas; structure + segment management in a side panel/sidebar (MASTER adaptive-navigation: sidebar on large). Side panel collapsible to maximize the binder.
- **Tablet (768–1024):** preview on top, management in a panel below or a slide-in drawer.
- **Phone (<768):** **preview-first.** Plan structure and segment editing live behind a bottom **sheet** / segmented tab ("Binder" · "Segments" · "Layout"), so the binder representation still owns the viewport (core driver).
- Measure the preview container, not the device, to drive the binder spread/single decision (binder-view.md §3).

## 2. Binder viewer placement — DECISION

**Both**, sharing one `BinderSpread` component:
- **Embedded compact preview** inside the editor (sized to its region, still auto fit-to-viewport within that region).
- **Dedicated full-stage route** for focused viewing/sharing — deep-linkable, e.g. `/sets/:id/binder/:binderId` (and ideally `…?page=n`). This is the primary mobile experience and satisfies deep-linking.
- Same component, same tokens, same nav/overview/action-sheet; only the available space differs.

## 3. Storage box rendering — DECISION

Boxes (`StorageBox`) are **unlimited / linear (no pages)**, so they do **not** use the spread/spine chrome.
- Render as a **virtualized vertical grid of slots** (linear positions), reusing the same `BinderSlot` + card action **sheet**. Columns fill the width responsively; rows virtualized (MASTER virtualize-lists).
- Box chrome is simpler than a binder: a labeled container (no paper/rings), with the same ownership states and empty-slot insert affordance.
- Keep it visually part of the system (same slot, badges, sheet) so binders and boxes feel like one family.

## 4. Editing interactions

- **Segment ordering** and **binder/box ordering**: drag with a ~6px threshold (MASTER drag-threshold) **and** a keyboard/explicit move alternative (gesture-alternative). Order drives placement.
- **Insert into empty slot**: tap an empty slot → card picker (Dialog). 
- **Spacers / blanks** and **owned/skip/remove**: via the card action **sheet** (binder-view.md §6) — including the blanks-before stepper.
- **Target binder pinning** for a segment: a control in the segment's row/sheet.
- **Invariant (critical):** any card insert/remove must keep the ownership-key index shift in lockstep across the segments store and collection store (see project `CLAUDE.md`). The UI must route all card-list mutations through the methods that preserve this; never mutate `cardIds` directly from a new affordance.

## 5. Flows & empty states

- **Create set** (`?create=true`): set selector → segment created. **Add binder** / **Add storage box**: form dialogs (page count × slots-per-page for binders; name for boxes; optional cover image).
- Empty states, each with one CTA:
  - No plan → "Create your first set".
  - Plan but no binders/boxes → "Add a binder or box".
  - Binders but no segments → "Add a set to place".
- Pickers (`CardPicker`, `SetSelector`, `BoxCardPicker`) are Dialogs (MASTER §9); their list rows reuse card-tile/slot visual language.

## 6. Notes

- Cover images (binder art) are user-provided; respect aspect and clear space, lazy-load, and fall back to a color-identity or default treatment when absent.
