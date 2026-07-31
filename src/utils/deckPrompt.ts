import type { ScryfallCard } from '@/types'
import { normalizeForSearch } from './cardSearch'

/**
 * Builds the "paste this into Claude" prompt for Commander deckbuilding.
 *
 * The model is never asked to recall cards — it only selects from the pool we hand it,
 * so every suggestion is something the collection actually contains. Deterministic rules
 * (colour identity, singleton, non-playable layouts) are enforced here rather than left
 * to the prompt.
 */

/** One unique card in the pool, with printings collapsed. */
export interface PoolEntry {
  card: ScryfallCard
  /** Owned copies across the whole collection. Only >1 matters for basics. */
  copies: number
}

/** Layouts that aren't real, Commander-legal cards. */
const NON_PLAYABLE_LAYOUTS = new Set([
  'art_series',
  'token',
  'double_faced_token',
  'emblem',
  'scheme',
  'planar',
  'vanguard'
])

/**
 * Stable identity for "the same card regardless of printing".
 *
 * Deliberately keyed on the name rather than `oracle_id`: a Magic card name uniquely
 * identifies an oracle card, and `oracle_id` is absent on anything cached before it was
 * tracked. Mixing the two would split one card into two pool entries.
 */
export function cardIdentity(card: ScryfallCard): string {
  return normalizeForSearch(card.name)
}

// ---- Face-aware accessors. Double-faced cards carry their real data on `card_faces`.

export function oracleTextOf(card: ScryfallCard): string {
  if (card.oracle_text) return card.oracle_text
  const faces = card.card_faces
  if (faces?.length) {
    return faces
      .map((f) => f.oracle_text ?? '')
      .filter(Boolean)
      .join(' // ')
  }
  return ''
}

export function typeLineOf(card: ScryfallCard): string {
  if (card.type_line) return card.type_line
  const faces = card.card_faces
  if (faces?.length) return faces.map((f) => f.type_line).filter(Boolean).join(' // ')
  return ''
}

export function manaCostOf(card: ScryfallCard): string {
  if (card.mana_cost) return card.mana_cost
  return card.card_faces?.[0]?.mana_cost ?? ''
}

export function isBasicLand(card: ScryfallCard): boolean {
  return typeLineOf(card).includes('Basic Land')
}

export function isPlayable(card: ScryfallCard): boolean {
  return !NON_PLAYABLE_LAYOUTS.has(card.layout ?? 'normal')
}

/**
 * Commander legality: every colour in the card's identity must appear in the commander's.
 *
 * A missing `color_identity` is treated as colourless (fits everything). In practice the
 * Scryfall ingest always maps this field; the fallback only affects very old cache entries,
 * where being permissive beats silently hiding cards the user owns.
 */
export function fitsColorIdentity(card: ScryfallCard, commanderIdentity: readonly string[]): boolean {
  const allowed = new Set(commanderIdentity)
  return (card.color_identity ?? []).every((color) => allowed.has(color))
}

/** Legendary creatures, plus anything whose text explicitly grants commander status. */
export function isCommanderCandidate(card: ScryfallCard): boolean {
  if (!isPlayable(card)) return false
  const type = typeLineOf(card)
  if (type.includes('Legendary') && type.includes('Creature')) return true
  return /can be your commander/i.test(oracleTextOf(card))
}

export interface BuildPoolOptions {
  /** Commander's colour identity. Cards outside it are dropped. Omit to skip the filter. */
  colorIdentity?: readonly string[]
  /** Drop basic lands — the prompt tells the model to assume unlimited basics. Default true. */
  excludeBasicLands?: boolean
  /** Identity to drop, so the commander doesn't also appear in its own 99. */
  excludeIdentity?: string
}

/**
 * Collapses owned printings into a deduplicated, colour-identity-legal pool sorted by name.
 * Callers pass only cards the collection store reports as owned.
 */
