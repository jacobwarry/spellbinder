<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAllPlacements, sumPlacementsValue } from '@/composables/useAllPlacements'
import { usePriceHistory } from '@/composables/usePriceHistory'
import { useBindersStore, usePlansStore, useCollectionStore, usePricesStore } from '@/stores'
import { getPlacementOwnershipKey } from '@/types/placement'
import { buildValueSeries, computePriceMovers, coverageLabel, missingCoverageLabel, type PriceMover } from '@/utils/value'
import { formatEurAmount } from '@/utils/price'
import { getCardImageUri } from '@/api/scryfall'
import type { ScryfallCard } from '@/types'
import { ArrowRight, RefreshCw } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/segmented'
import SetStats from '@/components/sets/SetStats.vue'
import ValueTrendChart from '@/components/dashboard/ValueTrendChart.vue'

// Read-only overview. All the data-fetching actions live in the control panel (/config).
const router = useRouter()
const bindersStore = useBindersStore()
const plansStore = usePlansStore()
const collectionStore = useCollectionStore()
const pricesStore = usePricesStore()

const hasSets = computed(() => plansStore.plans.length > 0)

const { allPlacements, recalculate } = useAllPlacements()
const allPlacementsFlat = computed(() => [...allPlacements.value.values()].flatMap(r => r.placements))
const allBinders = computed(() => bindersStore.binders)

const getPrice = (id: string) => pricesStore.getPrice(id)
const ownedNonFoil = (k: string) => collectionStore.isOwnedNonFoil(k)
const ownedFoil = (k: string) => collectionStore.isOwnedFoil(k)
const skipped = (k: string) => collectionStore.isSkipped(k)

// Global owned value + cost to complete across every set.
const totalValue = computed(() =>
  sumPlacementsValue(allPlacementsFlat.value, getPrice, ownedNonFoil, ownedFoil, skipped)
)

// Current owned finishes per placement — the weights for the value-over-time chart.
const ownedContribs = computed(() =>
  allPlacementsFlat.value
    .map(p => {
      const k = getPlacementOwnershipKey(p)
      return { cardId: p.card.id, ownsNonFoil: ownedNonFoil(k), ownsFoil: ownedFoil(k) }
    })
    .filter(o => o.ownsNonFoil || o.ownsFoil)
)

// Price history (shared singleton) — persists across navigation and reloads on price changes.
const { points: historyPoints, reload: reloadHistory } = usePriceHistory()

// Manual refresh: re-resolve placements from the (possibly updated) card cache and reload
// price history. Everything else derives reactively. Placements + history otherwise persist
// across navigation, so this is the way to pull in changes made in the control panel.
const refreshing = ref(false)
async function refresh() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await Promise.all([recalculate(), reloadHistory()])
  } finally {
    refreshing.value = false
  }
}

const valueSeries = computed(() => buildValueSeries(historyPoints.value, ownedContribs.value))

// --- Biggest price movers -------------------------------------------------------------
// Card metadata for the movers list (first placement per card id wins), and the movers
// themselves, filtered to cards still in the collection.
const cardMeta = computed(() => {
  const m = new Map<string, ScryfallCard>()
  for (const p of allPlacementsFlat.value) if (!m.has(p.card.id)) m.set(p.card.id, p.card)
  return m
})
const movers = computed(() => computePriceMovers(historyPoints.value).filter(mv => cardMeta.value.has(mv.cardId)))
// Distinct days of recorded history — decides "not enough history" vs "no movement".
const historyDays = computed(() => new Set(historyPoints.value.map(p => p.date)).size)

// Owned finishes per card id, aggregated across placements (ownership is positional, so a
// card id owned in any position counts). Drives the "Owned only" movers filter.
const ownedByCard = computed(() => {
  const m = new Map<string, { nonfoil: boolean; foil: boolean }>()
  for (const p of allPlacementsFlat.value) {
    const k = getPlacementOwnershipKey(p)
    const nf = ownedNonFoil(k)
    const f = ownedFoil(k)
    if (!nf && !f) continue
    const e = m.get(p.card.id) ?? { nonfoil: false, foil: false }
    e.nonfoil ||= nf
    e.foil ||= f
    m.set(p.card.id, e)
  }
  return m
})

const moverView = ref<'gainers' | 'losers'>('gainers')
const ownedOnly = ref(true)
const MOVER_OPTIONS = [
  { value: 'gainers' as const, label: 'Gainers' },
  { value: 'losers' as const, label: 'Losers' }
]

// Optionally restrict to cards owned in the mover's finish.
const scopedMovers = computed(() => {
  if (!ownedOnly.value) return movers.value
  return movers.value.filter(mv => {
    const o = ownedByCard.value.get(mv.cardId)
    return o ? (mv.finish === 'foil' ? o.foil : o.nonfoil) : false
  })
})

interface MoverRow extends PriceMover {
  name: string
  set: string
  number: string
  image?: string
}
const topMovers = computed<MoverRow[]>(() => {
  // `scopedMovers` keeps `movers`' delta-desc order: gainers at the head, losers at the tail.
  const src = moverView.value === 'gainers'
    ? scopedMovers.value.filter(m => m.delta > 0).slice(0, 8)
    : scopedMovers.value.filter(m => m.delta < 0).slice(-8).reverse()
  return src.map(m => {
    const c = cardMeta.value.get(m.cardId)!
    return { ...m, name: c.name, set: c.set.toUpperCase(), number: c.collector_number, image: getCardImageUri(c, 'small') ?? undefined }
  })
})

