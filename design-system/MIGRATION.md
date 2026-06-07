# Spellbinder — Migration Plan

How we move the app onto the design system in small, auditable, independently-shippable steps. Reference: [MASTER.md](MASTER.md), [SCREENS.md](SCREENS.md), `pages/*`.

---

## 0. Refactor / abstraction targets (decided: interleave, separate commits)

The views grew large with mixed concerns. Extract logic into composables **in the phase that already touches that code**, each as a **separate commit** from the UI-token work (clean audit trail). Extracted composables are meaningful-test targets (pure-ish logic).

| Target | Extract to | Where | Why |
|---|---|---|---|
| Placement orchestration (`recalculateAllPlacements`, `allPlacements`, `locationMap`/`getCardLocation`, `cardsPerBinder`, `ownedCardsPerBinder`) — duplicated in HomePage **and** PlanEditor | `usePlacements()` / `useCardLocations()` | P8 (touches PlanEditor) | Removes real duplication; shrinks both views |
| Binder spread/zoom/nav (`isSpreadView`, `leftPageNumber`, `rightPageNumber`, `currentPagePlacements`, page nav) | `useBinderSpread()` + pure `decideLayout()` | **P10** | The heart of PlanEditor bloat; rebuilt anyway — don't port messy inline logic |
| HomePage quick/advanced filter + `allCards` index | `useCollectionSearch()` | cleanup pass | Tangled filter logic in the view |
| DecksView 3-mode linking (`collectionMatches`, replace/scryfall search, link/unlink) | `useDeckLinking()` | cleanup pass | Tangled linking logic |
| `debugCollection.ts` (342 lines, attached to `window` in HomePage) | gate behind `import.meta.env.DEV` | quick win | Dev tooling shouldn't ship to prod |
| Inline `image_uris?.normal || card_faces[0]…` in HomePage/DecksView | reuse existing `getCardImageUri()` (scryfall.ts) | quick win | Already exists; stop reimplementing |

---

## 1. Principles (apply to every phase)

- **One phase = one reviewable PR.** Small enough to read in a sitting; each delivers a visible, demoable win.
- **Always green.** `npm run build` (= `vue-tsc -b && vite build`) must pass at the end of every phase. Type-check is the only automated gate today (no test runner, no lint — see §5 "needs info").
- **Behavior parity unless a change is explicitly listed.** A phase restyles/re-implements; it does not silently change what the app *does*. Intended behavior changes are called out per phase.
- **Foundation first, leaves before trunk.** Tokens → shell → primitives → simple screens → complex screens → the binder → cleanup.
- **Independently revertible.** After Phase 0, any later phase can be reverted without breaking earlier ones (they only depend on the foundation, not each other).
- **Don't boil the ocean per screen.** Where a screen has cheap and expensive halves (e.g. search controls vs. virtualized results), split them into separate phases.
- **Preserve the data invariant.** Any code touching a segment's card list must keep the ownership-key index shift in lockstep (project `CLAUDE.md`). Migration is visual/structural; never bypass `insertCardInSegment` / `removeCardAtIndex`.
- **Build async-tolerant.** A future backend (see §5 "Persistence/backend") will make store writes async. Components must accept loading / empty / error states from the start so the UI layer needs no rework when persistence changes; don't assume synchronous local writes in new components.

**Definition of done (per phase):** build green · acceptance criteria met · light + dark verified · keyboard + focus checked · 375px and desktop checked · no new console errors · no regression in adjacent screens.

---

## 2. Framework & library spec (what powers the new UI)

Current stack stays: **Vue 3.5 (`<script setup>`) · Vite 7 · TypeScript 5.9 (strict) · Pinia 3 · vue-router 4.** No framework swap. Additions below.