export function buildPool(cards: Iterable<ScryfallCard>, options: BuildPoolOptions = {}): PoolEntry[] {
  const { colorIdentity, excludeBasicLands = true, excludeIdentity } = options

  const byIdentity = new Map<string, PoolEntry>()

  for (const card of cards) {
    if (!isPlayable(card)) continue
    if (excludeBasicLands && isBasicLand(card)) continue
    if (colorIdentity && !fitsColorIdentity(card, colorIdentity)) continue

    const identity = cardIdentity(card)
    if (identity === excludeIdentity) continue

    const existing = byIdentity.get(identity)
    if (existing) {
      existing.copies += 1
    } else {
      byIdentity.set(identity, { card, copies: 1 })
    }
  }

  return [...byIdentity.values()].sort((a, b) => a.card.name.localeCompare(b.card.name))
}

/** Reminder text is always parenthesised and adds nothing the model doesn't know. */
function stripReminders(text: string): string {
  return text.replace(/\s*\([^)]*\)/g, '').trim()
}

export interface FormatOptions {
  /** Strip parenthesised reminder text to cut the paste size. Default true. */
  stripReminderText?: boolean
}

/** One pool line: `Name {cost} | Type — Sub | Oracle text` */
export function formatPoolLine(card: ScryfallCard, options: FormatOptions = {}): string {
  const { stripReminderText = true } = options

  const cost = manaCostOf(card)
  const head = cost ? `${card.name} ${cost}` : card.name

  const raw = oracleTextOf(card).replace(/\n+/g, ' / ')
  const text = stripReminderText ? stripReminders(raw) : raw.trim()

  return [head, typeLineOf(card), text].filter(Boolean).join(' | ')
}

const BASIC_LAND_NAMES: Record<string, string> = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest'
}

function basicsFor(identity: readonly string[]): string {
  const names = identity.map((c) => BASIC_LAND_NAMES[c]).filter(Boolean)
  return names.length > 0 ? names.join(', ') : 'Wastes'
}

export interface DeckPromptOptions extends FormatOptions {
  /** Freeform steer, e.g. "lean sacrifice, avoid infinite combos". */
  notes?: string
}

/** Assembles the full prompt: commander, rules, targets, output contract, then the pool. */
export function buildDeckPrompt(
  commander: ScryfallCard,
  pool: PoolEntry[],
  options: DeckPromptOptions = {}
): string {
  const { notes, ...formatOptions } = options
  const identity = commander.color_identity ?? []
  const identityLabel = identity.length > 0 ? identity.map((c) => `{${c}}`).join('') : 'colourless'

  const sections = [
    `You are helping me build a Commander (EDH) deck using only cards I physically own.`,

    `## Commander
${formatPoolLine(commander, formatOptions)}`,

    `## Rules
- 100 cards total: the commander above plus exactly 99 others.
- Singleton. No duplicates except basic lands.
- Colour identity is ${identityLabel}. The pool below is already filtered to legal cards, so anything listed is fair game.
- Use ONLY cards from the pool. Never suggest a card that is not listed, even a staple. If the deck wants something I don't own, put it in the Gaps section instead.
- Assume unlimited basic lands: ${basicsFor(identity)}.`,

    `## Targets
Defaults, not rules. Adjust to what the commander actually wants and say so if you deviate.
- 36-38 lands including basics
- ~10 ramp
- ~10 card draw or advantage
- ~8-10 interaction (spot removal, board wipes, counterspells)
- remainder on the core strategy`,

    `## Output
1. **Strategy** — one paragraph on the deck's plan and how it wins.
2. **Decklist** — a fenced code block, one card per line as \`1 Card Name\`, with a \`# Category\` comment line before each group (Lands, Ramp, Draw, Interaction, Core). Names must match the pool exactly.
3. **Gaps** — effects this deck wants that my collection can't cover. Describe the effect, not just card names, so I know what to shop for.`,

    notes?.trim() ? `## Additional notes\n${notes.trim()}` : null,

    `## Pool (${pool.length} cards)
${pool.map((entry) => formatPoolLine(entry.card, formatOptions)).join('\n')}`
  ]

  return sections.filter(Boolean).join('\n\n')
}

/** Rough token estimate for the size warning. ~4 chars per token is close enough. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
