<script setup lang="ts">
import { computed } from 'vue'
import { Sheet } from '@/components/ui/sheet'
import OwnershipBadge from '@/components/common/OwnershipBadge.vue'
import type { Mana, Ownership } from '@/components/common/types'
import { formatEur, formatPriceTimestamp } from '@/utils/price'
import { Check, Ban, Plus, Minus, ExternalLink, ShoppingCart, RefreshCw, Trash2, FlipHorizontal2, FileText } from 'lucide-vue-next'

const props = defineProps<{
  name: string
  set: string
  number: string
  color: Mana
  status: Ownership
  spacerCount: number
  rarity?: string
  image?: string
  location?: string
  eur?: string | null
  eurFoil?: string | null
  priceFetchedAt?: number
  ownsNonFoil?: boolean
  ownsFoil?: boolean
  canNonFoil?: boolean
  canFoil?: boolean
  /** Box slots are one physical card = one finish, so finish choice is exclusive. */
  singleFinish?: boolean
  isRefreshing?: boolean
  /** This printing has a distinct back face that can be added as its own slot. */
  isDoubleFaced?: boolean
  /** This slot is itself the back face of a double-faced card. */
  isBackFace?: boolean
}>()

// A finish is offerable unless the printing explicitly can't be that finish.
const showNonFoil = computed(() => props.canNonFoil !== false)
const showFoil = computed(() => props.canFoil !== false)

const eurLabel = computed(() => formatEur(props.eur))
const eurFoilLabel = computed(() => formatEur(props.eurFoil))
const hasPrice = computed(() => !!eurLabel.value || !!eurFoilLabel.value)
const priceTitle = computed(() => formatPriceTimestamp(props.priceFetchedAt))
// Mute the finish the user doesn't own, but only once the other finish is owned.
const mutedNonFoil = computed(() => !!props.ownsFoil && !props.ownsNonFoil)
const mutedFoil = computed(() => !!props.ownsNonFoil && !props.ownsFoil)

// Keyboard hint for the finish shortcuts. "B both" only applies where a card can
// hold two finishes at once (binders); box slots are single-finish, so omit it.
const finishKeysHint = computed(() => {
  const parts: string[] = []
  if (showNonFoil.value) parts.push('N non-foil')
  if (showFoil.value) parts.push('F foil')
  if (!props.singleFinish) parts.push('B both')
  return parts.length ? `Keys · ${parts.join(' · ')} (marks & closes)` : ''
})

const open = defineModel<boolean>('open', { default: false })

defineEmits<{
  toggleNonFoil: []
  toggleFoil: []
  toggleSkipped: []
  addBackFace: []
  addSpacer: []
  removeSpacer: []
  openDetails: []
  openScryfall: []
  openCardmarket: []
  refresh: []
  remove: []
}>()

const chipClass =
  'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring'
const chipOn = 'border-transparent bg-primary text-primary-foreground'
const chipOff = 'border-line-strong bg-surface text-ink-soft hover:bg-surface-3'

const ART: Record<Mana, string> = {
  R: 'radial-gradient(circle at 50% 30%,#ff6a52,#a32417)',
  U: 'radial-gradient(circle at 50% 30%,#54b0f0,#1c5996)',
  G: 'radial-gradient(circle at 50% 30%,#54cf80,#1f7a40)',
  B: 'radial-gradient(circle at 50% 30%,#6a5f80,#211a2e)',
  W: 'radial-gradient(circle at 50% 30%,#f6ecc4,#cdb478)',
  C: 'radial-gradient(circle at 50% 30%,#c3bdd2,#797295)'
}

const actionClass =
  'flex h-12 w-full items-center gap-3 rounded-md border border-line bg-surface-2 px-3.5 text-left text-sm font-semibold text-foreground outline-none transition-colors hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-[19px] [&_svg]:shrink-0 [&_svg]:text-ink-soft'
</script>

