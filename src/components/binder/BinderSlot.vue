<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import { Check, X, Plus } from 'lucide-vue-next'
import type { Mana, BinderSlotCard } from '@/components/common/types'
import { formatEur, formatPriceTimestamp } from '@/utils/price'

const props = defineProps<{
  slotNumber: number
  card?: BinderSlotCard
  /** De-emphasize this slot (used by the spread's highlight filter for non-matches). */
  dimmed?: boolean
  /** Draw a white outline to make this slot stand out (the spread filter's matches). */
  highlighted?: boolean
}>()

// Prices in the label band: • = normal, ★ = foil; only the value(s) present are shown.
const eurLabel = computed(() => formatEur(props.card?.eur))
const eurFoilLabel = computed(() => formatEur(props.card?.eurFoil))
const hasPrice = computed(() => !!eurLabel.value || !!eurFoilLabel.value)
// Mute the finish the user doesn't own, but only once the other finish is owned
// (so an unowned card still shows both prices as plain reference).
const mutedNonFoil = computed(() => !!props.card?.ownsFoil && !props.card?.ownsNonFoil)
const mutedFoil = computed(() => !!props.card?.ownsNonFoil && !props.card?.ownsFoil)
const priceTitle = computed(() => formatPriceTimestamp(props.card?.priceFetchedAt))
const priceAria = computed(() => {
  const parts: string[] = []
  if (eurLabel.value) parts.push(`normal ${eurLabel.value}`)
  if (eurFoilLabel.value) parts.push(`foil ${eurFoilLabel.value}`)
  return parts.join(', ')
})

const emit = defineEmits<{
  select: []
  insert: []
  toggleOwned: []
  toggleFoil: []
}>()

// Single click opens the action sheet; double click is a shortcut to toggle
// owned. Debounce the single click so the sheet doesn't flash on a double click.
const DOUBLE_CLICK_MS = 220
let clickTimer: ReturnType<typeof setTimeout> | null = null
function onCardClick() {
  if (clickTimer !== null) {
    clearTimeout(clickTimer)
    clickTimer = null
    if (props.card?.canNonFoil !== false) emit('toggleOwned')
    return
  }
  clickTimer = setTimeout(() => {
    clickTimer = null
    emit('select')
  }, DOUBLE_CLICK_MS)
}

// Right-click mirror: double right-click toggles the foil finish. Always suppress
// the browser context menu on a card; only act on the second click of a pair, and
// only for printings that can be foil.
let rightClickTimer: ReturnType<typeof setTimeout> | null = null
function onCardContextMenu(e: MouseEvent) {
  e.preventDefault()
  if (rightClickTimer !== null) {
    clearTimeout(rightClickTimer)
    rightClickTimer = null
    if (props.card?.canFoil !== false) emit('toggleFoil')
    return
  }
  rightClickTimer = setTimeout(() => {
    rightClickTimer = null
  }, DOUBLE_CLICK_MS)
}
onBeforeUnmount(() => {
  if (clickTimer !== null) clearTimeout(clickTimer)
  if (rightClickTimer !== null) clearTimeout(rightClickTimer)
})

const ART: Record<Mana, string> = {
  R: 'radial-gradient(circle at 50% 28%,#ff6a52,#a32417)',
  U: 'radial-gradient(circle at 50% 28%,#54b0f0,#1c5996)',
  G: 'radial-gradient(circle at 50% 28%,#54cf80,#1f7a40)',
  B: 'radial-gradient(circle at 50% 28%,#5b5170,#1a1426)',
  W: 'radial-gradient(circle at 50% 28%,#f6ecc4,#cdb478)',
  C: 'radial-gradient(circle at 50% 28%,#c3bdd2,#797295)'
}
const MULTI_ART = 'radial-gradient(circle at 50% 28%,#ecce7e,#9c7b25)'
</script>

