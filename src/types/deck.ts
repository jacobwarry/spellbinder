export interface DeckCard {
  id: string                    // UUID for this deck entry
  scryfallId: string            // Scryfall card ID from Archidekt
  name: string                  // Card name
  quantity: number              // Number needed
  category: string              // Commander, Creature, etc.
  linkedCardKey?: string        // "segmentId:cardIndex" if manually linked to a collection card
  linkedScryfallId?: string     // Scryfall ID if linked to a specific printing not in collection
}

export interface Deck {
  id: string
  name: string
  archidektId?: string          // Original Archidekt deck ID
  archidektUrl?: string         // Original URL
  cards: DeckCard[]
  createdAt: number
  updatedAt: number
}
