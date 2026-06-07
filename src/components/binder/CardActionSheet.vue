<script setup lang="ts">
import { Sheet } from '@/components/ui/sheet'
import OwnershipBadge from '@/components/common/OwnershipBadge.vue'
import type { Mana, Ownership } from '@/components/common/types'
import { Check, Ban, Plus, Minus, ExternalLink, Trash2 } from 'lucide-vue-next'

defineProps<{
  name: string
  set: string
  number: string
  color: Mana
  status: Ownership
  spacerCount: number
  rarity?: string
  image?: string
  location?: string
}>()

const open = defineModel<boolean>('open', { default: false })

defineEmits<{
  toggleOwned: []
  toggleSkipped: []
  addSpacer: []
  removeSpacer: []
  openScryfall: []
  remove: []
}>()

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
    :description="`${set} · ${number}${rarity ? ' · ' + rarity : ''}`"
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

    <div class="mt-4 flex flex-col gap-2">
      <button :class="[actionClass, 'border-transparent! bg-primary! text-primary-foreground! hover:brightness-110 [&_svg]:text-primary-foreground!']" @click="$emit('toggleOwned')">
        <Check /> {{ status === 'owned' ? 'Mark as not owned' : 'Mark as owned' }}
      </button>
      <button :class="actionClass" @click="$emit('toggleSkipped')">
        <Ban /> {{ status === 'skipped' ? 'Unskip card' : 'Skip this card' }}
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

      <button :class="actionClass" @click="$emit('openScryfall')">
        <ExternalLink /> Open on Scryfall
      </button>
      <button :class="[actionClass, 'text-skipped! [&_svg]:text-skipped!']" @click="$emit('remove')">
        <Trash2 /> Remove from segment
      </button>
    </div>
  </Sheet>
</template>
