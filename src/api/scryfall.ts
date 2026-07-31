import type { ScryfallSet, ScryfallCard } from '@/types'
import { streamBulkCards } from '@/utils/bulkImport'

const BASE_URL = 'https://api.scryfall.com'
const DB_NAME = 'spellbinder-cache'
const DB_VERSION = 2 // Updated to match binderImages.ts

interface CachedSetCards {
  setCode: string
  cards: ScryfallCard[]
  cachedAt: number
}

/**
 * Field-map a raw Scryfall card into our stored `ScryfallCard`. We deliberately store
 * a mapped subset rather than the raw object, so every ingest path (collection fetch,
 * set search, single-card refresh) funnels through here. If you need a new Scryfall
 * field, add it to the `ScryfallCard` type and to this one function.
 */
function mapScryfallCard(card: Record<string, unknown>): ScryfallCard {
  return {
    id: card.id,
    oracle_id: card.oracle_id,
    name: card.name,
    collector_number: card.collector_number,
    set: card.set,
    set_name: card.set_name,
    rarity: card.rarity,
    type_line: card.type_line,
    layout: card.layout,
    cardmarket_id: card.cardmarket_id,
    border_color: card.border_color,
    frame_effects: card.frame_effects,
    finishes: card.finishes,
    promo_types: card.promo_types,
    purchase_uris: card.purchase_uris,
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
  } as ScryfallCard
}

// ---- Global request pacing + backoff -------------------------------------------------
// Scryfall asks for ~10 requests/second max (50-100ms between requests). Several views
// resolve card data on load, so a per-call throttle isn't enough — concurrent callers
// still burst past the limit and earn 429s (which, lacking CORS headers, surface in the
// browser as network errors / "CORS" failures). Route EVERY Scryfall request through one
// serialized gate so the whole app shares a single ≤10 req/s budget.
const MIN_REQUEST_GAP_MS = 110
const MAX_RETRIES = 3
let requestGate: Promise<unknown> = Promise.resolve()

function scheduleRequest<T>(task: () => Promise<T>): Promise<T> {
  const run = requestGate.then(task, task)
  // The next request starts MIN_REQUEST_GAP_MS after this one settles (ok or error).
  requestGate = run.then(
    () => new Promise((r) => setTimeout(r, MIN_REQUEST_GAP_MS)),
    () => new Promise((r) => setTimeout(r, MIN_REQUEST_GAP_MS))
  )
  return run
}

/**
 * Fetch a Scryfall URL through the global rate gate, retrying on 429 / network error with
 * exponential backoff (honoring a `Retry-After` header when present). Returns null once
 * retries are exhausted so callers can degrade to cached data instead of throwing — and,
 * crucially, so a rate-limited chunk isn't silently dropped and re-fetched on every reload.
 */
async function scryfallFetch(input: string, init?: RequestInit): Promise<Response | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await scheduleRequest(() => fetch(input, init))
      if (res.status === 429) {
        if (attempt === MAX_RETRIES) return res
        const retryAfter = Number(res.headers.get('Retry-After'))
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt
        await new Promise((r) => setTimeout(r, wait))
        continue
      }
      return res
    } catch (err) {
      // A 429 whose response lacks CORS headers rejects here as a TypeError; back off too.
      if (attempt === MAX_RETRIES) {
        console.error('Scryfall request failed:', err)
        return null
      }
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
    }
  }
  return null
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

      // Add binderImages store (for v2 upgrade)
      if (!db.objectStoreNames.contains('binderImages')) {
        db.createObjectStore('binderImages', { keyPath: 'binderId' })
      }
    }
  })
}

/** A cached set record carries a `cachedAt` stamp alongside the set fields. */
type CachedSet = ScryfallSet & { cachedAt?: number }

async function getCachedSets(): Promise<{ sets: ScryfallSet[]; cachedAt: number } | null> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('sets', 'readonly')
    const store = transaction.objectStore('sets')
    const request = store.getAll()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const rows = request.result as CachedSet[]
      if (rows.length === 0) {
        resolve(null)
        return
      }
      // All rows are written in one batch, so any row's stamp is the list's age.
      const cachedAt = rows[0]?.cachedAt ?? 0
      const sets = rows.map((row) => {
        const set = { ...row }
        delete (set as CachedSet).cachedAt
        return set as ScryfallSet
      })
      resolve({ sets, cachedAt })
    }
  })
}

