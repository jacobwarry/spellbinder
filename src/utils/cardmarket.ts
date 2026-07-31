import type { ScryfallCard } from '@/types'

/**
 * Cardmarket export mapping.
 *
 * Cardmarket keeps its own set catalogue that doesn't line up 1:1 with Scryfall. It splits a
 * Scryfall set along two axes:
 *   1. Sub-product (Commander / bonus sheet / Tokens) — these are already *separate Scryfall
 *      sets* with their own codes, so it's a name-translation problem, not a split.
 *   2. "Extras" — the booster-fun treatments (borderless / extended / showcase) pulled out of
 *      the main set into a "<Set>: Extras" expansion. This split is derivable from Scryfall fields.
 *
 * Their wants-list import grammar (one card per line) is:
 *     [amount] Card Name (V.N) (Expansion)
 * e.g. `4x High Tide (V.1) (Fallen Empires)` — so both the expansion and a specific version are
 * expressible. Scryfall gives us the exact `cardmarket_id` (their idProduct) but not the expansion
 * *name*, so the base name is a best-effort heuristic that the user can override per set+variant.
 */

export type CardmarketVariant = 'main' | 'extras'

/** User corrections, keyed by `${setCode}:${variant}` → the exact Cardmarket expansion name. */
export type CardmarketOverrides = Record<string, string>

// Frame treatments that, on their own, place a printing in Cardmarket's "Extras" expansion.
// Deliberately excludes 'legendary'/'inverted' etc. which appear on plain main-set cards too;
// the borderless case is caught by `border_color` instead.
const EXTRAS_FRAME_EFFECTS = new Set(['showcase', 'extendedart', 'shatteredglass'])

/** Whether a printing belongs to Cardmarket's "Extras" (booster-fun) expansion vs the main set. */
export function cardmarketVariant(card: ScryfallCard): CardmarketVariant {
  const isExtras =
    (card.promo_types ?? []).includes('boosterfun') ||
    card.border_color === 'borderless' ||
    (card.frame_effects ?? []).some((f) => EXTRAS_FRAME_EFFECTS.has(f))
  return isExtras ? 'extras' : 'main'
}

export function cardmarketOverrideKey(setCode: string, variant: CardmarketVariant): string {
  return `${setCode}:${variant}`
}

/**
 * Nudge a Scryfall set name toward Cardmarket's naming. Currently handles the one systematic
 * divergence worth automating: Scryfall names Commander decks "<Set> Commander", Cardmarket lists
 * them "Commander: <Set>" (which then composes correctly as "Commander: <Set>: Extras"). Standalone
 * products like "Commander 2021" / "Commander Legends" don't match the suffix, so they're left alone.
 * Other gaps (Tokens, bonus sheets, casing like FINAL FANTASY) stay best-effort and rely on overrides.
 */
export function normalizeCardmarketBaseName(setName: string): string {
  const commander = setName.match(/^(.+) Commander$/)
  return commander ? `Commander: ${commander[1]}` : setName
}

/**
 * Resolve the Cardmarket expansion name for a printing. Precedence:
 *   1. An explicit override for this exact `${set}:${variant}` key.
 *   2. For an Extras card, "<base>: Extras", where <base> honours a main override if present.
 *   3. The Scryfall set name (± ": Extras").
 */
export function resolveCardmarketExpansion(
  card: ScryfallCard,
  overrides: CardmarketOverrides = {}
): { name: string; variant: CardmarketVariant; key: string } {
  const variant = cardmarketVariant(card)
  const key = cardmarketOverrideKey(card.set, variant)
  const base = overrides[cardmarketOverrideKey(card.set, 'main')] ?? normalizeCardmarketBaseName(card.set_name)
  const defaultName = variant === 'extras' ? `${base}: Extras` : base
  return { name: overrides[key] ?? defaultName, variant, key }
}

