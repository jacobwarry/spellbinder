import type { ScryfallCard } from './scryfall'

export interface CardPlacement {
  card: ScryfallCard
  segmentId: string
  cardIndexInSegment: number  // Index of this card in the segment's cardIds array
  binderId: string
  binderIndex: number
  pageNumber: number
  slotOnPage: number
}

// Generate a unique key for a placement (for ownership tracking)
export function getPlacementOwnershipKey(placement: CardPlacement): string {
  return `${placement.segmentId}:${placement.cardIndexInSegment}`
}