async function cacheSets(sets: ScryfallSet[]): Promise<void> {
  const db = await openDatabase()
  const cachedAt = Date.now()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('sets', 'readwrite')
    const store = transaction.objectStore('sets')

    for (const set of sets) {
      store.put({ ...set, cachedAt })
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

async function fetchCardsByIds(
  cardIds: string[],
  onProgress?: (done: number, total: number) => void
): Promise<ScryfallCard[]> {
  const cards: ScryfallCard[] = []
  let done = 0

  // Scryfall collection endpoint accepts max 75 cards per request. Pacing between chunks
  // is handled by the shared request gate (scryfallFetch), not a local delay.
  for (let i = 0; i < cardIds.length; i += 75) {
    const chunk = cardIds.slice(i, i + 75)
    const response = await scryfallFetch(`${BASE_URL}/cards/collection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: chunk.map(id => ({ id })) })
    })

    if (response && response.ok) {
      const data = await response.json()
      for (const card of data.data) {
        cards.push(mapScryfallCard(card))
      }
    } else {
      console.error('Failed to fetch cards from collection:', response?.statusText ?? 'no response')
    }

    done += chunk.length
    onProgress?.(done, cardIds.length)
  }

  return cards
}

// Per-id in-flight fetches, so concurrent callers (multiple views resolving placements on
// the same load) share one network batch per card instead of each re-requesting the same
// ids. Entries clear as soon as they settle, handing subsequent reads back to the cache.
const inFlightCards = new Map<string, Promise<ScryfallCard | null>>()

function fetchCardsCoalesced(cardIds: string[]): Promise<ScryfallCard[]> {
  const need = cardIds.filter(id => !inFlightCards.has(id))
  if (need.length > 0) {
    const batch = fetchCardsByIds(need).then(cards => new Map(cards.map(c => [c.id, c] as const)))
    for (const id of need) {
      const p = batch.then(m => m.get(id) ?? null)
      inFlightCards.set(id, p)
      void p.finally(() => {
        if (inFlightCards.get(id) === p) inFlightCards.delete(id)
      })
    }
  }
  return Promise.all(cardIds.map(id => inFlightCards.get(id) ?? Promise.resolve(null)))
    .then(cards => cards.filter((c): c is ScryfallCard => c !== null))
}

/** Latest EUR pricing for a single printing. Values are strings (Scryfall's format) or null. */
export interface CardPrice {
  id: string
  eur: string | null
  eurFoil: string | null
}

/**
 * Fetch current EUR prices for the given card ids via the collection endpoint.
 * Deliberately independent of the card cache: Scryfall refreshes prices daily and
 * discourages caching them, so prices are fetched on demand and stored separately
 * (see the prices store) rather than frozen into the cached ScryfallCard objects.
 */
export async function fetchPricesByIds(
  cardIds: string[],
  onProgress?: (done: number, total: number) => void
): Promise<CardPrice[]> {
  const prices: CardPrice[] = []

  // Scryfall collection endpoint accepts max 75 cards per request
  const chunks: string[][] = []
  for (let i = 0; i < cardIds.length; i += 75) {
    chunks.push(cardIds.slice(i, i + 75))
  }

  let done = 0
  for (const chunk of chunks) {
    const response = await scryfallFetch(`${BASE_URL}/cards/collection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: chunk.map(id => ({ id })) })
    })
    if (response && response.ok) {
      const data = await response.json()
      for (const card of data.data) {
        prices.push({
          id: card.id,
          eur: card.prices?.eur ?? null,
          eurFoil: card.prices?.eur_foil ?? null
        })
      }
    } else {
      console.error('Failed to fetch prices from collection:', response?.statusText ?? 'no response')
    }

    done += chunk.length
    onProgress?.(done, cardIds.length)
  }

  return prices
}

/** Write refreshed card data into the cache: the flat `cards` store, plus any already-
 *  cached per-set lists (leaving uncached sets untouched so a partial list can't masquerade
 *  as complete). Shared by the bulk-import path. */
