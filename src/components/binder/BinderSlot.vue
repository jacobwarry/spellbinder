<script setup lang="ts">
import { Check, X, Plus } from 'lucide-vue-next'
import type { Mana, Ownership } from '@/components/common/types'

defineProps<{
  slotNumber: number
  card?: {
    name: string
    set: string
    number: string
    color: Mana
    status: Ownership
    rarity?: string
    image?: string
  }
}>()

defineEmits<{
  select: []
  insert: []
}>()

const ART: Record<Mana, string> = {
  R: 'radial-gradient(circle at 50% 28%,#ff6a52,#a32417)',
  U: 'radial-gradient(circle at 50% 28%,#54b0f0,#1c5996)',
  G: 'radial-gradient(circle at 50% 28%,#54cf80,#1f7a40)',
  B: 'radial-gradient(circle at 50% 28%,#5b5170,#1a1426)',
  W: 'radial-gradient(circle at 50% 28%,#f6ecc4,#cdb478)',
  C: 'radial-gradient(circle at 50% 28%,#c3bdd2,#797295)'
}
</script>

<template>
  <button
    v-if="card"
    class="relative block aspect-63/88 overflow-hidden rounded-lg outline-none transition-transform active:scale-[.97] focus-visible:ring-2 focus-visible:ring-ring"
    :class="card.status !== 'owned' && 'grayscale brightness-90'"
    :aria-label="`${card.name}, ${card.set} ${card.number}, ${card.status}. Slot ${slotNumber}. Open actions.`"
    @click="$emit('select')"
  >
    <img v-if="card.image" :src="card.image" :alt="card.name" loading="lazy" class="absolute inset-0 h-full w-full object-cover" />
    <div v-else class="absolute inset-0" :style="{ background: ART[card.color] }"></div>
    <div class="absolute inset-x-0 bottom-0 h-2/5" style="background:linear-gradient(transparent,rgba(0,0,0,.6))"></div>

    <span
      v-if="!card.image"
      class="absolute left-1.5 right-1.5 top-1.5 line-clamp-2 text-[10px] font-bold leading-tight text-white"
      style="text-shadow:0 1px 2px rgba(0,0,0,.6)"
    >{{ card.name }}</span>

    <span
      class="absolute left-1.5 right-1.5 bottom-1 flex justify-between gap-1 text-[9px] font-semibold text-white/90 tabular-nums"
      style="text-shadow:0 1px 2px rgba(0,0,0,.7)"
    >
      <span class="truncate">{{ card.set }}<template v-if="card.rarity"> {{ card.rarity }}</template></span>
      <span>{{ card.number }}</span>
    </span>

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
  </button>

  <button
    v-else
    class="relative grid aspect-63/88 place-items-center rounded-lg border-[1.5px] border-dashed border-line-strong bg-surface-2 text-ink-faint outline-none transition-colors hover:border-brand hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
    :aria-label="`Empty slot ${slotNumber}. Add a card.`"
    @click="$emit('insert')"
  >
    <span class="absolute left-1.5 top-1 text-[10px] font-semibold">{{ slotNumber }}</span>
    <Plus :size="18" class="opacity-60" />
  </button>
</template>
