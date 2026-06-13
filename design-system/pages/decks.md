# Page override — Decks (`/decks`, `/decks/:id`)

Extends [MASTER.md](../MASTER.md). Documents only deltas. Modals use the Dialog/Sheet specs in MASTER §9; this file documents the **flows**.

Reference: `src/views/DecksView.vue`; import via `src/api/archidekt.ts`.

---

## 1. States

- **List** (`/decks`): the user's decks; **empty** when none.
- **Detail** (`/decks/:id`): a deck's cards linked against the tracked collection.

## 2. Empty / first-run

- No decks → centered panel: what deck-linking does + **one** primary CTA "Import a deck". No empty list chrome.

## 3. Import flow (Archidekt)

- Triggered from list header or empty state → **Dialog**.
- Single input accepting **a full Archidekt URL or a raw numeric ID** (`extractDeckId`). `inputmode` text; visible label + helper ("Paste an Archidekt deck URL or ID").
- States: idle → **submit shows loading** (disable button + spinner) → success (close + deck appears, brief success feedback) or **error with clear recovery** ("Couldn't reach Archidekt — check the link and retry", retry affordance). Errors stated as cause + fix (MASTER error-clarity).
- Implementation note: import goes through a same-origin proxy (`/api/archidekt/*` → Archidekt, via the Vite dev proxy and a Netlify redirect); surface a graceful failure if Archidekt is unreachable (network-fallback).

## 4. Deck detail + card-linking flow

- Deck card list: each row shows the card and its **link status** — linked to an owned collection copy, linked but unowned, or unlinked. Use ownership badge language (MASTER §9) extended with a "Linked" state (icon + text, not color-alone).
- **Linking a card** opens a **Dialog/Sheet** with three modes as a **segmented control** (progressive, one visible at a time):
  1. **Find same printing** — matches in your collection/boxes of the same card; show each with its **binder/box location** (`--accent` text).
  2. **Replace with any owned card** — search your collection to substitute.
  3. **Search all printings (Scryfall)** — fetch every printing to pick a specific one.
- Each candidate row reuses card-tile/slot visual language + location line; selecting links it. Provide undo for unlink/replace (MASTER undo-support).

## 5. Boxes tie-in

- Collection matches include **storage box** locations, rendered with the same location line. This depends on the box treatment in [plan-editor.md](plan-editor.md) §3 so a box match reads consistently with a binder match.

## 6. Notes

- Deck detail is read-against-collection, not an editor of placements; keep its actions (link/replace/unlink) clearly scoped and separate from destructive deck-level actions (delete deck), which use `--skipped` and are spatially separated (MASTER destructive-nav-separation).
