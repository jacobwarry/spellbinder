/**
 * Scryfall serves every card symbol (mana, tap/untap, hybrid, Phyrexian, generic
 * numbers, snow, energy…) as a self-contained coloured SVG under one stable CDN
 * path. The file name is the symbol's inner text with slashes stripped and letters
 * upper-cased, e.g. `{W/U}` → `WU`, `{2/W}` → `2W`, `{T}` → `T`, `{10}` → `10`.
 * Two glyphs get spelled-out names. Confirmed against https://api.scryfall.com/symbology.
 *
 * The SVGs carry their own background disc, so they read correctly on both light
 * and dark surfaces with no `dark:invert` (unlike the monochrome set icons).
 */
const SVG_BASE = 'https://svgs.scryfall.io/card-symbols'

const SPECIAL_CODES: Record<string, string> = {
  '∞': 'INFINITY',
  '½': 'HALF',
}

/** Turn a symbol's inner text (no braces) into its Scryfall SVG file code. */
export function manaSymbolCode(inner: string): string {
  const code = inner.replace(/\//g, '').toUpperCase()
  return SPECIAL_CODES[code] ?? code
}

/** Full URL of the Scryfall SVG for a symbol's inner text (no braces), e.g. "W/U". */
export function manaSymbolUri(inner: string): string {
  return `${SVG_BASE}/${manaSymbolCode(inner)}.svg`
}
