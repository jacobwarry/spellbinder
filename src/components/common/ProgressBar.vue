<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import { cn } from '@/lib/utils'

// Thin completion bar. The caller still renders the numeric label alongside, so
// the bar is never the only signal (color-not-decorative-only).
const props = withDefaults(defineProps<{
  value: number // 0-100
  complete?: boolean
  class?: HTMLAttributes['class']
}>(), { complete: false })

const clamped = computed(() => Math.min(100, Math.max(0, props.value)))
</script>

<template>
  <div
    :class="cn('h-1.5 overflow-hidden rounded-full bg-surface-2', props.class)"
    role="progressbar"
    :aria-valuenow="Math.round(clamped)"
    aria-valuemin="0"
    aria-valuemax="100"
  >
    <div
      class="h-full rounded-full transition-[width] duration-300"
      :style="{ width: `${clamped}%`, background: complete ? 'var(--owned)' : 'var(--accent-grad)' }"
    />
  </div>
</template>
