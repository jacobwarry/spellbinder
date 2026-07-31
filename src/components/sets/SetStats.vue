<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Binder } from '@/types'
import { getPlacementOwnershipKey, type CardPlacement } from '@/types/placement'
import { useCollectionStore, usePricesStore, usePlansStore } from '@/stores'
import { getCardImageUri } from '@/api/scryfall'
import { formatEurAmount } from '@/utils/price'
import { specialFinishLabel } from '@/utils/finish'
import { SegmentedControl } from '@/components/ui/segmented'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

// A searchable, filterable value grid of the set's cards, sorted by value desc so
// the biggest hits (or the biggest you're missing) surface first. Each owned finish
// is its own tile — a card owned in both non-foil and foil shows twice, priced apart.
const props = defineProps<{
  placements: CardPlacement[]
  binders: Binder[]
}>()

const collectionStore = useCollectionStore()
const pricesStore = usePricesStore()
const plansStore = usePlansStore()

// Group the storage options under their set name, so binders spanning multiple
// sets (e.g. on the dashboard) are easy to tell apart.
const binderGroups = computed(() => {
  const groups = new Map<string, { key: string; label: string; binders: Binder[] }>()
  for (const b of props.binders) {
    const plan = plansStore.plans.find(p => p.binderIds.includes(b.id))
    const key = plan?.id ?? 'other'
    const label = plan?.name ?? 'Other'
    const g = groups.get(key) ?? { key, label, binders: [] }
    g.binders.push(b)
    groups.set(key, g)
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label))
})

// Owned by default; Missing lists everything not owned and not skipped. (No "all"/"skipped".)
type Filter = 'owned' | 'missing'
const filter = ref<Filter>('owned')
// Storage filter: '' = all, a binder id = that binder, or `set:<planId>` = a whole set.
const storage = ref<string>('')
const search = ref('')

const selectedBinderIds = computed<Set<string> | null>(() => {
  const v = storage.value
  if (!v) return null
  if (v.startsWith('set:')) {
    const g = binderGroups.value.find(grp => grp.key === v.slice(4))
    return new Set(g?.binders.map(b => b.id) ?? [])
  }
  return new Set([v])
})

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'owned', label: 'Owned' },
  { value: 'missing', label: 'Missing' }
]

// How many tiles to render, biggest-value first.
const LIMITS = [100, 250, 500, 1000]
const limit = ref(100)

interface Entry {
  key: string
  cardId: string
  name: string
  set: string
  number: string
  image?: string
  foil: boolean // an owned-foil tile — gets the iridescent frame like the binder
  finishLabel: string | null // special foil treatment (Surge, Etched, …) if any
  value: number
  priced: boolean
}

const entries = computed<Entry[]>(() => {
  const q = search.value.trim().toLowerCase()
  const out: Entry[] = []
  for (const p of props.placements) {
    if (selectedBinderIds.value && !selectedBinderIds.value.has(p.binderId)) continue

    const key = getPlacementOwnershipKey(p)
    const ownNonFoil = collectionStore.isOwnedNonFoil(key)
    const ownFoil = collectionStore.isOwnedFoil(key)
    const owned = ownNonFoil || ownFoil
    const skipped = collectionStore.isSkipped(key)

    if (filter.value === 'owned' && !owned) continue
    if (filter.value === 'missing' && (owned || skipped)) continue
    if (q && !p.card.name.toLowerCase().includes(q)) continue

    const price = pricesStore.getPrice(p.card.id)
    const special = specialFinishLabel(p.card.promo_types, p.card.finishes)
    const foilOnly = !!p.card.finishes && !p.card.finishes.includes('nonfoil')
    const base = {
      cardId: p.card.id,
      name: p.card.name,
      set: p.card.set.toUpperCase(),
      number: p.card.collector_number,
      image: getCardImageUri(p.card, 'normal') ?? undefined
    }

    // Owned cards contribute one tile per owned finish (each its own priced item);
    // missing cards contribute a single market-price tile (non-foil, else foil).
    // The special-finish badge rides the foil (or a foil-only printing's) tile.
    if (filter.value === 'owned') {
      if (ownNonFoil) {
        out.push({ ...base, key: `${key}:nf`, foil: false, finishLabel: null, value: price?.eur ? parseFloat(price.eur) : 0, priced: !!price?.eur })
      }
      if (ownFoil) {
        out.push({ ...base, key: `${key}:f`, foil: true, finishLabel: special, value: price?.eurFoil ? parseFloat(price.eurFoil) : 0, priced: !!price?.eurFoil })
      }
    } else {
      // A foil-only printing (plain foil or a special foil like Surge/Chocobo Track) still
      // gets the iridescent frame here, so an expensive foil reads as foil even when missing.
      const market = price?.eur ?? price?.eurFoil ?? null
      const isFoil = foilOnly || !!special
      out.push({ ...base, key, foil: isFoil, finishLabel: special, value: market ? parseFloat(market) : 0, priced: !!market })
    }
  }
  // Priced first, then by value desc.
  out.sort((a, b) => (a.priced !== b.priced ? (a.priced ? -1 : 1) : b.value - a.value))
  return out
})