async function persistBulkCards(mapped: ScryfallCard[]): Promise<void> {
  if (mapped.length === 0) return

  const db = await openDatabase()

  // 1. Refresh the flat cards store — what the placement/value paths read through.
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('cards', 'readwrite')
    const store = tx.objectStore('cards')
    for (const c of mapped) store.put(c)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })

  // 2. Patch any already-cached per-set lists so the set browser stays in sync.
  const bySet = new Map<string, ScryfallCard[]>()
  for (const c of mapped) {
    const arr = bySet.get(c.set) ?? []
    arr.push(c)
    bySet.set(c.set, arr)
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('setCards', 'readwrite')
    const store = tx.objectStore('setCards')
    for (const [setCode, updates] of bySet) {
      const req = store.get(setCode)
      req.onsuccess = () => {
        const cached = req.result as CachedSetCards | undefined
        if (!cached) return
        const byId = new Map(updates.map(c => [c.id, c]))
        cached.cards = cached.cards.map(c => byId.get(c.id) ?? c)
        store.put(cached)
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * Ingest a downloaded Scryfall **Default Cards** bulk file (the daily dump the user grabs by
 * hand). Streams the file — it's ~500 MB+, past V8's max string length, so it can't be read
 * whole — emitting one card object at a time; keeps only the ids we actually track, refreshes
 * their cached card data, and returns the extracted EUR prices for the price store. This is
 * the zero-API-call path: feeding in the bulk file replaces hammering the collection endpoint
 * (which Scryfall rate-limits, 429). Handles JSON / JSON-lines / gzip / UTF-16 transparently.
 */
export async function ingestBulkFile(
  file: File,
  trackedIds: Set<string>,
  onProgress?: (bytesRead: number, totalBytes: number) => void
): Promise<{ cardsUpdated: number; prices: CardPrice[] }> {
  const mapped: ScryfallCard[] = []
  const prices: CardPrice[] = []

  await streamBulkCards(file, (raw) => {
    const card = raw as Record<string, unknown>
    const id = card.id as string | undefined
    if (!id || !trackedIds.has(id)) return
    mapped.push(mapScryfallCard(card))
    const p = card.prices as { eur?: string | null; eur_foil?: string | null } | undefined
    prices.push({ id, eur: p?.eur ?? null, eurFoil: p?.eur_foil ?? null })
  }, onProgress)

  await persistBulkCards(mapped)
  return { cardsUpdated: mapped.length, prices }
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

/**
 * Read card data from the local cache **only** — never touches the network. This is the
 * default for every automatic / display path (placement, binder view, deck view, home),
 * so loading or reloading the app makes zero Scryfall calls. Cards missing from the cache
 * are simply absent from the result; populate the cache by adding a set, importing a
 * decklist, or feeding in a Scryfall bulk file.
 */
export async function getCachedCards(cardIds: string[]): Promise<Map<string, ScryfallCard>> {
  if (cardIds.length === 0) {
    return new Map()
  }
  return getCardsFromCache(cardIds)
}

/**
 * Read-through fetch: returns cached cards and fetches + caches any that are missing.
 * Reserved for **explicit, user-initiated** imports (decklist / Archidekt deck). Never
 * call this from a load or display path, or the app will make automatic Scryfall requests
 * again. Fetches are globally rate-limited and coalesced (see `fetchCardsCoalesced`).
 */
export async function fetchAndCacheCards(
  cardIds: string[],
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, ScryfallCard>> {
  if (cardIds.length === 0) {
    return new Map()
  }

  const cardMap = await getCardsFromCache(cardIds)
  const missingIds = cardIds.filter(id => !cardMap.has(id))

  if (missingIds.length > 0) {
    // A progress callback signals a deliberate bulk action (the control panel), so fetch
    // directly for per-chunk progress; otherwise coalesce with any concurrent import.
    const fetchedCards = onProgress
      ? await fetchCardsByIds(missingIds, onProgress)
      : await fetchCardsCoalesced(missingIds)
    await cacheCards(fetchedCards)
    for (const card of fetchedCards) {
      cardMap.set(card.id, card)
    }
  }

  return cardMap
}

/**
 * Replace the matching card inside its set's cached `setCards` list, if that set is
 * cached. Keeps the set browser in sync after a single-card refresh; a no-op otherwise.
 */
async function updateCardInSetCache(card: ScryfallCard): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('setCards', 'readwrite')
    const store = transaction.objectStore('setCards')
    const request = store.get(card.set)

    request.onsuccess = () => {
      const cached = request.result as CachedSetCards | undefined
      if (!cached) {
        resolve()
        return
      }
      const idx = cached.cards.findIndex(c => c.id === card.id)
      if (idx === -1) {
        resolve()
        return
      }
      cached.cards[idx] = card
      store.put(cached)
    }
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

/**
 * Force-refetch a single card from Scryfall, bypassing the read-through cache, and
 * overwrite the cached copy (both the `cards` store and its set's `setCards` list).
 * Use when cached data has gone stale — e.g. Scryfall reissued the card's image URLs.
 * Returns the refreshed card, or null if Scryfall no longer returns it.
 */
export async function refreshCard(cardId: string): Promise<ScryfallCard | null> {
  const [card] = await fetchCardsByIds([cardId])
  if (!card) return null

  await cacheCards([card])
  await updateCardInSetCache(card)
  return card
}

/**
 * Return the full sets list. Serves any cached copy **without touching the network** — the
 * list is otherwise write-once, so a page load never fetches it. Pass `forceRefresh` for
 * an explicit "refresh sets" action; a fetch also happens once when nothing is cached yet
 * (first run). On a network failure we fall back to any cached copy rather than throwing.
 */
export async function fetchSets(forceRefresh = false): Promise<ScryfallSet[]> {
  const cached = await getCachedSets()
  if (cached && !forceRefresh) {
    return cached.sets
  }

  const response = await scryfallFetch(`${BASE_URL}/sets`)
  if (!response || !response.ok) {
    if (cached) return cached.sets
    throw new Error(`Failed to fetch sets: ${response?.statusText ?? 'no response'}`)
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
    const response = await scryfallFetch(nextUrl)
    if (!response || !response.ok) {
      if (response?.status === 404) {
        break
      }
      throw new Error(`Failed to fetch cards: ${response?.statusText ?? 'no response'}`)
    }

    const data = await response.json()

    for (const card of data.data) {
      cards.push(mapScryfallCard(card))
    }

    nextUrl = data.has_more ? data.next_page : null
  }

  await cacheSetCards(setCode, cards)
  return cards
}

/**
 * True for cards whose two faces each carry their own image (transform / modal DFCs).
 * Split, adventure and flip cards have `card_faces` but a single shared image, so they
 * report false — only cards with a genuinely distinct backside qualify.
 */
export function isDoubleFaced(card: ScryfallCard): boolean {
  return !!card.card_faces?.[1]?.image_uris
}

/** Display name for a given face (falls back to the card name for face 0 / single-faced). */
export function getCardFaceName(card: ScryfallCard, face: number = 0): string {
  return card.card_faces?.[face]?.name ?? card.name
}

export function getCardImageUri(
  card: ScryfallCard,
  size: 'small' | 'normal' | 'large' = 'normal',
  face: number = 0
): string | null {
  // Back face (only meaningful for double-faced cards with per-face images).
  if (face === 1 && card.card_faces?.[1]?.image_uris) {
    return card.card_faces[1].image_uris[size]
  }
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
  const cards: ScryfallCard[] = []
  // Page through every result (Scryfall returns up to 175/page) so the picker shows
  // the full match set, not just the first page. Throttle between pages per their API.
  let nextUrl: string | null = `${BASE_URL}/cards/search?q=${encodedQuery}&unique=prints&order=released&dir=asc`

  while (nextUrl) {
    const response = await scryfallFetch(nextUrl)
    if (!response || !response.ok) {
      if (response?.status === 404) {
        return cards // No (more) results
      }
      throw new Error(`Failed to search cards: ${response?.statusText ?? 'no response'}`)
    }

    const data = await response.json()
    for (const card of data.data) {
      cards.push(mapScryfallCard(card))
    }

    nextUrl = data.has_more ? data.next_page : null
  }

  // Cache the fetched cards
  await cacheCards(cards)

  return cards
}

// Session memo of printing lists, keyed by the search query, so clicking through a
// card's printings (which all share one query) doesn't re-hit Scryfall each hop.
const printingsMemo = new Map<string, ScryfallCard[]>()

/**
 * Every printing of the given card, newest-set-first. Groups by `oracle_id` when present
 * (the precise, canonical grouping); falls back to an exact-name search for cards cached
 * before that field was tracked. Result includes the card itself — callers filter it out.
 * Individual printings are cached by `searchCards`; the list is memoized for the session.
 */
export async function getOtherPrintings(card: ScryfallCard): Promise<ScryfallCard[]> {
  const query = card.oracle_id ? `oracleid:${card.oracle_id}` : `!"${card.name}"`
  const cached = printingsMemo.get(query)
  if (cached) return cached

  const results = await searchCards(query)
  printingsMemo.set(query, results)
  return results
}

// Orders collector numbers numerically, keeping any non-numeric suffix (e.g. the
// 'a'/'b' on split printings) as a stable tiebreak; purely non-numeric numbers
// sort last.
export function compareCollectorNumber(a: ScryfallCard, b: ScryfallCard): number {
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
}

export function sortByCollectorNumber(cards: ScryfallCard[]): ScryfallCard[] {
  return [...cards].sort(compareCollectorNumber)
}
