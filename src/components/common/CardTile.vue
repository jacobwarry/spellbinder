<script setup lang="ts">
import { computed } from 'vue'
import { Library } from 'lucide-vue-next'
import OwnershipBadge from './OwnershipBadge.vue'
import type { Mana, Ownership } from './types'

const props = defineProps<{
  name: string
  set: string
  number: string
  color: Mana
  status: Ownership
  rarity?: string
  type?: string
  location?: string
}>()

// Placeholder art keyed by colour identity. Real Scryfall art replaces the
// gradient when wired in (P5); the gradient is the loading/missing-art fallback.
const ART: Record<Mana, string> = {
  R: 'radial-gradient(circle at 50% 30%,#ff6a52,#a32417)',
  U: 'radial-gradient(circle at 50% 30%,#54b0f0,#1c5996)',
  G: 'radial-gradient(circle at 50% 30%,#54cf80,#1f7a40)',
  B: 'radial-gradient(circle at 50% 30%,#6a5f80,#211a2e)',
  W: 'radial-gradient(circle at 50% 30%,#f6ecc4,#cdb478)',
  C: 'radial-gradient(circle at 50% 30%,#c3bdd2,#797295)'
}
const isLight = computed(() => props.color === 'W' || props.color === 'C')
</script>

<template>
  <div class="group overflow-hidden rounded-md border border-line bg-surface shadow-(--shadow-1) transition duration-200 hover:-translate-y-1 hover:shadow-(--shadow-2)">
    <div class="relative aspect-63/88" :class="status !== 'owned' && 'grayscale brightness-90'">
      <div class="absolute inset-0" :style="{ background: ART[color] }"></div>
      <div class="absolute inset-x-0 bottom-0 h-1/3" style="background:linear-gradient(transparent,rgba(0,0,0,.45))"></div>
      <div
        class="absolute left-2.5 right-2.5 top-2.5 text-[13px] font-bold leading-tight"
        :style="{ color: isLight ? '#3a2f12' : '#fff', textShadow: isLight ? 'none' : '0 1px 3px rgba(0,0,0,.6)' }"
      >{{ name }}</div>
      <div
        v-if="type"
        class="absolute bottom-2.5 left-2.5 text-[11px] font-medium"
        :style="{ color: isLight ? 'rgba(58,47,18,.85)' : 'rgba(255,255,255,.9)' }"
      >{{ type }}</div>
    </div>
    <div class="p-3">
      <div class="text-[11px] font-medium text-ink-faint tabular-nums">
        {{ set }} · {{ number }}<span v-if="rarity"> · {{ rarity }}</span>
      </div>
      <div v-if="location" class="mt-1.5 flex items-center gap-1.5 text-xs text-brand tabular-nums">
        <Library :size="13" />{{ location }}
      </div>
      <OwnershipBadge :status="status" class="mt-2.5" />
    </div>
  </div>
</template>
