<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  getCachedCard,
  fetchAndCacheCards,
  getCardImageUri,
  isDoubleFaced,
  getOtherPrintings
} from '@/api/scryfall'
import type { ScryfallCard } from '@/types'
import type { Ownership } from '@/components/common/types'
import { usePricesStore, useCollectionStore, useBindersStore } from '@/stores'
import { useAllPlacements } from '@/composables/useAllPlacements'
import { getPlacementOwnershipKey } from '@/types/placement'
import { getPriceHistory, type PricePoint } from '@/api/priceHistory'
import { formatEur, formatPriceTimestamp } from '@/utils/price'
import { specialFinishLabel } from '@/utils/finish'
import { Button } from '@/components/ui/button'
import ManaSymbol from '@/components/common/ManaSymbol.vue'
import OwnershipBadge from '@/components/common/OwnershipBadge.vue'
import CardPriceChart from '@/components/cards/CardPriceChart.vue'
import { ArrowLeft, FlipHorizontal2, ExternalLink, ShoppingCart, RefreshCw, MapPin } from 'lucide-vue-next'

// Read-only single-card page: everything you'd otherwise hop to Scryfall for, plus this
// printing's price telemetry, on one URL (/card/:id, keyed by Scryfall id).
const route = useRoute()
const router = useRouter()
const pricesStore = usePricesStore()
const collectionStore = useCollectionStore()
const bindersStore = useBindersStore()
const { allPlacements } = useAllPlacements()

const cardId = computed(() => route.params.id as string)

const card = ref<ScryfallCard | null>(null)
const loading = ref(true)
const notFound = ref(false)
const face = ref(0) // which face is shown (0 front / 1 back) for double-faced cards
const history = ref<PricePoint[]>([])
const printings = ref<ScryfallCard[]>([]) // other printings of this card (excludes itself)
const printingsLoading = ref(false)

async function loadHistory(id: string) {
  try {
    history.value = await getPriceHistory(id)
  } catch {
    history.value = []
  }
}

async function loadPrintings(c: ScryfallCard) {
  printingsLoading.value = true
  printings.value = []
  try {
    const all = await getOtherPrintings(c)
    printings.value = all.filter(p => p.id !== c.id)
  } catch {
    printings.value = []
  } finally {
    printingsLoading.value = false
  }
}

async function load(id: string) {
  loading.value = true
  notFound.value = false
  card.value = null
  face.value = 0
  history.value = []
  printings.value = []
  // Cache-first; fall back to a single explicit Scryfall fetch on a miss (detail pages
  // are deliberate navigation, so one network request is acceptable here).
  let c = await getCachedCard(id)
  if (!c) {
    const map = await fetchAndCacheCards([id])
    c = map.get(id) ?? null
  }
  card.value = c
  notFound.value = !c
  loading.value = false
  if (c) {
    void loadHistory(id)
    void loadPrintings(c)
  }
}

watch(cardId, load, { immediate: true })

// ---- Faces (single-faced cards get one synthetic face from the top-level fields) ----
interface FaceVM {
  name: string
  mana_cost?: string
  type_line?: string
  oracle_text?: string
  power?: string
  toughness?: string
  loyalty?: string
}
const faces = computed<FaceVM[]>(() => {
  const c = card.value
  if (!c) return []
  if (c.card_faces && c.card_faces.length) {
    return c.card_faces.map(f => ({
      name: f.name,
      mana_cost: f.mana_cost,
      type_line: f.type_line,
      oracle_text: f.oracle_text,
      power: f.power,
      toughness: f.toughness,
      loyalty: f.loyalty
    }))
  }
  return [{
    name: c.name,
    mana_cost: c.mana_cost,
    type_line: c.type_line,
    oracle_text: c.oracle_text,
    power: c.power,
    toughness: c.toughness,
    loyalty: c.loyalty
  }]
})

const isDfc = computed(() => (card.value ? isDoubleFaced(card.value) : false))
// Both faces are rendered so the flip can animate in 3D; `face` just rotates the container.
const frontImage = computed(() =>
  card.value ? getCardImageUri(card.value, 'large', 0) ?? getCardImageUri(card.value, 'normal', 0) : null
)
const backImage = computed(() =>
  card.value ? getCardImageUri(card.value, 'large', 1) ?? getCardImageUri(card.value, 'normal', 1) : null
)

// ---- Mana / oracle symbol rendering -------------------------------------------------
interface Token { t: 'text' | 'sym'; v: string }

