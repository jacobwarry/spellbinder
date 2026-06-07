# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Spellbinder is a client-side-only SPA for planning how to organize a Magic: The Gathering card collection into physical binders and storage boxes. It also imports decklists from Archidekt and links them against the tracked collection. There is **no backend** — all state lives in the browser (localStorage + IndexedDB) and all external data comes from the Scryfall and Archidekt public APIs.

Stack: Vue 3 (`<script setup>` SFCs) + TypeScript (strict) + Vite, Pinia for state, vue-router for routing.

## Commands

```bash
npm run dev       # Vite dev server
npm run build     # vue-tsc -b (type-check) && vite build
npm run preview   # preview the production build
```

There is no test runner and no lint script. Type-checking is the only automated check — run `npm run build` (or `npx vue-tsc -b`) to validate. `tsconfig.app.json` is strict and additionally enforces `noUnusedLocals` / `noUnusedParameters`, so unused imports/vars fail the build.

Path alias: `@` → `src` (configured in both `vite.config.ts` and `tsconfig.app.json`).

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
- `spellbinder-zoom-level` (UI preference in PlanEditor)

**IndexedDB** database `spellbinder-cache` holds the Scryfall cache (`sets`, `cards`, `setCards` object stores) and binder cover images (`binderImages`). Both `src/api/scryfall.ts` and `src/utils/binderImages.ts` open this same DB and **each declares its own `DB_VERSION` and `onupgradeneeded`**. They must stay in sync — if you bump the schema in one file, bump and mirror the store creation in the other, or the upgrade transaction will race depending on which module opens the DB first.

### Migrations
Run at startup in `src/main.ts` before `app.mount` (`migrateBindersToTyped` adds the `type` field to pre-union binders). There are also inline, defensive migrations inside store loaders — e.g. `segments.ts` `loadFromStorage` converts the old `spacersBefore` array format to the current `Record`. Follow this pattern (migrate-on-read or migrate-at-boot) when changing a persisted shape, since users have live data in their browser.

## External APIs

- **Scryfall** (`src/api/scryfall.ts`): cards/sets fetched and cached in IndexedDB; cache is read-through (`getCachedCards` fetches only missing IDs). Respects the 75-cards-per-request collection limit and adds 100ms throttling between paged/chunked requests. Card objects are explicitly field-mapped on ingest (not stored raw) — if you need a new Scryfall field, add it to the `ScryfallCard` type **and** to every mapping block in this file.
- **Archidekt** (`src/api/archidekt.ts`): deck import goes through the `corsproxy.io` CORS proxy because Archidekt blocks cross-origin requests. `extractDeckId` accepts either a full URL or a raw numeric ID.

## Stores & UI structure

Pinia stores are all in the composition (setup) style and re-exported from `src/stores/index.ts`: `binders`, `segments`, `plans`, `collection`, `decks`. Each follows the same shape — a `ref` hydrated from storage, a `Map` computed for id lookup, and CRUD functions that mutate then immediately persist.

Routing (`src/router/index.ts`): `/` (HomePage), `/sets` + `/sets/:id` (PlanEditor — the main workspace), `/decks` + `/decks/:id` (DecksView). `PlanEditor.vue` is by far the largest view and orchestrates binder/segment editing, placement preview, and the binder/box grid rendering under `src/components/binder/`, `components/segments/`, and `components/sets/`.
