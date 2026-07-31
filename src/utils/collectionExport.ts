import type { ScryfallCard } from '@/types'
import { buildPool, manaCostOf, oracleTextOf, typeLineOf } from './deckPrompt'

/**
 * Flat JSON snapshot of the owned collection, written for the local MCP server to read.
 *
 * Deduplication and face-flattening happen here rather than in the server so the domain
 * rules (what counts as "the same card", how a double-faced card reads) live in one place
 * instead of being reimplemented in another language.
 *
 * Unlike the deckbuilding pool this keeps basic lands and applies no colour filter — the
 * server answers arbitrary queries, so it wants the whole collection.
 */

export const COLLECTION_EXPORT_VERSION = 1

export interface ExportedCard {
  name: string
  manaCost: string
  cmc: number
  typeLine: string
  oracleText: string
  colorIdentity: string[]
  copies: number
  rarity: string
  setName: string
}

export interface CollectionExport {
  version: number
  exportedAt: string
  cards: ExportedCard[]
}

function toExportedCard(card: ScryfallCard, copies: number): ExportedCard {
  return {
    name: card.name,
    manaCost: manaCostOf(card),
    cmc: card.cmc ?? 0,
    typeLine: typeLineOf(card),
    oracleText: oracleTextOf(card).replace(/\n+/g, ' / '),
    colorIdentity: card.color_identity ?? [],
    copies,
    rarity: card.rarity,
    setName: card.set_name
  }
}

export function buildCollectionExport(
  cards: Iterable<ScryfallCard>,
  exportedAt: Date = new Date()
): CollectionExport {
  const pool = buildPool(cards, { excludeBasicLands: false })
  return {
    version: COLLECTION_EXPORT_VERSION,
    exportedAt: exportedAt.toISOString(),
    cards: pool.map((entry) => toExportedCard(entry.card, entry.copies))
  }
}

/** Triggers a browser download of the export as `collection.json`. */
export function downloadCollectionExport(data: CollectionExport, filename = 'collection.json'): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
