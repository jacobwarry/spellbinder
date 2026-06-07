# Spellbinder Design System

This folder is the **source of truth** for Spellbinder's visual and interaction design. The migration (Vue 3 → Tailwind + shadcn-vue) references these files; they are not generated from code, code is built from them.

## Files

- **[MASTER.md](MASTER.md)** — global source of truth: brand, tokens (color/type/space/radius/elevation/motion/z-index/breakpoints), component specs, interaction patterns, accessibility standards, and the Tailwind/shadcn-vue mapping.
- **[SCREENS.md](SCREENS.md)** — screen inventory & triage: which screens get a `pages/*.md` override and which inherit MASTER. Read this to know whether a page file should exist.
- **pages/** — per-screen overrides. A page file only documents where it **deviates from or extends** MASTER. If a page has no file here, MASTER applies in full.
  - **[pages/binder-view.md](pages/binder-view.md)** — the binder viewer (signature screen): responsive spread, navigation, overview, card action sheet.
  - **[pages/collection.md](pages/collection.md)** — Home `/`: first-run state + quick/advanced search + results.
  - **[pages/plan-editor.md](pages/plan-editor.md)** — `/sets` workspace: responsive IA, binder vs box rendering, editing flows.
  - **[pages/decks.md](pages/decks.md)** — `/decks`: Archidekt import + card-linking flow.

## How to use during migration

When building or porting a screen:

1. Read **MASTER.md**.
2. Check **pages/&lt;screen&gt;.md**. If it exists, its rules **override** MASTER for that screen.
3. Never hardcode hex/px that a token already covers. If a value is missing, add a token to MASTER rather than inlining it.

## Reference prototypes

The interactive POCs that this system was distilled from live in [`../design-poc/`](../design-poc/):
`planar.html` (identity), `binder-view.html` (signature screen), `index.html` (chooser). They show intent; **this folder is authoritative** where they differ (notably the contrast fix in §Accessibility and the removal of in-app zoom).

## Status

- **Chosen direction:** Planar (refined) — dark-first techno-fantasy, single arcane-violet accent, the five-color mana spectrum rationed to data.
- **Target stack:** Vue 3 (`<script setup>`) + TypeScript + Tailwind CSS + shadcn-vue (Reka UI). CSS-variable theming, `class`-based dark mode.
- **Version:** 1.0 (pre-migration). See the Changelog in MASTER.md.
