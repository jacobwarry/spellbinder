/**
 * Forgiving text matching for the binder-spread highlight filter.
 *
 * Magic card names are dense with punctuation and diacritics (Urza's Saga,
 * Gaea's Cradle, Æther Vial, Lim-Dûl, Jötun Grunt), so we don't match raw text.
 * We fold everything to lowercase, strip diacritics, expand the ligatures MTG
 * actually uses, then drop every non-alphanumeric character (spaces included)
 * before a plain substring test. That "ignore special characters" pass means a
 * user can type `urzas` or `aether` and still land the card, and the match
 * narrows as they type. It is deliberately NOT typo-tolerant/fuzzy — substring
 * matching stays predictable about what does and doesn't light up.
 */
import type { BinderSlotCard } from '@/components/common/types'

/** Fold to a lowercase, diacritic- and punctuation-free alphanumeric string. */
export function normalizeForSearch(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritical marks
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ø/g, 'o')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '') // drop spaces, punctuation, everything non-alphanumeric
}

/** Fields printed on the card face that the filter searches across. */
type SearchableCard = Pick<BinderSlotCard, 'name' | 'set' | 'number' | 'rarity'>

/**
 * True if the card matches the query. `normalizedQuery` MUST already be run
 * through {@link normalizeForSearch} (callers normalize once, then test many
 * cards). An empty query matches everything.
 */
export function cardMatchesQuery(card: SearchableCard, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true
  const haystack = normalizeForSearch(`${card.name} ${card.set} ${card.number} ${card.rarity ?? ''}`)
  return haystack.includes(normalizedQuery)
}
