<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

defineProps<{ class?: HTMLAttributes['class'] }>()
const model = defineModel<string | number>()
</script>

<template>
  <input
    v-model="model"
    :class="cn(
      'flex h-11 w-full rounded-md border border-input bg-surface-2 px-3.5 text-base text-foreground',
      'placeholder:text-ink-faint outline-none transition-colors',
      'focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-(--accent-glow)',
      'disabled:opacity-40 disabled:pointer-events-none',
      $props.class
    )"
  />
</template>
