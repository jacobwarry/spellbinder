<script setup lang="ts">
/**
 * A single, portable card-size control: a slider over a tile min-width (px).
 * Replaces per-section column-tier buttons (3/4/5, S/M/L) so any card grid can
 * offer continuous sizing the same way. Pair with `useCardSize` to persist.
 */
import { Slider } from '@/components/ui/slider'
import { RectangleVertical } from 'lucide-vue-next'

withDefaults(defineProps<{
  min?: number
  max?: number
  step?: number
}>(), {
  min: 120,
  max: 260,
  step: 10
})

const model = defineModel<number>({ required: true })
</script>

<template>
  <div class="flex items-center gap-2.5" title="Adjust card size">
    <RectangleVertical :size="12" class="shrink-0 text-ink-faint" aria-hidden="true" />
    <Slider v-model="model" :min="min" :max="max" :step="step" aria-label="Card size" class="w-32" />
    <RectangleVertical :size="18" class="shrink-0 text-ink-faint" aria-hidden="true" />
  </div>
</template>
