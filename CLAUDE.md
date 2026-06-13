# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Spellbinder is a client-side-only SPA for planning how to organize a Magic: The Gathering card collection into physical binders and storage boxes. It also imports decklists from Archidekt and links them against the tracked collection. There is **no backend** — all state lives in the browser (localStorage + IndexedDB) and all external data comes from the Scryfall and Archidekt public APIs.

Stack: Vue 3 (`<script setup>` SFCs) + TypeScript (strict) + Vite, Pinia for state, vue-router for routing, Tailwind CSS v4 + a hand-authored shadcn-vue-style component layer for the UI.

## Commands

```bash
npm run dev        # Vite dev server
npm run build      # vue-tsc -b (type-check) && vite build
npm run preview    # preview the production build
npm test           # vitest run (the meaningful unit suites)
npm run test:watch # vitest in watch mode
```

The automated checks are **type-checking** (`vue-tsc`, run via `npm run build`) and **Vitest**. There is no lint script. `tsconfig.app.json` is strict and additionally enforces `noUnusedLocals` / `noUnusedParameters`, so unused imports/vars fail the build. Tests are deliberately scoped to logic that pays off — the placement engine (`usePlacement.test.ts`), placement aggregation (`useAllPlacements.test.ts`), and the binder-spread core (`useBinderSpread.test.ts`); don't add shallow component render tests.

Path alias: `@` → `src` (configured in both `vite.config.ts` and `tsconfig.app.json`).

## Design system & UI

The visual system ("Planar" — dark-first techno-fantasy) is documented under `design-system/` (`MASTER.md` is the source of truth; `pages/*.md` are override-only per-screen specs). The `design-poc/` HTML files are the original reference prototypes.

- **Tokens** live in `src/styles/tokens.css` (light `:root` + dark `.dark`). `src/style.css` maps them into Tailwind v4 via `@theme inline` (e.g. `--color-primary` → `--accent`, app tokens `--color-surface`, `--color-ink-soft`, `--color-mana-*`, etc.). Use semantic utilities (`bg-surface`, `text-ink-soft`, `border-line`, `text-primary-foreground`) — **never raw hex** in components. Dark mode is the `.dark` class on `<html>`, toggled by `src/composables/useTheme.ts` (persists `spellbinder-theme`).
- **Tailwind v4** canonical class forms: `bg-(--x)` / `shadow-(--x)` / `aspect-63/88`, the `dark:` variant, `!` important suffix. Keep IDE canonical-class warnings clean.
- **Primitives** are hand-authored shadcn-vue-style components in `src/components/ui/` (button, input, dialog, sheet, badge, segmented, …) on reka-ui, composed with `cn()` (clsx + tailwind-merge). Prefer these + the atoms in `src/components/common/` over bespoke markup. Modals use `ui/dialog`; the card-action bottom sheet uses `ui/sheet`. Icons are **lucide-vue-next** (no emoji).
- **Layout model — document scroll by default.** The shell (`App.vue`) is `min-h-dvh` with a sticky top bar and a fixed mobile bottom nav; the document scrolls naturally. Long lists window-virtualize (`@tanstack/vue-virtual`). The **binder viewer is the one fixed-viewport exception** (`h-dvh`/sized container, because fit-to-viewport measures its container). Don't reintroduce `min-h-dvh`/`100vh` page-fills or per-view `overflow` hacks elsewhere. See `MASTER.md` §8.

## Domain model & data flow

The core hierarchy (see `src/types/`):

- **Plan** (`BinderPlan`) — a named layout holding an **ordered** list of `binderIds` and an **ordered** list of `segmentIds`. Order matters: it drives placement.
- **Container** (`Binder` is a legacy alias) — a discriminated union on `type`: `PhysicalBinder` (`pageCount` × `slotsPerPage`, finite capacity) or `StorageBox` (unlimited). Use the `isPhysicalBinder` / `isStorageBox` type guards from `src/stores/binders.ts` rather than checking `.type` inline.
- **Segment** — a chosen set's cards (`cardIds`, ordered) plus layout controls: `offset` (blank slots before the segment starts), `spacersBefore` (`Record<cardIndex, blankCount>`), and optional `targetBinderId` to pin it to a specific binder.

### Placement engine (`src/composables/usePlacement.ts`)

`calculatePlacements(segments, binders)` is the heart of the app: a pure async function that turns the ordered segments + binders into a flat `CardPlacement[]` plus overflow info. It resolves card data via the Scryfall cache, then walks segments in order, honoring each segment's target binder, offset, and spacers, and auto-fills into subsequent binders when a target overflows. Boxes use linear positioning (no pages); binders compute `pageNumber`/`slotOnPage` from `slotsPerPage`. When changing layout/ownership semantics, this is usually the file to edit.

### Ownership tracking — the critical coupling

Owned/skipped state is **not** keyed by Scryfall card ID. It's keyed by position: `"<segmentId>:<cardIndex>"` (see `getPlacementOwnershipKey` in `src/types/placement.ts`). The collection store (`src/stores/collection.ts`) holds two `Set<string>` of these keys (`spellbinder-collection`, `spellbinder-skipped`).

