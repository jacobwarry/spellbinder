<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { usePlansStore, useSegmentsStore, usePricesStore } from '@/stores'
import { getCachedCards, ingestBulkFile, fetchAndCacheCards } from '@/api/scryfall'
import { formatFetchTime } from '@/utils/price'
import { Button } from '@/components/ui/button'
import { Coins, Upload, DownloadCloud } from 'lucide-vue-next'

// The control panel: every action that fetches or imports data lives here, so the rest of
// the app never touches the network automatically. Card data + prices come from the local
// cache; these buttons are the only way to refresh them (short of a bulk file).
const plansStore = usePlansStore()
const segmentsStore = useSegmentsStore()
const pricesStore = usePricesStore()

const hasSets = computed(() => plansStore.plans.length > 0)

// Every unique card id across all sets — the target for batch fetches.
const allSetCardIds = computed(() => {
  const ids = new Set<string>()
  for (const plan of plansStore.plans) {
    for (const seg of segmentsStore.getSegmentsInOrder(plan.segmentIds)) {
      for (const id of seg.cardIds) ids.add(id)
    }
  }
  return [...ids]
})

// ---- Prices ----
const pricedCount = computed(() => Object.keys(pricesStore.prices).length)
const lastPriceFetch = computed(() => formatFetchTime(pricesStore.lastFetchedAt))
function fetchAllPrices() {
  void pricesStore.fetchPricesFor(allSetCardIds.value)
}

// ---- Card-data cache: status readout + the explicit "fetch missing" escape hatch ----
const cardCache = ref<{ cached: number; total: number }>({ cached: 0, total: 0 })
const missingCards = computed(() => Math.max(0, cardCache.value.total - cardCache.value.cached))
const fetchingCards = ref(false)
const cardFetchProgress = ref<{ done: number; total: number } | null>(null)
const cardStatus = ref<string | null>(null)

// Coverage of the Scryfall fields the Cardmarket export depends on, across cached cards.
// `border_color` is on every paper card, so it's the freshness signal — near-100% means a
// recent bulk import; a drop means older cards (e.g. after a price-only refresh) lack the
// fields. `cardmarket_id` is legitimately absent on some cards, so it won't reach 100%.
const fieldCoverage = ref<{ cardmarketId: number; borderColor: number }>({ cardmarketId: 0, borderColor: 0 })
const marketIdPct = computed(() =>
  cardCache.value.cached ? Math.round((100 * fieldCoverage.value.cardmarketId) / cardCache.value.cached) : null
)
const borderColorPct = computed(() =>
  cardCache.value.cached ? Math.round((100 * fieldCoverage.value.borderColor) / cardCache.value.cached) : null
)
const cardmarketFieldsLow = computed(() => borderColorPct.value !== null && borderColorPct.value < 95)

async function refreshCardCache() {
  const ids = allSetCardIds.value
  const map = await getCachedCards(ids) // cache-only read, no network
  cardCache.value = { cached: map.size, total: ids.length }
  let cardmarketId = 0
  let borderColor = 0
  for (const c of map.values()) {
    if (c.cardmarket_id != null) cardmarketId++
    if (c.border_color != null) borderColor++
  }
  fieldCoverage.value = { cardmarketId, borderColor }
}
onMounted(refreshCardCache)

async function fetchCardData() {
  if (fetchingCards.value || missingCards.value === 0) return
  fetchingCards.value = true
  cardStatus.value = null
  cardFetchProgress.value = { done: 0, total: missingCards.value }
  try {
    await fetchAndCacheCards(allSetCardIds.value, (done, total) => {
      cardFetchProgress.value = { done, total }
    })
    await refreshCardCache()
    cardStatus.value = missingCards.value === 0
      ? 'All card data cached.'
      : `${missingCards.value} still missing — Scryfall couldn't resolve them.`
  } catch (err) {
    console.error('Fetch card data failed:', err)
    cardStatus.value = 'Fetch failed.'
  } finally {
    fetchingCards.value = false
    cardFetchProgress.value = null
  }
}

// ---- Bulk import: feed in Scryfall's downloaded "Default Cards" data to refresh card
// data + prices for everything we track, with zero API calls. Parsing/reading lives in
// @/utils/bulkImport (tolerant to JSON / JSON-lines / gzip / UTF-16), and is unit-tested. ----
const fileInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)
const importStatus = ref<string | null>(null)

