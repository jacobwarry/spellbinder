# Page override — Collection (Home / `/`)

Extends [MASTER.md](../MASTER.md). Documents only deltas. Components used (search box, mana chips, segmented control, card tile, stat card, color-identity bar, badges) are specced in MASTER §9.

Reference: current behavior in `src/views/HomePage.vue`.

---

## 1. Two states

The route renders one of two states based on whether the user has any sets:

- **First-run / empty** (no sets) — a welcome panel, not a blank dashboard.
- **Active** (has sets) — collection search + results.

## 2. First-run / empty state

- Centered welcome panel (`surface`, `--shadow-1`, max ~720px): Sora headline "Welcome to Spellbinder", one-paragraph what-it-does, and the local-data privacy notice.
- **Reframe the legacy `⚠️` notice** as a proper info callout: Lucide info/shield icon + `--accent-soft` background + `--line`. Keep the warning about clearing browser data as a distinct `--skipped`-toned caution row (icon + text, not emoji).
- **One** primary CTA: "Create your first set" → `/sets?create=true`.
- Stats and search are hidden here (no data to show). Per MASTER, don't render empty charts/stat cards.

## 3. Active state — search

- **Quick vs Advanced** = segmented control (MASTER §9), not the legacy tab underline.
- **Quick**: single search box, debounced (~150ms), name match. 16px input (no iOS zoom).
- **Advanced** = **progressive disclosure**: collapsed behind the segmented control; when open, fields are grouped with visible labels (never placeholder-as-label):
  - Card name (text)
  - Card type (multi-select dropdown)
  - Colors — the six **mana chips** W/U/B/R/G/C (white chip uses dark text per §11) + a "Commander identity" toggle with helper text
  - Rarity — Common / Uncommon / Rare / Mythic
  - Mana value — min/max numeric range (`inputmode="numeric"`)
  - Ownership — Owned / Missing / Skipped
- Advanced uses an **explicit Search action** (primary button) — not live filtering — so the dense form commits intentionally. Validate on blur; clear "no matches" recovery.

## 4. Active state — results

- **Card-tile grid** (MASTER §9). Each tile: art-by-color-identity, name, set·№ (tabular), ownership **badge**, and the **binder-location line** in `--accent` (per §11 — not `--accent-2`): "Binder A · P3 · S2", or a muted "No binder configured" when unplaced.
- Result **count** + sort note. Sort: by set name, then collector number (natural).
- **Virtualize the grid** (collections reach thousands; MASTER §3 virtualize-lists). This **replaces the current 100-per-page pagination** — infinite/virtual scroll with a sticky result count and a "back to top" affordance. (If pagination is retained short-term, treat virtualization as the target.)
- Loading → skeleton tiles (reserve `aspect-ratio`, no CLS). Missing cards → grayscale art + "Missing" badge.

## 5. Notes

- This screen is the find-by-name complement to the binder viewer's spatial browse; tapping a result could deep-link to that card's slot in the binder view (ties to the standalone binder route in [plan-editor.md](plan-editor.md)).
