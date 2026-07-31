import { ref, watch } from 'vue'
import { getAllPoints, type PricePoint } from '@/api/priceHistory'
import { usePricesStore } from '@/stores'

// Shared, module-level price-history state so it persists across route changes. Loaded once
// from IndexedDB on first use, then reloaded whenever the price snapshot changes (a fetch or
// bulk import records new points). Without this, every mount of a history-backed view (the
// dashboard chart + movers) starts empty and flashes its "not enough history" placeholder
// before the async read resolves. Call `reload()` to force a re-read.
const points = ref<PricePoint[]>([])
let started = false

async function reload(): Promise<void> {
  try {
    points.value = await getAllPoints()
  } catch {
    points.value = []
  }
}

export function usePriceHistory() {
  if (!started) {
    started = true
    void reload()
    const pricesStore = usePricesStore()
    watch(() => pricesStore.prices, () => { void reload() })
  }
  return { points, reload }
}
