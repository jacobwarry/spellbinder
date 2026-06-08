<script setup lang="ts">
import { Library } from 'lucide-vue-next'
import OwnershipBadge from './OwnershipBadge.vue'
import type { Mana, Ownership } from './types'

defineProps<{
  name: string
  set: string
  number: string
  color: Mana
  status: Ownership
  rarity?: string
  location?: string
  /** Real card art (Scryfall). When absent, falls back to the colour gradient. */
  image?: string
}>()

// Colour-identity gradient — the loading / missing-art fallback when no image.
const ART: Record<Mana, string> = {
  R: 'radial-gradient(circle at 50% 30%,#ff6a52,#a32417)',
  U: 'radial-gradient(circle at 50% 30%,#54b0f0,#1c5996)',
  G: 'radial-gradient(circle at 50% 30%,#54cf80,#1f7a40)',
  B: 'radial-gradient(circle at 50% 30%,#6a5f80,#211a2e)',
  W: 'radial-gradient(circle at 50% 30%,#f6ecc4,#cdb478)',
  C: 'radial-gradient(circle at 50% 30%,#c3bdd2,#797295)'
}
</script>

<template>
  <div class="group overflow-hidden rounded-md border border-line bg-surface shadow-(--shadow-1) transition duration-200 hover:-translate-y-1 hover:shadow-(--shadow-2)">
    <div class="relative aspect-63/88" :class="status !== 'owned' && 'grayscale brightness-90'">
      <img
        v-if="image"
        :src="image"
        :alt="name"
        loading="lazy"
        class="absolute inset-0 h-full w-full object-cover"
      />
      <div v-else class="absolute inset-0" :style="{ background: ART[color] }"></div>
    </div>
    <div class="p-3">
      <div class="line-clamp-2 min-h-10 text-sm font-semibold leading-tight">{{ name }}</div>
      <div class="mt-1 text-[11px] font-medium text-ink-faint tabular-nums">
        {{ set }} · {{ number.padStart(4, '0') }}<span v-if="rarity"> · {{ rarity }}</span>
      </div>
      <div v-if="location" class="mt-1.5 flex items-center gap-1.5 text-xs text-brand tabular-nums">
        <Library :size="13" />{{ location }}
      </div>
      <OwnershipBadge :status="status" class="mt-2.5" />
    </div>
  </div>
</template>