<template>
  <Sheet
    v-model:open="open"
    :title="name"
    :description="`${set} · ${number}${rarity ? ' · ' + rarity : ''}${isBackFace ? ' · Back face' : ''}`"
  >
    <div class="flex items-center gap-3">
      <div class="h-18 w-13 shrink-0 overflow-hidden rounded-md">
        <img v-if="image" :src="image" :alt="name" class="h-full w-full object-cover" :class="status !== 'owned' && 'grayscale'" />
        <div v-else class="h-full w-full" :style="{ background: ART[color] }"></div>
      </div>
      <div class="min-w-0">
        <OwnershipBadge :status="status" />
        <div v-if="location" class="mt-1.5 text-xs text-brand tabular-nums">{{ location }}</div>
      </div>
    </div>

    <!-- Latest Scryfall EUR prices; • normal, ★ foil. Hover shows when they were fetched. -->
    <div
      v-if="hasPrice"
      class="mt-3 flex items-center gap-4 rounded-md border border-line bg-surface-2 px-3.5 py-2.5 text-sm font-semibold tabular-nums"
      :title="priceTitle"
    >
      <span v-if="eurLabel" class="flex items-center gap-1.5" :class="mutedNonFoil && 'opacity-40'">
        <span class="text-ink-soft">•</span> {{ eurLabel }}
      </span>
      <span v-if="eurFoilLabel" class="flex items-center gap-1.5" :class="mutedFoil && 'opacity-40'">
        <span class="text-ink-soft">★</span> {{ eurFoilLabel }}
      </span>
    </div>

    <div class="mt-4 flex flex-col gap-2">
      <div class="flex h-12 items-center justify-between rounded-md border border-line bg-surface-2 px-3.5 text-sm font-semibold">
        <span>Owned finish</span>
        <div class="flex items-center gap-2">
          <button v-if="showNonFoil" type="button" :class="[chipClass, ownsNonFoil ? chipOn : chipOff]" @click="$emit('toggleNonFoil')">
            <Check v-if="ownsNonFoil" :size="14" /><span v-else>•</span> Non-foil
          </button>
          <button v-if="showFoil" type="button" :class="[chipClass, ownsFoil ? chipOn : chipOff]" @click="$emit('toggleFoil')">
            <Check v-if="ownsFoil" :size="14" /><span v-else>★</span> Foil
          </button>
        </div>
      </div>
      <p v-if="finishKeysHint" class="-mt-1 px-1 text-[11px] leading-tight text-ink-faint">{{ finishKeysHint }}</p>
      <button :class="actionClass" @click="$emit('toggleSkipped')">
        <Ban /> {{ status === 'skipped' ? 'Unskip card' : 'Skip this card' }}
      </button>

      <!-- Double-faced: add the backside as its own adjacent slot (a second copy). -->
      <button v-if="isDoubleFaced && !isBackFace" :class="actionClass" @click="$emit('addBackFace')">
        <FlipHorizontal2 /> Add back face
      </button>

      <div class="flex h-12 items-center justify-between rounded-md border border-line bg-surface-2 px-3.5 text-sm font-semibold">
        <span>Blank slots before</span>
        <div class="flex items-center gap-2.5">
          <button
            class="grid h-9 w-9 place-items-center rounded-md border border-line-strong bg-surface text-lg outline-none disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Remove blank"
            :disabled="spacerCount === 0"
            @click="$emit('removeSpacer')"
          ><Minus :size="16" /></button>
          <span class="min-w-5 text-center tabular-nums">{{ spacerCount }}</span>
          <button
            class="grid h-9 w-9 place-items-center rounded-md border border-line-strong bg-surface text-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Add blank"
            @click="$emit('addSpacer')"
          ><Plus :size="16" /></button>
        </div>
      </div>

      <button :class="actionClass" @click="$emit('openDetails')">
        <FileText /> View card details
      </button>
      <button :class="actionClass" @click="$emit('openScryfall')">
        <ExternalLink /> Open on Scryfall
      </button>
      <button :class="actionClass" @click="$emit('openCardmarket')">
        <ShoppingCart /> Open on Cardmarket
      </button>
      <button
        :class="[actionClass, 'disabled:pointer-events-none disabled:opacity-60']"
        :disabled="isRefreshing"
        @click="$emit('refresh')"
      >
        <RefreshCw :class="isRefreshing && 'animate-spin'" />
        {{ isRefreshing ? 'Refreshing…' : 'Refresh card data' }}
      </button>
      <button :class="[actionClass, 'text-skipped! [&_svg]:text-skipped!']" @click="$emit('remove')">
        <Trash2 /> Remove from segment
      </button>
    </div>
  </Sheet>
</template>
