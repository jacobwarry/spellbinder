<script setup lang="ts">
import { computed } from 'vue'
import type { Mana } from './types'

const props = withDefaults(
  defineProps<{ color: Mana; selected?: boolean; size?: number }>(),
  { selected: false, size: 32 }
)

const bg = computed(() => `var(--mana-${props.color.toLowerCase()})`)
// White/Colorless are light fills → dark glyph; the rest take white.
const fg = computed(() => (props.color === 'W' || props.color === 'C' ? '#3a2f12' : '#fff'))
</script>

<template>
  <span
    class="inline-grid place-items-center rounded-full font-bold select-none"
    :style="{
      width: size + 'px',
      height: size + 'px',
      fontSize: Math.round(size * 0.4) + 'px',
      background: bg,
      color: fg,
      boxShadow: selected ? '0 0 0 2px var(--surface), 0 0 0 4px var(--accent)' : undefined
    }"
  >{{ color }}</span>
</template>
