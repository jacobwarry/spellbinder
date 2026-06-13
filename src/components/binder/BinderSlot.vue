<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import { Check, X, Plus } from 'lucide-vue-next'
import type { Mana, BinderSlotCard } from '@/components/common/types'

defineProps<{
  slotNumber: number
  card?: BinderSlotCard
}>()

const emit = defineEmits<{
  select: []
  insert: []
  toggleOwned: []
}>()

// Single click opens the action sheet; double click is a shortcut to toggle
// owned. Debounce the single click so the sheet doesn't flash on a double click.
const DOUBLE_CLICK_MS = 220
let clickTimer: ReturnType<typeof setTimeout> | null = null
function onCardClick() {
  if (clickTimer !== null) {
    clearTimeout(clickTimer)
    clickTimer = null
    emit('toggleOwned')
    return
  }
  clickTimer = setTimeout(() => {
    clickTimer = null
    emit('select')
  }, DOUBLE_CLICK_MS)
}
onBeforeUnmount(() => {
  if (clickTimer !== null) clearTimeout(clickTimer)
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
    class="group @container relative block cursor-pointer rounded-[5cqw] outline-none hover:z-10 focus-visible:ring-2 focus-visible:ring-ring"
    :aria-label="`${card.name}, ${card.set} ${card.number}, ${card.status}. Slot ${slotNumber}. Click for actions, double-click to toggle owned.`"
    @click="onCardClick"
  >
    <!-- The card = image + an attached label band, one rounded unit. The art is
         clipped to the card's natural corner radius (≈5% of width, via cqw) so the
         source image's white corner fill never peeks out; the dark art backdrop
         matches the band so the rounded bottom blends seamlessly into it. -->
    <div class="overflow-hidden rounded-[5cqw] shadow-none transition-[transform,box-shadow] duration-150 ease-out group-hover:scale-[1.03] group-hover:shadow-(--shadow-2) group-active:scale-[.97]">
      <div class="relative aspect-63/88 overflow-hidden rounded-[5cqw]" style="background:#100c18">
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

      <!-- label band tacked onto the bottom of the card -->
      <div
        class="flex aspect-10/1 items-center justify-between gap-1 px-3 text-[9px] font-semibold tabular-nums"
        style="background:#100c18;color:rgba(255,255,255,.88)"
      >
        <span class="truncate">{{ card.set }}<template v-if="card.rarity"> · {{ card.rarity }}</template></span>
        <span class="shrink-0">{{ card.number }}</span>
      </div>
    </div>
  </button>

  <button
    v-else
    class="block cursor-pointer outline-none focus-visible:rounded-[4px] focus-visible:ring-2 focus-visible:ring-ring"
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