const visibleEntries = computed(() => entries.value.slice(0, limit.value))
const totalValue = computed(() => entries.value.reduce((sum, e) => sum + e.value, 0))
const pricedCount = computed(() => entries.value.filter(e => e.priced).length)
</script>

<template>
  <div class="flex min-h-0 flex-col gap-3">
    <!-- filters -->
    <div class="flex shrink-0 flex-wrap items-center gap-3">
      <SegmentedControl v-model="filter" :options="FILTERS" />
      <div v-if="binders.length > 1" class="w-52">
        <Select v-model="storage">
          <option value="">All storage</option>
          <optgroup v-for="g in binderGroups" :key="g.key" :label="g.label">
            <option :value="`set:${g.key}`">All {{ g.label }}</option>
            <option v-for="b in g.binders" :key="b.id" :value="b.id">{{ b.name }}</option>
          </optgroup>
        </Select>
      </div>
      <div class="min-w-40 flex-1">
        <Input v-model="search" placeholder="Search cards…" />
      </div>
      <div class="w-32">
        <Select v-model="limit">
          <option v-for="n in LIMITS" :key="n" :value="n">Top {{ n }}</option>
        </Select>
      </div>
    </div>

    <!-- summary -->
    <p class="shrink-0 text-xs text-ink-soft tabular-nums">
      {{ entries.length }} card{{ entries.length === 1 ? '' : 's' }} ·
      <span class="font-semibold text-brand">{{ formatEurAmount(totalValue) }}</span>
      <span v-if="pricedCount < entries.length" class="text-ink-faint"> · {{ pricedCount }} priced</span>
    </p>

    <!-- value grid -->
    <div v-if="visibleEntries.length" class="min-h-0 flex-1 overflow-y-auto">
      <!-- px/pt so the hover lift + foil frame + focus ring aren't clipped by the scroll container -->
      <div class="grid grid-cols-2 gap-4 px-1 pt-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
        <RouterLink
          v-for="e in visibleEntries"
          :key="e.key"
          :to="`/card/${e.cardId}`"
          class="@container block rounded-[5cqw] outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring"
          :title="`View ${e.name}`"
        >
          <!-- the card itself: rounded art, and the foil frame wraps only this -->
          <div class="relative aspect-63/88">
            <div class="absolute inset-0 overflow-hidden rounded-[5cqw] bg-surface-2">
              <img v-if="e.image" :src="e.image" :alt="e.name" loading="lazy" class="absolute inset-0 h-full w-full object-cover" />
              <!-- value: the hero, over a readability gradient -->
              <div class="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/90 via-black/55 to-transparent px-2 pb-1.5 pt-8">
                <div class="text-lg font-bold tabular-nums" :class="e.priced ? 'text-white' : 'text-white/55'">
                  {{ e.priced ? formatEurAmount(e.value) : '—' }}
                </div>
              </div>
            </div>
            <!-- foil ownership → iridescent frame on the card, like the binder -->
            <div v-if="e.foil" class="foil-frame" aria-hidden="true"></div>
          </div>
          <div class="mt-1.5 px-0.5">
            <p class="truncate text-xs font-semibold" :title="e.name">{{ e.name }}</p>
            <p class="truncate text-[11px] tabular-nums text-ink-faint">
              {{ e.set }} · {{ e.number }}<template v-if="e.finishLabel"> · <span class="font-semibold text-brand">{{ e.finishLabel.toUpperCase() }}</span></template>
            </p>
          </div>
        </RouterLink>
      </div>
      <p v-if="entries.length > visibleEntries.length" class="mt-3 text-center text-xs text-ink-faint">
        Showing top {{ visibleEntries.length }} of {{ entries.length }}. Refine with search or filters.
      </p>
    </div>
    <div v-else class="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-line p-8 text-center text-sm text-ink-faint">
      No cards match. Fetch prices in a binder, or adjust the filters.
    </div>
  </div>
</template>

<style scoped>
/* Iridescent frame denoting an owned foil — a gradient ring drawn via mask so it
   hugs the tile's corners (matches the binder's foil treatment). */
.foil-frame {
  position: absolute;
  inset: 0;
  border-radius: 5cqw;
  padding: 2px;
  pointer-events: none;
  background: conic-gradient(
    from 0deg,
    hsl(330 95% 62%), hsl(280 95% 66%), hsl(200 95% 60%),
    hsl(150 85% 58%), hsl(48 98% 62%), hsl(330 95% 62%)
  );
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}
</style>
