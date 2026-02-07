const ARCHIDEKT_API = 'https://archidekt.com/api'
// CORS proxy to bypass browser restrictions (Archidekt doesn't allow cross-origin requests)
const CORS_PROXY = 'https://corsproxy.io/?'

export interface ArchidektCard {
  card: {
    oracleCard: {
      name: string
    }
    uid: string // Scryfall ID
  }
  quantity: number
  categories: string[]
}

export interface ArchidektDeckResponse {
  name: string
  cards: ArchidektCard[]
}

/**
 * Extract deck ID from an Archidekt URL or raw ID
 * Handles: https://archidekt.com/decks/123456/deck-name
 * Handles: 123456
 */
export function extractDeckId(input: string): string | null {
  const trimmed = input.trim()

  // Check if it's a URL
  const urlMatch = trimmed.match(/archidekt\.com\/decks\/(\d+)/)
  if (urlMatch && urlMatch[1]) return urlMatch[1]

  // Check if it's a raw numeric ID
  if (/^\d+$/.test(trimmed)) return trimmed

  return null
}

/**
 * Fetch deck data from Archidekt API (via CORS proxy)
 */
export async function fetchArchidektDeck(deckId: string): Promise<ArchidektDeckResponse> {
  const archidektUrl = `${ARCHIDEKT_API}/decks/${deckId}/`
  const proxyUrl = `${CORS_PROXY}${encodeURIComponent(archidektUrl)}`

  const response = await fetch(proxyUrl)

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Deck not found. Please check the URL or ID.')
    }
    throw new Error(`Failed to fetch deck: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  return {
    name: data.name,
    cards: data.cards || []
  }
}

/**
 * Convert Archidekt cards to our DeckCard format (without IDs - those are added by the store)
 */
export function convertArchidektCards(archidektCards: ArchidektCard[]): Array<{
  scryfallId: string
  name: string
  quantity: number
  category: string
}> {
  return archidektCards.map(ac => ({
    scryfallId: ac.card.uid,
    name: ac.card.oracleCard.name,
    quantity: ac.quantity,
    category: ac.categories[0] || 'Other'
  }))
}
