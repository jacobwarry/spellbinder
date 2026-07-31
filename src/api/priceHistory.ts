/**
 * Append-only daily price history, in its own IndexedDB database so it can grow large
 * and stays decoupled from the shared `spellbinder-cache` DB (no dual-file DB_VERSION
 * coupling). One point per card per day; recorded on every price fetch. This is the
 * source for price-fluctuation charts — history can't be backfilled, so it only holds
 * what's been captured since the feature shipped.
 */

export interface PricePoint {
  cardId: string
  /** Local calendar day, YYYY-MM-DD. One point per card per day (upserted). */
  date: string
  eur: string | null
  eurFoil: string | null
}

const DB_NAME = 'spellbinder-price-history'
const DB_VERSION = 1
const STORE = 'points'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: ['cardId', 'date'] })
        store.createIndex('cardId', 'cardId', { unique: false })
      }
    }
  })
}

/** Local calendar day (YYYY-MM-DD) for a ms timestamp. */
export function stampFromMs(ms: number): string {
  const d = new Date(ms)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

/** Today's local calendar day as YYYY-MM-DD. */
export function todayStamp(): string {
  return stampFromMs(Date.now())
}

/** Upsert raw points (each carrying its own date). Priceless points are skipped. */
export async function putPoints(points: PricePoint[]): Promise<void> {
  const valid = points.filter(p => p.eur != null || p.eurFoil != null)
  if (valid.length === 0) return

  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    for (const p of valid) store.put(p)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * Upsert one point per card for a single day. Fire-and-forget from the fetch path.
 */
export async function recordPricePoints(
  entries: { cardId: string; eur: string | null; eurFoil: string | null }[],
  date: string
): Promise<void> {
  return putPoints(entries.map(e => ({ cardId: e.cardId, date, eur: e.eur, eurFoil: e.eurFoil })))
}

/** Every recorded point (all cards). Used to build collection-value-over-time. */
export async function getAllPoints(): Promise<PricePoint[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
    request.onsuccess = () => resolve(request.result as PricePoint[])
    request.onerror = () => reject(request.error)
  })
}

/** All recorded points for a card, oldest first — ready to plot. */
export async function getPriceHistory(cardId: string): Promise<PricePoint[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).index('cardId').getAll(IDBKeyRange.only(cardId))
    request.onsuccess = () => {
      const rows = (request.result as PricePoint[]).sort((a, b) => a.date.localeCompare(b.date))
      resolve(rows)
    }
    request.onerror = () => reject(request.error)
  })
}