/** Split a string into plain-text runs and `{…}` symbol tokens (v = inner text). */
function tokenize(text: string): Token[] {
  const out: Token[] = []
  let last = 0
  for (const m of text.matchAll(/\{([^}]+)\}/g)) {
    const idx = m.index ?? 0
    if (idx > last) out.push({ t: 'text', v: text.slice(last, idx) })
    out.push({ t: 'sym', v: m[1] ?? '' })
    last = idx + m[0].length
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) })
  return out
}

/** Just the symbol tokens of a mana cost (for the pip row). */
function manaSymbols(cost?: string): Token[] {
  return cost ? tokenize(cost).filter(t => t.t === 'sym') : []
}

/** Oracle text as lines of tokens, so blank lines become paragraph breaks. */
function oracleLines(text?: string): Token[][] {
  if (!text) return []
  return text.split('\n').map(tokenize)
}

// ---- Header meta --------------------------------------------------------------------
function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}
const treatment = computed(() =>
  card.value ? specialFinishLabel(card.value.promo_types, card.value.finishes) : null
)
const finishesLabel = computed(() => {
  const f = card.value?.finishes
  if (!f || f.length === 0) return null
  return f.map(x => capitalize(x)).join(' · ')
})

// ---- Prices -------------------------------------------------------------------------
const price = computed(() => pricesStore.getPrice(cardId.value))
const eurLabel = computed(() => formatEur(price.value?.eur))
const eurFoilLabel = computed(() => formatEur(price.value?.eurFoil))
const priceTimestamp = computed(() => formatPriceTimestamp(price.value?.fetchedAt))

async function fetchPrice() {
  if (pricesStore.isFetching) return
  await pricesStore.fetchPricesFor([cardId.value])
  await loadHistory(cardId.value)
}

// ---- Where it lives (every slot this printing occupies across your plans) -----------
interface Placement {
  key: string
  binderName: string
  location: string
  status: Ownership
}
const placements = computed<Placement[]>(() => {
  const id = cardId.value
  const out: Placement[] = []
  for (const result of allPlacements.value.values()) {
    for (const p of result.placements) {
      if (p.card.id !== id) continue
      const binder = bindersStore.getBinder(p.binderId)
      const key = getPlacementOwnershipKey(p)
      const owned = collectionStore.isOwnedNonFoil(key) || collectionStore.isOwnedFoil(key)
      const status: Ownership = collectionStore.isSkipped(key) ? 'skipped' : owned ? 'owned' : 'missing'
      out.push({
        key: `${p.segmentId}:${p.cardIndexInSegment}`,
        binderName: binder?.name ?? 'Unknown',
        location: binder?.type === 'box' ? `Box · #${p.slotOnPage}` : `Page ${p.pageNumber} · Slot ${p.slotOnPage}`,
        status
      })
    }
  }
  return out
})

// ---- External links -----------------------------------------------------------------
const scryfallUrl = computed(() =>
  card.value ? `https://scryfall.com/card/${card.value.set}/${card.value.collector_number}` : '#'
)
const cardmarketUrl = computed(() =>
  card.value?.purchase_uris?.cardmarket
    ?? (card.value ? `https://www.cardmarket.com/en/Magic/Products/Search?searchString=${encodeURIComponent(card.value.name)}` : '#')
)
const tcgplayerUrl = computed(() => card.value?.purchase_uris?.tcgplayer ?? null)

// ---- Other printings ----------------------------------------------------------------
// Cap the grid so a heavily-reprinted card (e.g. a basic land) can't render hundreds of
// tiles/images at once.
const PRINTINGS_CAP = 60
const visiblePrintings = computed(() => printings.value.slice(0, PRINTINGS_CAP))
function printingImage(p: ScryfallCard): string | null {
  return getCardImageUri(p, 'small')
}
</script>

