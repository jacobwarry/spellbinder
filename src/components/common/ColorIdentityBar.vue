<script setup lang="ts">
import { computed } from 'vue'
import type { ColorCounts } from './types'

const props = defineProps<{ counts: ColorCounts; label?: string }>()

const order = [
  ['w', 'White'], ['u', 'Blue'], ['b', 'Black'],
  ['r', 'Red'], ['g', 'Green'], ['c', 'Colorless']
] as const

const total = computed(() => Object.values(props.counts).reduce((a, b) => a + b, 0))
const pct = (n: number) => (total.value ? (n / total.value) * 100 : 0)
</script>

<template>
  <!-- The earned spectrum: the five colors flow together only here, because
       this is a true W/U/B/R/G breakdown of the collection (MASTER §2). -->
  <div class="rounded-md border border-line bg-surface p-4 shadow-(--shadow-1)">
    <div class="mb-3 flex items-center justify-between">
      <h3 class="text-[13px] font-semibold text-ink-soft">{{ label ?? 'Collection by color identity' }}</h3>
      <span class="text-xs text-ink-faint tabular-nums">{{ total }} cards</span>
    </div>
    <div class="flex h-3 gap-0.5 overflow-hidden rounded-full bg-surface-2">
      <span
        v-for="[k] in order"
        :key="k"
        :style="{ width: pct(counts[k]) + '%', background: `var(--mana-${k})` }"
      />
    </div>
    <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
      <span
        v-for="[k, name] in order"
        :key="k"
        class="inline-flex items-center gap-1.5 text-xs text-ink-soft tabular-nums"
      >
        <span class="h-2.5 w-2.5 rounded-[3px]" :style="{ background: `var(--mana-${k})` }" />{{ name }} · {{ counts[k] }}
      </span>
    </div>
  </div>
</template>