const moversEmptyMessage = computed(() => {
  if (historyDays.value < 2) {
    return "Not enough price history yet — movers appear once you've recorded prices on two different days."
  }
  if (movers.value.length === 0) {
    return 'No price changes recorded across your history yet.'
  }
  const side = moverView.value === 'gainers' ? 'gainers' : 'losers'
  return ownedOnly.value ? `No owned ${side} right now.` : `No ${side} right now.`
})
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-6 py-6 sm:px-8">
    <div class="flex items-center justify-between gap-3">
      <h1 class="font-display text-2xl font-bold tracking-tight">Dashboard</h1>
      <Button v-if="hasSets" variant="secondary" size="sm" :disabled="refreshing" @click="refresh">
        <RefreshCw :size="16" :class="refreshing && 'animate-spin'" />
        Refresh
      </Button>
    </div>

    <div v-if="!hasSets" class="mt-6 rounded-xl border border-line bg-surface p-6 text-sm text-ink-soft shadow-(--shadow-1)">
      No sets yet.
      <button class="font-semibold text-brand hover:underline" @click="router.push('/sets?create=true')">Create your first set</button>
      to start tracking value.
    </div>

    <template v-else>
      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <!-- Left: total value + value over time (one card) -->
        <div class="flex flex-col rounded-xl border border-line bg-surface p-5 shadow-(--shadow-1)">
          <!-- Global value + cost to complete -->
          <div class="flex flex-wrap items-end gap-x-8 gap-y-3">
            <div class="min-w-0">
              <p class="text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">Total collection value</p>
              <p v-if="totalValue.pricedCount > 0" class="mt-1 font-display text-3xl font-bold tabular-nums text-brand">{{ formatEurAmount(totalValue.value) }}</p>
              <p v-else class="mt-1 text-sm text-ink-faint">Fetch prices in the control panel to start valuing your collection.</p>
            </div>
            <div v-if="totalValue.missingPricedCount > 0" class="min-w-0" :title="missingCoverageLabel(totalValue) ?? undefined">
              <p class="text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">Cost to complete</p>
              <p class="mt-1 font-display text-2xl font-bold tabular-nums text-ink-faint">{{ formatEurAmount(totalValue.missingValue) }}</p>
            </div>
            <p v-if="totalValue.pricedCount > 0" class="w-full text-xs text-ink-faint tabular-nums" :title="coverageLabel(totalValue) ?? undefined">
              {{ totalValue.pricedCount }} priced · {{ totalValue.ownedCount }} owned
            </p>
          </div>

          <!-- Collection value over time (compact sparkline pinned to the card's bottom) -->
          <div class="mt-auto pt-5">
            <h2 class="text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">Value over time</h2>
            <div class="mt-3 h-36">
              <ValueTrendChart :series="valueSeries" />
            </div>
          </div>
        </div>

        <!-- Right: biggest price movers (click a row for card details) -->
        <div class="rounded-xl border border-line bg-surface p-5 shadow-(--shadow-1)">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">Biggest movers</h2>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors"
                :class="ownedOnly ? 'border-brand text-brand' : 'border-line text-ink-soft hover:border-line-strong hover:text-foreground'"
                :aria-pressed="ownedOnly"
                @click="ownedOnly = !ownedOnly"
              >Owned only</button>
              <SegmentedControl v-model="moverView" :options="MOVER_OPTIONS" />
            </div>
          </div>
          <div v-if="topMovers.length" class="flex max-h-88 flex-col overflow-y-auto">
            <RouterLink
              v-for="m in topMovers"
              :key="`${m.cardId}:${m.finish}`"
              :to="`/card/${m.cardId}`"
              class="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface-2"
            >
              <div class="aspect-63/88 w-9 shrink-0 overflow-hidden rounded bg-surface-2">
                <img v-if="m.image" :src="m.image" :alt="m.name" loading="lazy" class="h-full w-full object-cover" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold">{{ m.name }}</p>
                <p class="truncate text-[11px] tabular-nums text-ink-faint">
                  {{ m.set }} · {{ m.number }}<template v-if="m.finish === 'foil'"> · <span class="text-brand">FOIL</span></template>
                </p>
              </div>
              <div class="shrink-0 text-right tabular-nums">
                <p class="text-sm font-bold" :style="{ color: m.delta >= 0 ? 'var(--owned)' : 'var(--skipped)' }">
                  {{ m.delta >= 0 ? '+' : '−' }}{{ formatEurAmount(Math.abs(m.delta)) }}
                  <span class="text-[11px] font-semibold">({{ m.delta >= 0 ? '+' : '−' }}{{ Math.round(Math.abs(m.pct) * 100) }}%)</span>
                </p>
                <p class="text-[11px] text-ink-faint">{{ formatEurAmount(m.from) }} → {{ formatEurAmount(m.to) }}</p>
              </div>
            </RouterLink>
          </div>
          <p v-else class="text-sm text-ink-faint">{{ moversEmptyMessage }}</p>
        </div>
      </div>

      <!-- Most valuable cards across every set -->
      <div class="mt-6 rounded-xl border border-line bg-surface p-5 shadow-(--shadow-1)">
        <h2 class="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">
          Cards across all sets
          <RouterLink to="/sets" class="flex items-center gap-1 font-semibold normal-case tracking-normal text-brand hover:underline">
            Manage sets <ArrowRight :size="13" />
          </RouterLink>
        </h2>
        <SetStats :placements="allPlacementsFlat" :binders="allBinders" />
      </div>
    </template>
  </div>
</template>