| Library | Purpose | Why this one | Risk / notes | Status |
|---|---|---|---|---|
| **Tailwind CSS v4** (`tailwindcss`, `@tailwindcss/vite`) | Utility styling + token plumbing | Native Vite 7 plugin, CSS-first `@theme`, fast. Maps cleanly to our CSS-var tokens. | Preflight resets base styles → minor shifts in legacy views until migrated (mitigate: migrate shell early, verify each view). If a dep lags on v4, fall back to **v3.4**. | **Confirm v4 vs v3.4** |
| **shadcn-vue** (CLI; copies components into `src/components/ui/`) | Accessible primitives we own | Unstyled/own-the-code → wears Planar without looking stock; CSS-var theming; we keep the source. | Not a runtime dep; it pulls in Reka UI. | Recommended |
| **Reka UI** (`reka-ui`) | Headless primitive engine under shadcn-vue | Focus mgmt, ARIA, keyboard for Dialog/Sheet/Tabs/Tooltip/DropdownMenu | Peer of shadcn-vue | Recommended |
| **lucide-vue-next** | Icon set (one family, stroke 1.8–2) | Matches MASTER §5; tree-shakeable SVG; replaces emoji icons | — | Recommended |
| **cva** + **clsx** + **tailwind-merge** | Component variants + `cn()` helper | Standard shadcn-vue pattern for variant APIs | — | Recommended (with shadcn) |
| **tailwindcss-animate** (or v4 equivalent) | Keyframe utilities for shadcn motion | Used by shadcn components | — | Recommended |
| **@vueuse/core** | `useResizeObserver`, `useMediaQuery`, `usePointerSwipe`, `useColorMode`, `useLocalStorage` | Directly powers the binder fit-to-viewport, theme, and swipe; battle-tested | Adds one dep; very widely used | Recommended |
| **Virtualization** — `@tanstack/vue-virtual` | Virtualize collection results + box slot lists (MASTER virtualize-lists) | Headless, grid-capable, TS-first | Alternative: `vue-virtual-scroller` | **Confirm choice** |
| **Fonts** — `@fontsource-variable/inter` + `@fontsource/sora` | Self-hosted Sora + Inter | Privacy + offline-friendly (app is local-first); no Google CDN dependency | Adds ~app fonts to bundle (subset) | **Confirm self-host vs CDN** |
| **vue-sonner** (toast) | Toasts for success/undo/errors (MASTER forms/feedback) | Lightweight, accessible, aria-live | Only if we adopt toasts (we should for undo) | **Confirm** |
| **Reorder/DnD** — `@vueuse/integrations` `useSortable` (Sortable.js) | Segment/binder ordering + drag interactions | Wraps mature Sortable.js; must add keyboard/explicit-move alternative (MASTER gesture-alternative) | Alternative: native pointer impl (already prototyped for swipe) | **Confirm** |
| **Vitest** (dev; `@vue/test-utils` only when a component encodes real logic) | **Meaningful logic/data-integrity tests** — not DOM tests | Zero tests today; the placement engine + index-shift invariant are the real risk | See "Testing strategy" below for the exact scope | **Adopted (meaningful-only)** |

Things we explicitly **keep / restyle, not replace:** Scryfall image pipeline + IndexedDB cache, Archidekt import, the placement engine (`usePlacement.ts`), all Pinia stores, `binderImages` cover storage. Migration is UI-layer; domain/data logic is untouched except where a component reads it.

### Testing strategy (meaningful-only)

Rule: **test logic and data integrity, not the DOM.** Mostly Vitest unit tests on composables / stores / utils; near-zero component tests.

**In scope (real failure modes, regression-prone, mostly pure):**
1. **Placement engine** `calculatePlacements` — page/slot math, `offset`, `spacersBefore`, target-binder pinning, overflow to next binder, box linear positioning, page-1 / last-page edges (mock the Scryfall cache resolver). *Primary target.*
2. **Ownership index-shift invariant** — insert/remove a card and assert owned/skipped sets re-key correctly (`shiftIndicesForInsert/Remove` + `insertCardInSegment` / `removeCardAtIndex`). The fragile coupling that silently corrupts data.
3. **Persisted-shape migrations** — `migrateBindersToTyped`, `spacersBefore` array→Record. Run on real user data at boot.
4. **Pure parsers/mappers** — `extractDeckId`, Scryfall 75-card chunking + read-through cache merge, `convertArchidektCards`.
5. **Binder layout decision** — extract `decideLayout(stageW, stageH, geometry) → {mode, cardPx}` as a pure function (we want this anyway) and unit-test its edges; keeps the component dumb. *(P10)*

**Explicitly NOT tested:** rendering/snapshot tests, "click calls store method" tautologies, shadcn/Reka primitives (upstream-tested), generic set-and-persist store CRUD. `@vue/test-utils` only where a component encodes real logic (e.g. the action sheet preserving the invariant on remove) — never for markup.

---

## 3. Viewport support & behavior differences