<template>
  <button
    v-if="card"
    class="group @container relative block cursor-pointer rounded-[5cqw] outline-none transition-opacity duration-200 hover:z-10 focus-visible:ring-2 focus-visible:ring-ring"
    :class="{ 'opacity-30 hover:opacity-100': dimmed }"
    :aria-label="`${card.name}, ${card.set} ${card.number}, ${card.status}${priceAria ? ', ' + priceAria : ''}. Slot ${slotNumber}. Click for actions, double-click to toggle owned, double right-click to toggle foil.`"
    @click="onCardClick"
    @contextmenu="onCardContextMenu"
  >
    <!-- The card = image + an attached label band, one rounded unit. The art is
         clipped to the card's natural corner radius (≈5% of width, via cqw) so the
         source image's white corner fill never peeks out; the dark art backdrop
         matches the band so the rounded bottom blends seamlessly into it. -->
    <div class="overflow-hidden rounded-[5cqw] shadow-none transition-[transform,box-shadow] duration-150 ease-out group-hover:scale-[1.03] group-hover:shadow-(--shadow-2) group-active:scale-[.97]">
      <div class="relative aspect-63/88 overflow-hidden rounded-[5cqw] isolate" style="background:#100c18">
        <!-- missing → faded + desaturated; skipped → desaturated/darkened (corner ✕ distinguishes it) -->
        <div
          class="absolute inset-0"
          :class="{
            'opacity-40 grayscale': card.status === 'missing',
            'grayscale brightness-90': card.status === 'skipped'
          }"
        >
          <img v-if="card.image" :src="card.image" :alt="card.name" loading="lazy" class="absolute inset-0 h-full w-full object-cover" />
          <div v-else class="absolute inset-0" :style="{ background: card.multicolor ? MULTI_ART : ART[card.color] }"></div>
          <span
            v-if="!card.image"
            class="absolute inset-x-1.5 top-1.5 line-clamp-2 text-[10px] font-bold leading-tight text-white"
            style="text-shadow:0 1px 2px rgba(0,0,0,.6)"
          >{{ card.name }}</span>
        </div>

        <!-- search highlight takes priority: a plain white frame that replaces the
             foil frame while a card matches the spread's highlight filter. -->
        <div v-if="highlighted" class="highlight-frame" aria-hidden="true"></div>
        <!-- foil: persistent iridescent frame (the at-a-glance cue) + a shimmer
             tint/glare (motion flair) when the foil is owned -->
        <template v-else-if="card.ownsFoil">
          <div class="foil" aria-hidden="true"></div>
          <div class="foil-frame" aria-hidden="true"></div>
        </template>

        <!-- ownership corner indicator (kept crisp, outside the fade wrapper) -->
        <span
          v-if="card.status === 'owned'"
          class="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full text-[#06210f]"
          style="background:var(--owned)"
        ><Check :size="10" :stroke-width="3.5" /></span>
        <span
          v-else-if="card.status === 'skipped'"
          class="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full text-[#2a0c08]"
          style="background:var(--skipped)"
        ><X :size="10" :stroke-width="3.5" /></span>
      </div>

      <!-- label band: set·rarity (left) — prices (centered) — collector № (right) -->
      <div
        class="flex aspect-10/1 items-center gap-1 px-3 text-[9px] font-semibold tabular-nums"
        style="background:#100c18;color:rgba(255,255,255,.88)"
      >
        <span class="min-w-0 flex-1 truncate text-left">{{ card.set }}<template v-if="card.rarity"> · {{ card.rarity }}</template></span>
        <span v-if="hasPrice" class="flex shrink-0 items-center gap-1.5 whitespace-nowrap" :title="priceTitle">
          <span v-if="eurLabel" :class="mutedNonFoil && 'opacity-35'">• {{ eurLabel }}</span>
          <span v-if="eurFoilLabel" :class="mutedFoil && 'opacity-35'">★ {{ eurFoilLabel }}</span>
        </span>
        <span class="flex-1 shrink-0 text-right">{{ card.number }}</span>
      </div>
    </div>
  </button>

  <button
    v-else
    class="block cursor-pointer outline-none transition-opacity duration-200 focus-visible:rounded-[4px] focus-visible:ring-2 focus-visible:ring-ring"
    :class="{ 'opacity-30 hover:opacity-100': dimmed }"
    :aria-label="`Empty slot ${slotNumber}. Add a card.`"
    @click="$emit('insert')"
  >
    <div class="relative grid aspect-63/88 place-items-center rounded-[4px] border-[1.5px] border-dashed border-line-strong bg-surface-2 text-ink-faint transition-colors hover:border-brand hover:text-brand">
      <span class="absolute left-1.5 top-1 text-[10px] font-semibold">{{ slotNumber }}</span>
      <Plus :size="18" class="opacity-60" />
    </div>
    <!-- spacer keeps empty slots the same height as filled ones -->
    <div class="aspect-10/1" aria-hidden="true"></div>
  </button>
</template>

<style scoped>
/* Foil shimmer. Blending is contained by the art container's `isolate`, so the
   holographic tint + glare only interact with the card image, not neighbors.
   Animations use opacity/transform only (compositor-friendly) to stay cheap when
   many foil cards are on screen. */
.foil {
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
}
/* Persistent iridescent frame: a gradient ring drawn via mask so it hugs the card's
   rounded corners and leaves the art untouched. This is the always-visible cue. */
.foil-frame {
  position: absolute;
  inset: 0;
  border-radius: inherit;
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
button:hover .foil-frame {
  filter: brightness(1.2) saturate(1.25);
}
/* Search-highlight frame: same corner-hugging mask as the foil frame, but a plain
   white border. Takes the foil frame's place while a card matches the filter. */
.highlight-frame {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 2px;
  pointer-events: none;
  background: #fff;
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}
/* oil-slick holographic wash — a faint static tint at rest */
.foil::before {
  content: "";
  position: absolute;
  inset: -25%;
  background: conic-gradient(
    from 0deg,
    hsl(330 90% 62%), hsl(280 90% 64%), hsl(200 92% 60%),
    hsl(150 82% 58%), hsl(48 96% 62%), hsl(330 90% 62%)
  );
  mix-blend-mode: overlay;
  opacity: 0.28;
}
/* sweeping diagonal glare — hidden until hover */
.foil::after {
  content: "";
  position: absolute;
  top: -40%;
  bottom: -40%;
  left: -60%;
  width: 45%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.6), transparent);
  transform: translateX(0) skewX(-18deg);
  mix-blend-mode: screen;
  opacity: 0;
}
/* Motion is hover-only with a 0.5s delay, so a wall of foils stays calm at rest and
   only the card you dwell on shimmers. */
button:hover .foil {
  filter: brightness(1.3) saturate(1.3);
}
button:hover .foil::before {
  animation: foil-breathe 6s ease-in-out 0.5s infinite;
}
button:hover .foil::after {
  animation: foil-sweep 5s ease-in-out 0.5s infinite;
}
@keyframes foil-breathe {
  0%, 100% { opacity: 0.24; }
  50% { opacity: 0.44; }
}
@keyframes foil-sweep {
  0% { transform: translateX(0) skewX(-18deg); opacity: 0; }
  12% { opacity: 1; }
  55% { transform: translateX(360%) skewX(-18deg); opacity: 0; }
  100% { transform: translateX(360%) skewX(-18deg); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  button:hover .foil::before,
  button:hover .foil::after { animation: none; }
  .foil::after { display: none; }
}
</style>
