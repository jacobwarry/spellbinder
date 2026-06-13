<script setup lang="ts">
import { computed } from 'vue'
import { SliderRoot, SliderTrack, SliderRange, SliderThumb } from 'reka-ui'
import { cn } from '@/lib/utils'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  min?: number
  max?: number
  step?: number
  ariaLabel?: string
  class?: string
}>(), {
  min: 0,
  max: 100,
  step: 1
})

const model = defineModel<number>({ default: 0 })

// reka-ui's SliderRoot models an array of thumb values; we expose a single number.
const arrayModel = computed<number[]>({
  get: () => [model.value],
  set: (v) => { if (v[0] !== undefined) model.value = v[0] }
})
</script>

<template>
  <SliderRoot
    v-model="arrayModel"
    :min="props.min"
    :max="props.max"
    :step="props.step"
    :class="cn('relative flex h-5 w-full min-w-24 touch-none select-none items-center', props.class)"
  >
    <SliderTrack class="relative h-1.5 grow overflow-hidden rounded-full bg-surface-3">
      <SliderRange class="absolute h-full rounded-full bg-brand" />
    </SliderTrack>
    <SliderThumb
      :aria-label="props.ariaLabel"
      class="block size-4 shrink-0 rounded-full border-2 border-brand bg-surface shadow-(--shadow-1) outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring"
    />
  </SliderRoot>
</template>
