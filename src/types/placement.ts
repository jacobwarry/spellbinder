import type { ScryfallCard } from './scryfall'

export interface CardPlacement {
  card: ScryfallCard
  segmentId: string
  cardIndexInSegment: number  // Index of this card in the segment's cardIds array
  binderId: string
  binderIndex: number
  pageNumber: number
  slotOnPage: number
  // Which face of the card this slot displays (1 = back, for double-faced cards).
  // Absent/0 = front. Ownership stays position-keyed, so a back-face slot owns independently.
  face?: number
}

// Generate a unique key for a placement (for ownership tracking)
export function getPlacementOwnershipKey(placement: CardPlacement): string {
  return `${placement.segmentId}:${placement.cardIndexInSegment}`
}
