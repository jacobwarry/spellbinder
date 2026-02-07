import type { ScryfallSet, ScryfallCard } from '@/types'

const BASE_URL = 'https://api.scryfall.com'
const DB_NAME = 'spellbinder-cache'
const DB_VERSION = 1

interface CachedSetCards {
  setCode: string
  cards: ScryfallCard[]
  cachedAt: number
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      if (!db.objectStoreNames.contains('sets')) {
        db.createObjectStore('sets', { keyPath: 'code' })
      }

      if (!db.objectStoreNames.contains('cards')) {
        db.createObjectStore('cards', { keyPath: 'id' })
      }

      if (!db.objectStoreNames.contains('setCards')) {
        db.createObjectStore('setCards', { keyPath: 'setCode' })
      }
    }
  })
}

async function getCachedSets(): Promise<ScryfallSet[] | null> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('sets', 'readonly')
    const store = transaction.objectStore('sets')
    const request = store.getAll()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const sets = request.result as ScryfallSet[]
      resolve(sets.length > 0 ? sets : null)
    }
  })
}

async function cacheSets(sets: ScryfallSet[]): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('sets', 'readwrite')
    const store = transaction.objectStore('sets')

    for (const set of sets) {
      store.put(set)
    }

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

async function getCachedSetCards(setCode: string): Promise<ScryfallCard[] | null> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('setCards', 'readonly')
    const store = transaction.objectStore('setCards')
    const request = store.get(setCode)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const cached = request.result as CachedSetCards | undefined
      resolve(cached?.cards ?? null)
    }
  })
}

async function cacheSetCards(setCode: string, cards: ScryfallCard[]): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['setCards', 'cards'], 'readwrite')
    const setCardsStore = transaction.objectStore('setCards')
    const cardsStore = transaction.objectStore('cards')

    const cachedSetCards: CachedSetCards = {
      setCode,
      cards,
      cachedAt: Date.now()
    }
    setCardsStore.put(cachedSetCards)

    for (const card of cards) {
      cardsStore.put(card)
    }

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

export async function getCachedCard(cardId: string): Promise<ScryfallCard | null> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('cards', 'readonly')
    const store = transaction.objectStore('cards')
    const request = store.get(cardId)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result ?? null)
  })
}

async function getCardsFromCache(cardIds: string[]): Promise<Map<string, ScryfallCard>> {
  const db = await openDatabase()
  const cardMap = new Map<string, ScryfallCard>()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('cards', 'readonly')
    const store = transaction.objectStore('cards')

    let completed = 0
    for (const id of cardIds) {
      const request = store.get(id)
      request.onsuccess = () => {
        if (request.result) {
          cardMap.set(id, request.result)
        }
        completed++
        if (completed === cardIds.length) {
          resolve(cardMap)
        }
      }
      request.onerror = () => reject(request.error)
    }

    if (cardIds.length === 0) {
      resolve(cardMap)
    }
  })
}

