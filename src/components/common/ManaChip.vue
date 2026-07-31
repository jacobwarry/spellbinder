<script setup lang="ts">
import type { Mana } from './types'
import ManaSymbol from './ManaSymbol.vue'

// An interactive colour pip (used by the collection/colour filters): the official
// Scryfall mana SVG, with a ring when selected. Symbol rendering lives in ManaSymbol.
withDefaults(
  defineProps<{ color: Mana; selected?: boolean; size?: number }>(),
  { selected: false, size: 32 }
)
</script>

<template>
  <span
    class="inline-grid place-items-center rounded-full select-none"
    :style="{
      width: size + 'px',
      height: size + 'px',
      boxShadow: selected ? '0 0 0 2px var(--surface), 0 0 0 4px var(--accent)' : undefined
    }"
  >
    <ManaSymbol :symbol="color" :size="size" />
  </span>
</template>