Because keys encode the card's index within its segment, **any insert/remove of a card in a segment must shift indices in two places in lockstep**:
1. The segments store updates `cardIds` and the `spacersBefore` index map.
2. The collection store's `shiftIndicesForInsert` / `shiftIndicesForRemove` re-key the owned/skipped sets.

`segmentsStore.insertCardInSegment` / `removeCardAtIndex` already call into the collection store to do this. If you add a new way to mutate a segment's card list, you must keep this invariant or ownership will silently attach to the wrong cards.

## Persistence

**localStorage** (one key per store, JSON-serialized; stores save synchronously on every mutation):
- `spellbinder-binders`, `spellbinder-segments`, `spellbinder-plans`, `spellbinder-decks`
- `spellbinder-collection`, `spellbinder-skipped` (arrays of `segmentId:index` keys)
- `spellbinder-theme` (light/dark UI preference, written by `useTheme.ts`)

**IndexedDB** database `spellbinder-cache` holds the Scryfall cache (`sets`, `cards`, `setCards` object stores) and binder cover images (`binderImages`). Both `src/api/scryfall.ts` and `src/utils/binderImages.ts` open this same DB and **each declares its own `DB_VERSION` and `onupgradeneeded`**. They must stay in sync — if you bump the schema in one file, bump and mirror the store creation in the other, or the upgrade transaction will race depending on which module opens the DB first.

### Migrations
Run at startup in `src/main.ts` before `app.mount` (`migrateBindersToTyped` adds the `type` field to pre-union binders). There are also inline, defensive migrations inside store loaders — e.g. `segments.ts` `loadFromStorage` converts the old `spacersBefore` array format to the current `Record`. Follow this pattern (migrate-on-read or migrate-at-boot) when changing a persisted shape, since users have live data in their browser.

## External APIs

- **Scryfall** (`src/api/scryfall.ts`): cards/sets fetched and cached in IndexedDB; cache is read-through (`getCachedCards` fetches only missing IDs). Respects the 75-cards-per-request collection limit and adds 100ms throttling between paged/chunked requests. Card objects are explicitly field-mapped on ingest (not stored raw) — if you need a new Scryfall field, add it to the `ScryfallCard` type **and** to every mapping block in this file.
- **Archidekt** (`src/api/archidekt.ts`): Archidekt's API sends no CORS headers, so it's never called directly from the browser. Requests use the same-origin path `/api/archidekt/*`, proxied server-side to `https://archidekt.com/api/*` by the Vite dev proxy (`vite.config.ts`) in dev and by a Netlify redirect (`netlify.toml`) in prod. Both must stay in sync. `extractDeckId` accepts either a full URL or a raw numeric ID.

## Stores & UI structure

Pinia stores are all in the composition (setup) style and re-exported from `src/stores/index.ts`: `binders`, `segments`, `plans`, `collection`, `decks`. Each follows the same shape — a `ref` hydrated from storage, a `Map` computed for id lookup, and CRUD functions that mutate then immediately persist.

Routing (`src/router/index.ts`): `/` (HomePage), `/sets` + `/sets/:id` (PlanEditor — the main workspace), `/decks` + `/decks/:id` (DecksView), and `/styleguide` (a dev-only component gallery, gated behind `import.meta.env.DEV`). `PlanEditor.vue` is by far the largest view and orchestrates binder/segment editing, placement preview, and the binder/box rendering.

### Binder viewer (the signature screen)

A digital representation of a physical binder. The pieces, under `src/components/binder/`:

- **`useBinderSpread.ts`** (`src/composables/`) — the pure, unit-tested core: the physical-page model (`spreadViews`: page 1 alone, then 2–3/4–5…, lone last page), `decideLayout` (measured fit-to-viewport spread-vs-single + clamped card px), and nav helpers. `SPREAD_GEOMETRY` holds the constants; `SLOT_ASPECT` (= card aspect + `FOOTER_RATIO`) accounts for the label band so card sizing stays correct. The `useBinderSpread()` composable is thin reactive glue.
- **`BinderSpread.vue`** — presentational viewer driven by a `pages` matrix: cover/spine/rings chrome, page-turn (buttons / arrow keys / drag-swipe), overview heatmap. Emits slot `select`/`insert`/`quickOwn` and an `edge` event (turning past the first/last page) so the host can hop binders. No in-app zoom.
- **`BinderSlot.vue`** — one card slot (image + a fused black set·rarity·№ band). Single-click → `select` (action sheet); **double-click → `toggleOwned`** (debounced so the sheet doesn't flash). Used by both the binder and box views.
- **`BoxView.vue`** — storage boxes (linear, unlimited) as a row-virtualized grid of `BinderSlot`s.
- **`CardActionSheet.vue`** — the `ui/sheet` bottom sheet of card actions; the host owns the real store mutations.

PlanEditor builds the `pages` matrix from `calculatePlacements`, wires the sheet/quick-own/insert to the stores (preserving the ownership index-shift invariant), and renders `BinderSpread` (binders) or `BoxView` (boxes) inside a fixed-height container so fit-to-viewport has a definite size.
