import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { fetchPricesByIds, type CardPrice } from '@/api/scryfall'
import { recordPricePoints, putPoints, stampFromMs, todayStamp } from '@/api/priceHistory'

const STORAGE_KEY = 'spellbinder-prices'
// Set once the existing snapshot has been seeded into the history log.
const HISTORY_SEEDED_KEY = 'spellbinder-prices-history-seeded'

/** A cached price record for one printing, with the time it was retrieved. */
export interface StoredPrice {
  eur: string | null
  eurFoil: string | null
  fetchedAt: number
}

type PriceMap = Record<string, StoredPrice>

function loadFromStorage(): PriceMap {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored ? JSON.parse(stored) : {}
}

function saveToStorage(prices: PriceMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prices))
}

/**
 * One-time backfill: seed the history log from the current snapshot so previously
 * fetched prices become the baseline series (one point per card at its last-fetch
 * date). Only runs until it succeeds; live fetches record history from then on.
 */
function seedHistoryOnce(snapshot: PriceMap): void {
  if (localStorage.getItem(HISTORY_SEEDED_KEY)) return
  const points = Object.entries(snapshot).map(([cardId, p]) => ({
    cardId,
    date: stampFromMs(p.fetchedAt),
    eur: p.eur,
    eurFoil: p.eurFoil
  }))
  putPoints(points)
    .then(() => localStorage.setItem(HISTORY_SEEDED_KEY, '1'))
    .catch(err => console.error('Failed to seed price history:', err))
}

/**
 * On-demand cache of Scryfall EUR prices, keyed by card id. Kept separate from the
 * IndexedDB card cache (which never refetches) so daily prices stay refreshable, and
 * out of IndexedDB to avoid the dual-file DB_VERSION bump. Populated only when the
 * user clicks "Fetch prices"; display reads whatever is present.
 */
export const usePricesStore = defineStore('prices', () => {
  const prices = ref<PriceMap>(loadFromStorage())
  const isFetching = ref(false)
  // Progress for larger batch fetches: { done, total } cards; null when idle.
  const fetchProgress = ref<{ done: number; total: number } | null>(null)

  // Capture whatever's already been fetched as the history baseline.
  seedHistoryOnce(prices.value)

  function getPrice(cardId: string): StoredPrice | undefined {
    return prices.value[cardId]
  }

  const hasAny = computed(() => Object.keys(prices.value).length > 0)

  // Most recent fetch time across all stored prices — drives the "last fetched" note.
  const lastFetchedAt = computed<number | null>(() => {
    let max = 0
    for (const p of Object.values(prices.value)) {
      if (p.fetchedAt > max) max = p.fetchedAt
    }
    return max || null
  })

  async function fetchPricesFor(cardIds: string[]): Promise<void> {
    const unique = [...new Set(cardIds)].filter(Boolean)
    if (unique.length === 0 || isFetching.value) return

    isFetching.value = true
    fetchProgress.value = { done: 0, total: unique.length }
    try {
      const results = await fetchPricesByIds(unique, (done, total) => {
        fetchProgress.value = { done, total }
      })
      const fetchedAt = Date.now()
      const next = { ...prices.value }
      for (const r of results) {
        next[r.id] = { eur: r.eur, eurFoil: r.eurFoil, fetchedAt }
      }
      prices.value = next
      saveToStorage(prices.value)
      // Append to the daily history log (fire-and-forget; charts read from here).
      void recordPricePoints(
        results.map(r => ({ cardId: r.id, eur: r.eur, eurFoil: r.eurFoil })),
        todayStamp()
      )
    } catch (error) {
      console.error('Failed to fetch prices:', error)
    } finally {
      isFetching.value = false
      fetchProgress.value = null
    }
  }

  /**
   * Merge prices extracted from a bulk import (see `ingestBulkCards`). Same effect as a
   * live fetch — snapshot updated, persisted, and a daily history point recorded — but
   * without any network call, since the data came from the user's downloaded bulk file.
   */
  function applyBulkPrices(results: CardPrice[]): void {
    if (results.length === 0) return
    const fetchedAt = Date.now()
    const next = { ...prices.value }
    for (const r of results) {
      next[r.id] = { eur: r.eur, eurFoil: r.eurFoil, fetchedAt }
    }
    prices.value = next
    saveToStorage(prices.value)
    void recordPricePoints(
      results.map(r => ({ cardId: r.id, eur: r.eur, eurFoil: r.eurFoil })),
      todayStamp()
    )
  }

  return {
    prices,
    isFetching,
    fetchProgress,
    hasAny,
    lastFetchedAt,
    getPrice,
    fetchPricesFor,
    applyBulkPrices
  }
})
