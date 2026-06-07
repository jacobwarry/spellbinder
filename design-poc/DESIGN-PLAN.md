# Spellbinder — Branding & Design System Plan

> **Superseded as source of truth.** This was the exploration doc that compared three directions. The authoritative, versioned design system now lives in [`../design-system/`](../design-system/) ([MASTER.md](../design-system/MASTER.md) + page overrides). Direction chosen: **Planar (refined)**. Keep this file for the rationale behind the three-way comparison; build from `design-system/`.

## 1. Brand foundation

**Positioning:** Spellbinder is the *cartographer of your collection*. It is not another spreadsheet-style tracker. Its single magic trick is turning a pile of cards into a known place: "this card is in Binder A, page 3, slot 2." The brand should feel like a **premium collector's tool with a quiet fantasy soul** — modern and trustworthy first, magical in the details.

**Brand personality:** precise · premium · quietly magical · collector-grade · calm under data density.

**Brand pillars that drive every design decision**
1. **Placement is the hero.** The binder/slot grid is the signature visual. It must look as good as the card grid.
2. **Fantasy as seasoning, not the meal.** Restraint. One or two magical signals (a sigil, a gilded edge, a mana spectrum) — never a dragon-on-every-button skin.
3. **The five colors are ours for free.** W/U/B/R/G + Colorless is an iconic, instantly-readable palette already in the code. Lean on it for data meaning (filters, card identity, placement art).
4. **Dark and light are equal citizens.** Both shipped from day one, designed together, contrast-verified independently.

## 2. The signature asset: mana identity

The five-color pie is the most ownable thing in this domain. Use it consistently as a **functional** system, not decoration:
- Color filter chips (already in the app)
- Card art placeholders / accents keyed to color identity
- Optionally a five-stop "spectrum" gradient for brand moments (Direction C leans into this)

This keeps the fantasy *meaningful* — it maps to real game data, satisfying the accessibility rule "don't convey by color alone" because color always pairs with the W/U/B/R/G letter and card text.

## 3. Design tokens (three-layer architecture)

Layer the tokens so a theme swap or rebrand touches only the top layer.

```
Primitive   →  Semantic        →  Component
--gold-500     --color-accent      --btn-primary-bg
--slate-900    --color-surface     --card-border
#0e68ab        --mana-u            --chip-u-bg
```

**Semantic tokens to define (light + dark variants for each):**
`--bg`, `--surface`, `--surface-2`, `--ink`, `--ink-soft`, `--ink-faint`, `--line`, `--line-strong`, `--accent`, `--accent-soft`, `--owned`, `--skipped`, `--missing`, plus `--mana-{w,u,b,r,g,c}`.

Implement as CSS custom properties on `:root` / `[data-theme="dark"]`. This matches how the POCs work and how shadcn-vue/Tailwind theming expects it.

**Type scale:** 12 · 13 · 14 · 16(base) · 18 · 24 · 30 · 36 · 46. Body line-height 1.5; headings 1.05–1.15.
**Spacing:** 4/8px rhythm (4, 8, 12, 16, 24, 32, 48, 64).
**Radius:** sm 8 · md 12 · lg 18–20 · pill 100.
**Numbers:** tabular figures for counts, set codes, page/slot numbers (prevents layout shift).
**Icons:** one stroke icon set (Lucide). No emoji as icons — replace the current `⚠️ ✓ ⊘` in HomePage with SVG.

## 4. Recommended component framework

The app currently has **no component library** and hand-rolled CSS per view. Recommendation: migrate to **shadcn-vue (Reka UI + Tailwind CSS)**.

**Why it fits Spellbinder specifically**
- **Unstyled/own-the-code:** components are copied into the repo and styled with your tokens, so the result never looks like a stock library. Directly solves the "not dime-a-dozen" requirement — any of the three directions can be applied to the same components.
- **Light/dark built in:** Tailwind's `dark:` + CSS-variable theming is exactly the token model above. Light/dark "from the get-go" is free.
- **Accessibility for free:** Reka UI primitives (dialog, dropdown, combobox, tabs, tooltip) ship focus management, keyboard nav, and ARIA — which the current custom dropdowns/modals must hand-maintain.
- **Vue 3 + TS + Vite native:** drops into the existing stack with no framework change.
- **Data-dense friendly:** good table/combobox/virtualized-list story for the collection grid and advanced search.

**Alternatives considered:** PrimeVue (great data tables, but its themes read "enterprise" and are harder to make feel bespoke); Naive UI (nice TS theming, but JS-object theming is less portable than CSS vars); Vuetify (Material — the exact "dime-a-dozen" look to avoid).

## 5. Migration path (incremental, low risk)

1. **Tokens first.** Add Tailwind + a `tokens.css` with the semantic variables and a `data-theme` toggle in `App.vue`. Replace `src/style.css` globals. No visual rewrite yet — just wire the palette + dark mode.
2. **Primitives.** Add shadcn-vue Button, Input, Tabs, Dialog, DropdownMenu, Badge, Tooltip. Swap them into the shared header and `HomePage` search first (highest visibility, simplest).
3. **Signature components.** Build a `CardTile` and a `BinderSlotGrid` as first-class themed components (these are the brand). Reuse across HomePage results, PlanEditor preview, and DecksView matches.
4. **PlanEditor last.** It is the largest view; migrate section by section behind the now-stable token + primitive layer.

Each step is shippable on its own and keeps the app working throughout.

## 6. The three directions (see prototypes)

| | A · Grimoire | B · Arcanist | C · Planar |
|---|---|---|---|
| **Feel** | Warm editorial fantasy | Modern mystic minimal | Vibrant dark-first |
| **Default mode** | Light (parchment) | Light (cool neutral) | Dark (obsidian) |
| **Accent** | Gilded gold | Arcane violet | 5-color mana spectrum |
| **Display type** | Cinzel + Spectral | Fraunces | Sora |
| **Fantasy dial** | Medium-high, cozy | Low, in details | High, but controlled |
| **Best if you want** | Heritage/collector charm | Safe, broad, premium SaaS | Distinctly "MTG", gamer energy |
| **Watch-outs** | Serif density; keep UI text in Inter | Could read generic if accent underused | Spectrum overuse; verify light-mode contrast |

**Decision: Planar (refined).** Dark-first atmosphere for personality (Arcanist alone read too plain), but with Arcanist's discipline grafted on: one solid arcane-violet accent does all the everyday work (buttons, links, focus, active nav, progress).

### The spectrum rule (important)

The five-color mana spectrum is a **data signature, not a decoration**. It may only appear where the five colors of Magic are literally what's being shown. Allowed:
- **Logo mark** — a hairline spectrum frame as the brand anchor (identity, one instance).
- **One hero flourish** — a short spectrum rule under the headline (was gradient *text*; toned down).
- **"Collection by color identity"** data bar + legend — the canonical earned use; the bar *is* the W/U/B/R/G breakdown.

Forbidden: spectrum on buttons, ambient panel borders/glows, every stat card, or anything where it doesn't map to the five colors. Rule of thumb — *if removing the spectrum loses no meaning, it shouldn't be there.* Brand-accent **gradients** (the two-tone violet→cyan `--accent-grad`) are a separate, calmer tool for things like the fill progress bar.

Open `index.html` to compare, then each prototype has a light/dark toggle in the top-right.