<template>
  <div class="mx-auto w-full max-w-5xl px-6 py-6 sm:px-8">
    <Button variant="ghost" size="sm" class="mb-4 -ml-2" @click="router.back()">
      <ArrowLeft :size="18" /> Back
    </Button>

    <p v-if="loading" class="py-16 text-center text-ink-soft">Loading card…</p>
    <div v-else-if="notFound" class="py-16 text-center">
      <p class="text-ink-soft">Card not found.</p>
      <p class="mt-1 text-sm text-ink-faint">It isn't cached, and Scryfall didn't return it for this id.</p>
    </div>

    <div v-else-if="card" class="grid gap-6 md:grid-cols-[minmax(220px,300px)_1fr]">
      <!-- Left: image + flip -->
      <div class="flex flex-col gap-3">
        <div class="flip">
          <div class="flip-inner relative aspect-63/88" :class="{ 'is-flipped': face === 1 }">
            <!-- Front face -->
            <div class="flip-face overflow-hidden rounded-xl border border-line bg-surface-2 shadow-(--shadow-1)">
              <img v-if="frontImage" :src="frontImage" :alt="card.name" class="h-full w-full object-cover" />
              <div v-else class="grid h-full w-full place-items-center p-4 text-center text-sm text-ink-faint">{{ card.name }}</div>
            </div>
            <!-- Back face (double-faced cards only) -->
            <div v-if="isDfc" class="flip-face flip-back overflow-hidden rounded-xl border border-line bg-surface-2 shadow-(--shadow-1)">
              <img v-if="backImage" :src="backImage" :alt="`${card.name} — back face`" class="h-full w-full object-cover" />
            </div>
          </div>
        </div>
        <Button v-if="isDfc" variant="secondary" size="sm" class="self-start" @click="face = face === 0 ? 1 : 0">
          <FlipHorizontal2 :size="16" /> Flip card
        </Button>
      </div>

      <!-- Right: details -->
      <div class="flex min-w-0 flex-col gap-5">
        <!-- Title + printing meta -->
        <div>
          <h1 class="font-display text-2xl font-bold leading-tight tracking-tight">{{ card.name }}</h1>
          <p class="mt-1.5 text-sm text-ink-soft tabular-nums">
            {{ card.set_name }} · {{ card.set.toUpperCase() }} #{{ card.collector_number }} · {{ capitalize(card.rarity) }}
          </p>
          <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span v-if="treatment" class="rounded-full bg-(--accent-soft) px-2 py-0.5 font-semibold text-brand">{{ treatment }}</span>
            <span v-if="finishesLabel" class="text-ink-faint">Finishes: {{ finishesLabel }}</span>
            <span v-if="card.cmc != null" class="text-ink-faint">· Mana value {{ card.cmc }}</span>
          </div>
        </div>

        <!-- Faces (mana cost, type, oracle text, P/T / loyalty) -->
        <div class="flex flex-col gap-4">
          <div
            v-for="(f, fi) in faces"
            :key="fi"
            class="rounded-xl border border-line bg-surface p-4 shadow-(--shadow-1)"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-semibold">{{ f.name }}</h2>
              <div v-if="manaSymbols(f.mana_cost).length" class="flex items-center gap-1">
                <ManaSymbol
                  v-for="(tok, i) in manaSymbols(f.mana_cost)"
                  :key="i"
                  :symbol="tok.v"
                  :size="22"
                />
              </div>
            </div>
            <p v-if="f.type_line" class="mt-1 text-sm text-ink-soft">{{ f.type_line }}</p>

            <div v-if="f.oracle_text" class="mt-3 flex flex-col gap-2 text-sm leading-relaxed">
              <p v-for="(line, li) in oracleLines(f.oracle_text)" :key="li" class="min-h-[0.5em]">
                <template v-for="(tok, ti) in line" :key="ti">
                  <span v-if="tok.t === 'text'">{{ tok.v }}</span>
                  <ManaSymbol v-else :symbol="tok.v" :size="16" class="mx-px" />
                </template>
              </p>
            </div>

            <p v-if="f.power != null || f.loyalty != null" class="mt-3 text-right text-lg font-bold tabular-nums">
              <span v-if="f.power != null">{{ f.power }}/{{ f.toughness }}</span>
              <span v-else-if="f.loyalty != null">Loyalty {{ f.loyalty }}</span>
            </p>
          </div>
        </div>

        <!-- Price telemetry -->
        <div class="rounded-xl border border-line bg-surface p-4 shadow-(--shadow-1)">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">Price</h2>
            <Button size="sm" variant="secondary" :disabled="pricesStore.isFetching" @click="fetchPrice">
              <RefreshCw :size="14" :class="pricesStore.isFetching && 'animate-spin'" />
              {{ pricesStore.isFetching ? 'Fetching…' : 'Fetch latest' }}
            </Button>
          </div>

          <div v-if="eurLabel || eurFoilLabel" class="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1" :title="priceTimestamp">
            <span v-if="eurLabel" class="flex items-baseline gap-1.5">
              <span class="text-ink-soft">•</span>
              <span class="text-xl font-bold tabular-nums">{{ eurLabel }}</span>
              <span class="text-xs text-ink-faint">non-foil</span>
            </span>
            <span v-if="eurFoilLabel" class="flex items-baseline gap-1.5">
              <span class="text-ink-soft">★</span>
              <span class="text-xl font-bold tabular-nums">{{ eurFoilLabel }}</span>
              <span class="text-xs text-ink-faint">foil</span>
            </span>
          </div>
          <p v-else class="mt-3 text-sm text-ink-faint">No price yet — fetch it above.</p>

          <div class="mt-4">
            <CardPriceChart :points="history" />
          </div>
        </div>

        <!-- Where it lives -->
        <div v-if="placements.length" class="rounded-xl border border-line bg-surface p-4 shadow-(--shadow-1)">
          <h2 class="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">In your collection</h2>
          <ul class="flex flex-col gap-2">
            <li v-for="(pl, i) in placements" :key="i" class="flex items-center gap-3 text-sm">
              <MapPin :size="15" class="shrink-0 text-ink-faint" />
              <span class="font-semibold">{{ pl.binderName }}</span>
              <span class="text-ink-faint tabular-nums">{{ pl.location }}</span>
              <OwnershipBadge :status="pl.status" class="ml-auto" />
            </li>
          </ul>
        </div>

        <!-- Other printings -->
        <div v-if="printingsLoading || printings.length" class="rounded-xl border border-line bg-surface p-4 shadow-(--shadow-1)">
          <h2 class="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">
            Other printings <span v-if="printings.length" class="text-ink-faint">({{ printings.length }})</span>
          </h2>
          <p v-if="printingsLoading" class="text-sm text-ink-faint">Loading printings…</p>
          <template v-else>
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              <RouterLink
                v-for="p in visiblePrintings"
                :key="p.id"
                :to="`/card/${p.id}`"
                class="group @container block rounded-[5cqw] outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring"
                :title="`${p.set_name} · #${p.collector_number}`"
              >
                <!-- rounded-[5cqw] = the card's natural corner radius (~5% of its width) -->
                <div class="relative aspect-63/88 overflow-hidden rounded-[5cqw] bg-surface-2">
                  <img
                    v-if="printingImage(p)"
                    :src="printingImage(p)!"
                    :alt="p.name"
                    loading="lazy"
                    class="absolute inset-0 h-full w-full object-cover"
                  />
                  <div v-else class="grid h-full w-full place-items-center p-2 text-center text-[11px] text-ink-faint">{{ p.set_name }}</div>
                </div>
                <div class="mt-1.5 px-0.5">
                  <p class="truncate text-xs font-semibold" :title="p.set_name">{{ p.set_name }}</p>
                  <p class="truncate text-[11px] tabular-nums text-ink-faint">{{ p.set.toUpperCase() }} · #{{ p.collector_number }} · {{ capitalize(p.rarity) }}</p>
                </div>
              </RouterLink>
            </div>
            <p v-if="printings.length > PRINTINGS_CAP" class="mt-3 text-center text-xs text-ink-faint">
              Showing {{ PRINTINGS_CAP }} of {{ printings.length }} printings.
            </p>
          </template>
        </div>

        <!-- External links -->
        <div class="flex flex-wrap gap-2">
          <a :href="scryfallUrl" target="_blank" rel="noopener" class="ext-link">
            <ExternalLink :size="16" /> Scryfall
          </a>
          <a :href="cardmarketUrl" target="_blank" rel="noopener" class="ext-link">
            <ShoppingCart :size="16" /> Cardmarket
          </a>
          <a v-if="tcgplayerUrl" :href="tcgplayerUrl" target="_blank" rel="noopener" class="ext-link">
            <ShoppingCart :size="16" /> TCGplayer
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 3D card flip: the inner element rotates on the Y axis between the two faces, each of
   which hides its back so only the facing side shows. */
.flip {
  perspective: 1200px;
}
.flip-inner {
  transition: transform 0.6s cubic-bezier(0.2, 0.7, 0.2, 1);
  transform-style: preserve-3d;
}
.flip-inner.is-flipped {
  transform: rotateY(180deg);
}
.flip-face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
.flip-face.flip-back {
  transform: rotateY(180deg);
}
@media (prefers-reduced-motion: reduce) {
  .flip-inner {
    transition: none;
  }
}

.ext-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 0.5rem;
  border: 1px solid var(--line);
  background: var(--surface-2);
  padding: 0.5rem 0.875rem;
  font-size: 0.875rem;
  font-weight: 600;
  transition: background-color 0.15s;
}
.ext-link:hover {
  background: var(--surface-3);
}
</style>