async function fetchCardsByIds(cardIds: string[]): Promise<ScryfallCard[]> {
  const cards: ScryfallCard[] = []

  // Scryfall collection endpoint accepts max 75 cards per request
  const chunks: string[][] = []
  for (let i = 0; i < cardIds.length; i += 75) {
    chunks.push(cardIds.slice(i, i + 75))
  }

  for (const chunk of chunks) {
    const response = await fetch(`${BASE_URL}/cards/collection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        identifiers: chunk.map(id => ({ id }))
      })
    })

    if (!response.ok) {
      console.error('Failed to fetch cards from collection:', response.statusText)
      continue
    }

    const data = await response.json()
    for (const card of data.data) {
      cards.push({
        id: card.id,
        name: card.name,
        collector_number: card.collector_number,
        set: card.set,
        set_name: card.set_name,
        rarity: card.rarity,
        type_line: card.type_line,
        oracle_text: card.oracle_text,
        mana_cost: card.mana_cost,
        cmc: card.cmc,
        colors: card.colors,
        color_identity: card.color_identity,
        power: card.power,
        toughness: card.toughness,
        loyalty: card.loyalty,
        image_uris: card.image_uris,
        card_faces: card.card_faces
      })
    }

    // Rate limiting
    if (chunks.indexOf(chunk) < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  return cards
}

async function cacheCards(cards: ScryfallCard[]): Promise<void> {
  if (cards.length === 0) return

  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('cards', 'readwrite')
    const store = transaction.objectStore('cards')

    for (const card of cards) {
      store.put(card)
    }

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

export async function getCachedCards(cardIds: string[]): Promise<Map<string, ScryfallCard>> {
  if (cardIds.length === 0) {
    return new Map()
  }

  // First try to get from cache
  const cardMap = await getCardsFromCache(cardIds)

  // Find missing cards
  const missingIds = cardIds.filter(id => !cardMap.has(id))

  if (missingIds.length > 0) {
    // Fetch missing cards from API
    const fetchedCards = await fetchCardsByIds(missingIds)

    // Cache them for future use
    await cacheCards(fetchedCards)

    // Add to result map
    for (const card of fetchedCards) {
      cardMap.set(card.id, card)
    }
  }

  return cardMap
}

export async function fetchSets(): Promise<ScryfallSet[]> {
  const cached = await getCachedSets()
  if (cached) {
    return cached
  }

  const response = await fetch(`${BASE_URL}/sets`)
  if (!response.ok) {
    throw new Error(`Failed to fetch sets: ${response.statusText}`)
  }

  const data = await response.json()
  const sets: ScryfallSet[] = data.data.map((set: Record<string, unknown>) => ({
    code: set.code,
    name: set.name,
    released_at: set.released_at,
    set_type: set.set_type,
    card_count: set.card_count,
    icon_svg_uri: set.icon_svg_uri
  }))

  await cacheSets(sets)
  return sets
}

export async function fetchSetCards(setCode: string): Promise<ScryfallCard[]> {
  const cached = await getCachedSetCards(setCode)
  if (cached) {
    return cached
  }

  const cards: ScryfallCard[] = []
  const query = encodeURIComponent(`set:${setCode} include:extras include:variations`)
  let nextUrl: string | null = `${BASE_URL}/cards/search?q=${query}&unique=prints&order=set`

  while (nextUrl) {
    const response = await fetch(nextUrl)
    if (!response.ok) {
      if (response.status === 404) {
        break
      }
      throw new Error(`Failed to fetch cards: ${response.statusText}`)
    }

    const data = await response.json()

    for (const card of data.data) {
      cards.push({
        id: card.id,
        name: card.name,
        collector_number: card.collector_number,
        set: card.set,
        set_name: card.set_name,
        rarity: card.rarity,
        type_line: card.type_line,
        oracle_text: card.oracle_text,
        mana_cost: card.mana_cost,
        cmc: card.cmc,
        colors: card.colors,
        color_identity: card.color_identity,
        power: card.power,
        toughness: card.toughness,
        loyalty: card.loyalty,
        image_uris: card.image_uris,
        card_faces: card.card_faces
      })
    }

    nextUrl = data.has_more ? data.next_page : null

    if (nextUrl) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  await cacheSetCards(setCode, cards)
  return cards
}

export function getCardImageUri(card: ScryfallCard, size: 'small' | 'normal' | 'large' = 'normal'): string | null {
  if (card.image_uris) {
    return card.image_uris[size]
  }
  if (card.card_faces?.[0]?.image_uris) {
    return card.card_faces[0].image_uris[size]
  }
  return null
}

export async function searchCards(query: string): Promise<ScryfallCard[]> {
  if (!query.trim()) return []

  const encodedQuery = encodeURIComponent(query)
  const response = await fetch(`${BASE_URL}/cards/search?q=${encodedQuery}&unique=prints&order=released&dir=asc`)

  if (!response.ok) {
    if (response.status === 404) {
      return [] // No results
    }
    throw new Error(`Failed to search cards: ${response.statusText}`)
  }

  const data = await response.json()
  const cards: ScryfallCard[] = data.data.slice(0, 20).map((card: Record<string, unknown>) => ({
    id: card.id,
    name: card.name,
    collector_number: card.collector_number,
    set: card.set,
    set_name: card.set_name,
    rarity: card.rarity,
    type_line: card.type_line,
    oracle_text: card.oracle_text,
    mana_cost: card.mana_cost,
    cmc: card.cmc,
    colors: card.colors,
    color_identity: card.color_identity,
    power: card.power,
    toughness: card.toughness,
    loyalty: card.loyalty,
    image_uris: card.image_uris as ScryfallCard['image_uris'],
    card_faces: card.card_faces as ScryfallCard['card_faces']
  }))

  // Cache the fetched cards
  await cacheCards(cards)

  return cards
}

export function sortByCollectorNumber(cards: ScryfallCard[]): ScryfallCard[] {
  return [...cards].sort((a, b) => {
    const parseNum = (cn: string): { num: number; suffix: string } => {
      const match = cn.match(/^(\d+)(.*)$/)
      if (match && match[1] !== undefined) {
        return { num: parseInt(match[1], 10), suffix: match[2] ?? '' }
      }
      return { num: Infinity, suffix: cn }
    }

    const aParsed = parseNum(a.collector_number)
    const bParsed = parseNum(b.collector_number)

    if (aParsed.num !== bParsed.num) {
      return aParsed.num - bParsed.num
    }
    return aParsed.suffix.localeCompare(bParsed.suffix)
  })
}