**Breakpoints (Tailwind defaults + a 320/375 mobile baseline):** base (mobile-first, ≥320, design at 375) · `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280. Min supported width 320px; `min-h-dvh`; `viewport-fit=cover`; safe-area insets on fixed bars; never disable user zoom.

**Global rule:** the *binder viewer* sizes by **measured container width** (`ResizeObserver`), not breakpoints — it can be a spread inside a wide editor panel or single-page in a narrow one regardless of device. Everything else uses breakpoints.

| Screen | Phone (<640) | Tablet (640–1024) | Desktop (≥1024) |
|---|---|---|---|
| **App shell / nav** | Top bar (brand + theme) + **bottom tab nav** (Collection/Sets/Decks, icon+label, ≤5) | Top bar with inline nav | Top bar with inline nav (optional left rail later) |
| **Collection (home)** | 1-col results, search controls stacked, advanced filters in a sheet/accordion | 2–3 col results | 3–5 col results, filters inline |
| **Plan editor** | **Preview-first**; binder/segment management behind a bottom sheet or segmented tab | Preview + collapsible panel/drawer | Preview canvas + persistent side panel |
| **Binder viewer** | Single page, swipe/buttons to turn; overview = thumbnail grid | Single large page or spread if the panel is wide enough | Two-page spread; overview grid |
| **Storage box** | 2–3 col virtualized slot grid | 4–6 col | 6–8 col |
| **Decks** | 1-col deck list; import + linking in full-height sheets | 2-col | multi-col list + detail |

**Orientation:** layouts remain operable in landscape; the binder viewer re-measures and may switch single↔spread on rotate. **Touch:** all targets ≥44px, ≥8px apart; inputs ≥16px (no iOS auto-zoom); hover-only affordances always have a tap path. **Motion:** honor `prefers-reduced-motion`. **Theme:** default follows `prefers-color-scheme`, user toggle persists (`spellbinder-theme`).

---

## 4. Phased plan (each phase = one PR)

> Order mirrors your ask: foundation → main page state → collection list → managing binders → the actual binders — each a separate activity.

### Phase 0 — Foundation & tooling *(no intended visual change)*
- **Do:** add Tailwind v4 + Vite plugin; `tokens.css` (MASTER §3–§7 as CSS vars, light + `.dark`); Tailwind theme ↔ token mapping incl. shadcn names (MASTER §12); self-host fonts; `shadcn-vue` init (`components.json`, `cn()`); `useTheme` composable (system default + persist + `.dark` on `<html>`).
- **Out of scope:** changing any view's markup.
- **Win / acceptance:** build green; a temporary `/styleguide` shows a themed button + theme toggle flipping light/dark; all 3 existing routes still render (screenshot check).
- **Risk:** Tailwind preflight resets shift legacy base styles. **Mitigation:** verify each route; fix obvious base regressions or wrap legacy CSS in a `@layer`. **Rollback:** revert PR.

### Phase 1 — App shell (header + nav + theme toggle)
- **Do:** rebuild `App.vue` chrome with tokens + shadcn Button; add theme toggle; responsive nav (desktop inline / mobile bottom tab); active state, focus rings, aria.
- **Win:** shell themed in both modes; nav + keyboard + active state correct; bottom nav on phone.

### Phase 2 — Primitive + presentational component library
- **Do:** add primitives + build app atoms: `ManaChip`, `OwnershipBadge`, `StatCard`, `CardTile`, `ColorIdentityBar`. Expand `/styleguide` to render them all in both themes.
- **Win:** every primitive auditable in isolation on `/styleguide` — the de-risking gallery later phases compose from. No production screen changed yet.
- **Done (notes):**
  - The shadcn-vue CLI rejected our `components.json` / tsconfig path resolution (version drift), so primitives are **hand-authored** as thin reka-ui/token wrappers (same pattern as `Button`). `components.json` kept (minus the invalid `tsConfigPath` key) for future use.
  - **Built:** Button (P0), Input, Badge, Skeleton, SegmentedControl + the five atoms. Shared types in `src/components/common/types.ts` (type exports can't live in `<script setup>`).
  - **Deferred to first use:** Dialog + Sheet → P6/P9; Tabs / Tooltip / Toast → when a consumer needs them. Building complex reka-ui wrappers with no consumer now just risks drift.
  - Tailwind v4 canonical class form used (`shadow-(--shadow-1)`, `aspect-63/88`), not the `[var(...)]` arbitrary form.

### Phase 3 — Home: main page / first-run state
- **Do:** migrate `HomePage` **empty state** (no sets): welcome, SVG-reframed storage notice, single CTA. Search branch left on legacy styling for now.
- **Win:** first-run matches [pages/collection.md](pages/collection.md) §2 in both themes; search path untouched.

### Phase 4 — Collection: search controls
- **Do:** Quick/Advanced as segmented control; search box; mana chips; advanced form with progressive disclosure, real labels, blur validation, numeric inputmodes. Results still render via legacy tiles.
- **Win:** search controls themed + accessible; filter behavior parity.

### Phase 5 — Collection: results list (CardTile + virtualization)
- **Do:** swap results to `CardTile` grid; ownership badges; location line (`--accent`); skeletons; **virtualize and remove 100-per-page pagination** (confirmed behavior change — see §5).
- **Win:** themed virtualized results; data/sort parity; smooth scroll at thousands of cards.

### Phase 6 — Decks: list + empty + import flow
- **Do:** `DecksView` list + empty CTA; import **Dialog** with idle/loading/success/error+retry states.
- **Win:** import flow themed and robust ([pages/decks.md](pages/decks.md) §3).

### Phase 7 — Decks: detail + card-linking flow
- **Do:** deck detail list with link status; 3-mode linking dialog (same / any owned / all Scryfall printings); per-card link via sheet; undo on unlink/replace.
- **Win:** linking flow themed; parity ([pages/decks.md](pages/decks.md) §4).

### Phase 8 — Plan editor: managing structure *(not the binder render yet)*
- **Do:** the "managing the binders" activity — binder/box list, add-binder & add-box forms, segment list, ordering (DnD + keyboard alt), create-set flow, pickers/selectors as Dialogs, editor responsive IA (panel/drawer/tabs), empty states. Placement preview **temporarily keeps the legacy `BinderPageGrid`**.
- **Win:** editor chrome + all management themed; ordering works with keyboard alt; invariant preserved.

### Phase 9 — Binder slot + card action sheet *(components)*
- **Do:** `Sheet` primitive + `BinderSlot` (presentational) + `CardActionSheet` (owned/skip/blanks-stepper/Scryfall/remove); demo in `/styleguide`.
- **Win:** the touch-friendly slot + action-sheet pattern, auditable in isolation.
- **Done (note):** built the `Sheet` primitive (reka-ui, slide-up + swipe-down dismiss) + `BinderSlot` + `CardActionSheet` (presentational, emits actions so the consumer keeps the index-shift invariant), demoed in the styleguide. **Deviation:** did *not* rewire the legacy `BinderPageGrid` (it's replaced wholesale in P10) — the hover-⋮ menu dies in P10 when `BinderSpread` adopts these components, avoiding throwaway wiring.

### Phase 10 — Binder spread viewer (the actual binders)
- **Do:** `BinderSpread` — fit-to-viewport (ResizeObserver), spread↔single, cover pages, spine/rings, page-turn (buttons/arrows/swipe), overview mode; **remove in-app zoom**. Replace `BinderPageGrid` in the editor preview and add the **deep-linkable standalone route** (`/sets/:id/binder/:binderId?page=n`).
- **Win:** [pages/binder-view.md](pages/binder-view.md) realized in-app, responsive, both themes — the signature win.

### Phase 11 — Storage box viewer
- **Do:** virtualized vertical slot grid for boxes, reusing `BinderSlot` + sheet ([pages/plan-editor.md](pages/plan-editor.md) §3).
- **Win:** boxes themed consistently with binders.

### Phase 12 — Cleanup & audit
- **Do:** delete legacy `src/style.css` remnants + old `BinderPageGrid` + dead scoped CSS; remove `/styleguide` from prod (or gate); archive/remove `design-poc/`; full pass on MASTER §11 a11y + contrast + CLS/perf; update root `CLAUDE.md` to describe the new system.
- **Win:** no legacy styling remains; audit checklist green; docs current.

**Trackable summary (copy into the tracker):**
`P0 Foundation · P1 Shell · P2 Primitives · P3 Home empty · P4 Search controls · P5 Results+virtual · P6 Decks import · P7 Decks linking · P8 Editor mgmt · P9 Slot+sheet · P10 Binder spread · P11 Boxes · P12 Cleanup`

---

## 5. Not planned / needs more information

Decide these before or at the relevant phase. Grouped by when they bite.

**Tooling / cross-cutting**
- **Automated tests** — ✅ **Decided: meaningful-only** (Vitest, logic/data-integrity scope per §2 "Testing strategy"; no DOM/snapshot tests). Set up Vitest in P0; write tests alongside the phases that touch each target.
- **Node version** — ✅ Node v22.13.1 locally (satisfies Vite 7's ≥22.12). Confirm CI matches if/when CI exists.
- **Package manager** — ✅ **npm** (`package-lock.json` present; no other lockfiles). `shadcn-vue` init will use npm.
- **Browser support** — ✅ **evergreen-only.** Free to use `color-mix()`, `dvh`, `:has()`, `backdrop-filter`, container queries, `aspect-ratio` without legacy fallbacks.
- **SPA history fallback** — ✅ `createWebHistory`. Dev server handles it; **local consumption only right now**, so the host-rewrite check is deferred until there's a real deploy target (revisit at P10 / before any hosting).
- **Tailwind v4** — ✅ adopt v4 (native Vite plugin).
- **Font delivery** — ✅ **self-host** Sora + Inter via `@fontsource` (local-first).
- **Toast system** — adopt `vue-sonner` for success/undo/error, or skip toasts? Undo support (MASTER) wants it. *(P2/P7)*
- **Virtualization lib** — `@tanstack/vue-virtual` vs `vue-virtual-scroller`. *(P5)*
- **Reorder/DnD lib** — `useSortable` (Sortable.js) vs native; plus the keyboard alternative design. *(P8)*

**Product / UX decisions**
- **Pagination removal** — confirmed target to replace with virtualization (collections reach thousands). Confirm OK to drop the page controls. *(P5)*
- **Mobile primary nav** — bottom tab bar assumed for 3 sections; confirm vs. top-only. *(P1)*
- **Standalone binder route** — confirm path/param shape `/sets/:id/binder/:binderId?page=n` and back-behavior/state preservation. *(P10)*
- **Theme default** — follow system (recommended) vs force dark-first. *(P0)*
- **Storage box chrome** — exact visual treatment (labeled container, columns per breakpoint) beyond "virtualized slot grid". *(P11)*

**Persistence / backend (MongoDB) — open architectural epic, separate from this UI migration**
- Under consideration: move local storage → **MongoDB** (Atlas, reusing the inkshot account). This is *not* a simple storage swap — it pulls in a backend/API or Atlas App Services/Device Sync, **authentication** (login/account screens not yet in the design system), and **async stores** (loading / error / retry / offline / optimistic update + rollback / conflict resolution). The current welcome copy ("can't access on other devices yet" + "clearing browser data wipes everything") becomes obsolete, and sync **largely dissolves the Settings export/import gap** below.
- **Decided sequencing:** keep it a **separate workstream, after the UI migration.** The Pinia stores already abstract persistence (CRUD seam); the UI migration proceeds on current local persistence with the store *interface* unchanged, and components are built **async-tolerant** (§1) so no rework is needed when the backend lands.
- **Needs info before the backend epic (not before UI migration):** Atlas App Services/Device Sync vs. custom API · auth method · single-user-multi-device vs. sharing · conflict policy · hosting for the API + env/secrets (current deploy is a static SPA).

**Not yet specced anywhere (gaps in the design system)**
- **Brand assets** — real logo/wordmark + favicon. Currently a text wordmark + placeholder mark. **Deferred to a later stage** (text wordmark is fine for now).
- **PWA / offline** — ✅ **not a goal at the moment** (local consumption only). No manifest/install/offline work in scope; revisit if/when the MongoDB epic or distribution changes that.
- **Global error / empty / loading conventions** beyond per-screen — a shared empty-state component, a global toast region, an app-level error boundary for failed Scryfall/Archidekt calls. *(should add to MASTER)*
- **Settings / data management screen** — the legacy app exposes cache-clear + debug helpers via the console and a hidden button. Where do "clear cache", export/import of local data, and the storage warning live in the new IA? No screen owns this yet. *(needs a decision; likely a Settings route — note: a MongoDB backend would absorb much of this into account/sync, so scope it lightly until that epic is decided)*
- **Cover image upload UX** — `binderImages` exists; the add/replace/crop flow isn't specced. *(P8, needs spec)*
- **Onboarding / first-run beyond the welcome panel** — any guided setup? *(optional, needs info)*
- **Data backup/portability** — given local-only storage + the "clearing browser data wipes everything" warning, is an export/import feature in scope? Affects Settings. *(needs info — product call)*
- **Charts** — MASTER §10 covers charts, but the only data-viz so far is the color-identity bar. Any planned stats/insights screen? *(needs info)*
- **Internationalization / locale formatting** — single-locale assumed; confirm. *(needs info)*

---

## 6. How to track

Each phase ships as a branch/PR named `migrate/PN-short-name`, with the phase's **acceptance criteria pasted into the PR description** as a checklist. Reviewer audits one phase against its acceptance + the per-phase Definition of Done (§1). The `pages/*` and MASTER files are the review reference. Update the MASTER §14 changelog when a phase changes a documented decision.