/** Grouping key for "the same card" — precise via oracle_id, name fallback for older cache. */
export function oracleKey(card: ScryfallCard): string {
  return card.oracle_id ?? card.name.toLowerCase()
}

/**
 * Best-effort 1-based Cardmarket version index for `card` among its same-set siblings that
 * land in the same expansion bucket, ordered by `cardmarket_id`. Returns undefined when the
 * bucket has a single product (no `(V.N)` needed) or ids are missing. Assumes Cardmarket numbers
 * versions in product-id order — true in the cases checked, but not guaranteed.
 */
export function cardmarketVersionIndex(
  card: ScryfallCard,
  sameSetSiblings: ScryfallCard[]
): number | undefined {
  if (card.cardmarket_id == null) return undefined
  const variant = cardmarketVariant(card)
  const ids = [
    ...new Set(
      sameSetSiblings
        .filter((c) => cardmarketVariant(c) === variant && c.cardmarket_id != null)
        .map((c) => c.cardmarket_id as number)
    ),
  ].sort((a, b) => a - b)
  if (ids.length <= 1) return undefined
  const idx = ids.indexOf(card.cardmarket_id)
  return idx >= 0 ? idx + 1 : undefined
}

/** One wants-list line: `[qty] Name (V.N) (Expansion)`. Version omitted when undefined. */
export function cardmarketWantLine(opts: {
  name: string
  expansion: string
  version?: number
  quantity?: number
}): string {
  const qty = opts.quantity ?? 1
  const version = opts.version ? ` (V.${opts.version})` : ''
  return `${qty} ${opts.name}${version} (${opts.expansion})`
}

/** A distinct Cardmarket expansion the export touches — surfaced in the name-override editor. */
export interface CardmarketBucket {
  /** `${setCode}:${variant}` — the override key. */
  key: string
  variant: CardmarketVariant
  setCode: string
  setName: string
  /** Resolved expansion name (override applied). */
  name: string
  /** Pure heuristic name (no overrides) — the "reset" target and the guess we started from. */
  defaultName: string
  /** How many exported cards fall in this bucket. */
  count: number
}

export interface CardmarketExport {
  lines: string[]
  buckets: CardmarketBucket[]
}

/**
 * Build the wants-list lines for a set of printings, plus the distinct expansion buckets they
 * resolve to (for the override editor). `setLists` supplies every printing of each involved set
 * (from the set-cards cache) so version indices can be computed against the full sibling pool.
 */
export function buildCardmarketExport(
  cards: ScryfallCard[],
  setLists: Map<string, ScryfallCard[]>,
  overrides: CardmarketOverrides = {}
): CardmarketExport {
  // Index each set's printings by card so a version lookup is O(1) per exported card.
  const siblingIndex = new Map<string, Map<string, ScryfallCard[]>>()
  for (const [setCode, list] of setLists) {
    const byOracle = new Map<string, ScryfallCard[]>()
    for (const c of list) {
      const k = oracleKey(c)
      const arr = byOracle.get(k) ?? []
      arr.push(c)
      byOracle.set(k, arr)
    }
    siblingIndex.set(setCode, byOracle)
  }

  const lines: string[] = []
  const buckets = new Map<string, CardmarketBucket>()

  for (const card of cards) {
    const { name: expansion, variant, key } = resolveCardmarketExpansion(card, overrides)
    const siblings = siblingIndex.get(card.set)?.get(oracleKey(card)) ?? [card]
    const version = cardmarketVersionIndex(card, siblings)
    lines.push(cardmarketWantLine({ name: card.name, expansion, version }))

    const existing = buckets.get(key)
    if (existing) {
      existing.count++
    } else {
      buckets.set(key, {
        key,
        variant,
        setCode: card.set,
        setName: card.set_name,
        name: expansion,
        defaultName: resolveCardmarketExpansion(card, {}).name,
        count: 1,
      })
    }
  }

  return { lines, buckets: [...buckets.values()] }
}