async function onBulkFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  importing.value = true
  importStatus.value = 'Reading file…'
  try {
    const tracked = new Set(allSetCardIds.value)
    // Stream the file (it's too big to hold as one string); report MB read as it goes.
    let lastMb = -1
    const { cardsUpdated, prices } = await ingestBulkFile(file, tracked, (read, total) => {
      const mb = Math.floor(read / 1_000_000)
      if (mb !== lastMb) {
        lastMb = mb
        importStatus.value = `Reading ${mb} / ${Math.floor(total / 1_000_000)} MB…`
      }
    })
    pricesStore.applyBulkPrices(prices)
    await refreshCardCache()

    const priced = prices.filter(p => p.eur || p.eurFoil).length
    importStatus.value = cardsUpdated === 0
      ? 'No matching cards found. Make sure this is the Default Cards file.'
      : `Updated ${cardsUpdated} card${cardsUpdated === 1 ? '' : 's'} · ${priced} priced.`
  } catch (err) {
    console.error('Bulk import failed:', err)
    importStatus.value = err instanceof Error ? `Import failed: ${err.message}` : 'Import failed.'
  } finally {
    importing.value = false
    input.value = '' // reset now that the read is done, so the same file can be re-picked
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-4xl px-6 py-6 sm:px-8">
    <h1 class="font-display text-2xl font-bold tracking-tight">Control panel</h1>
    <p class="mt-1 text-sm text-ink-soft">Manage the local card cache and pricing data. Nothing here runs automatically.</p>

    <div v-if="!hasSets" class="mt-6 rounded-xl border border-line bg-surface p-6 text-sm text-ink-soft shadow-(--shadow-1)">
      No sets yet — add a set first, then come back to fetch card data and prices.
    </div>

    <template v-else>
      <!-- Card data cache: status + explicit "fetch missing" -->
      <div class="mt-6 grid grid-cols-[1fr_auto] items-center gap-x-8 rounded-xl border border-line bg-surface p-5 shadow-(--shadow-1)">
        <div class="min-w-0 max-w-xl">
          <p class="text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">Card data</p>
          <p class="mt-1 text-sm text-ink-soft">
            Card images and details come from your local cache — the app never fetches them automatically.
            <template v-if="cardCache.total > 0">
              <span class="font-semibold text-ink">{{ cardCache.cached }}</span> of {{ cardCache.total }} cached<template v-if="missingCards > 0">, <span class="font-semibold text-ink">{{ missingCards }}</span> missing</template>.
            </template>
          </p>
          <p v-if="cardStatus" class="mt-2 text-xs tabular-nums text-ink-faint">{{ cardStatus }}</p>
          <p
            v-if="cardCache.cached > 0"
            class="mt-2 text-xs tabular-nums"
            :class="cardmarketFieldsLow ? 'text-skipped' : 'text-ink-faint'"
            title="Fields the Cardmarket export needs: border data (border_color) signals a fresh bulk import; market id (cardmarket_id) drives version suffixes."
          >
            Cardmarket export fields: {{ borderColorPct }}% border data · {{ marketIdPct }}% market id
            <template v-if="cardmarketFieldsLow"> — reimport the bulk file to refresh older cards.</template>
          </p>
        </div>
        <div class="justify-self-end">
          <Button size="sm" variant="secondary" class="min-w-46 tabular-nums" :disabled="fetchingCards || missingCards === 0" @click="fetchCardData">
            <DownloadCloud :size="16" />
            <template v-if="fetchingCards && cardFetchProgress">Fetching {{ cardFetchProgress.done }}/{{ cardFetchProgress.total }}…</template>
            <template v-else-if="missingCards > 0">Fetch {{ missingCards }} missing</template>
            <template v-else>All cached</template>
          </Button>
        </div>
      </div>

      <!-- Prices: batch pull latest EUR prices -->
      <div class="mt-6 grid grid-cols-[1fr_auto] items-center gap-x-8 rounded-xl border border-line bg-surface p-5 shadow-(--shadow-1)">
        <div class="min-w-0 max-w-xl">
          <p class="text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">Prices</p>
          <p class="mt-1 text-sm text-ink-soft">
            Pull the latest EUR prices from Scryfall for every card across your sets.
            <template v-if="pricedCount > 0"><span class="font-semibold text-ink">{{ pricedCount }}</span> cards have stored prices.</template>
          </p>
          <p v-if="lastPriceFetch" class="mt-2 text-xs tabular-nums text-ink-faint">Last fetched {{ lastPriceFetch }}</p>
        </div>
        <div class="justify-self-end">
          <Button size="sm" variant="secondary" class="min-w-46 tabular-nums" :disabled="pricesStore.isFetching || allSetCardIds.length === 0" @click="fetchAllPrices">
            <Coins :size="16" />
            <template v-if="pricesStore.isFetching && pricesStore.fetchProgress">Fetching {{ pricesStore.fetchProgress.done }}/{{ pricesStore.fetchProgress.total }}…</template>
            <template v-else>Fetch all prices</template>
          </Button>
        </div>
      </div>

      <!-- Bulk import: refresh card data + prices from a downloaded Scryfall file -->
      <div class="mt-6 grid grid-cols-[1fr_auto] items-center gap-x-8 rounded-xl border border-line bg-surface p-5 shadow-(--shadow-1)">
        <div class="min-w-0 max-w-xl">
          <p class="text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">Import from Scryfall bulk data</p>
          <p class="mt-1 text-sm text-ink-soft">
            Download the <span class="font-semibold text-ink">Default Cards</span> file from
            <a href="https://scryfall.com/docs/api/bulk-data" target="_blank" rel="noopener" class="font-semibold text-brand hover:underline">Scryfall's bulk data page</a>
            (JSON, JSON-lines, or the raw <span class="font-semibold text-ink">.gz</span>) and feed it in to refresh card data and prices for your whole collection at once. No API calls, so no rate limits.
          </p>
          <p v-if="importStatus" class="mt-2 text-xs tabular-nums text-ink-faint">{{ importStatus }}</p>
        </div>
        <div class="justify-self-end">
          <input ref="fileInput" type="file" accept="application/json,application/x-ndjson,application/gzip,.json,.jsonl,.ndjson,.gz" class="hidden" @change="onBulkFile" />
          <Button size="sm" variant="secondary" class="min-w-46" :disabled="importing || allSetCardIds.length === 0" @click="fileInput?.click()">
            <Upload :size="16" />
            <template v-if="importing">Importing…</template>
            <template v-else>Import bulk file</template>
          </Button>
        </div>
      </div>
    </template>
  </div>
</template>
