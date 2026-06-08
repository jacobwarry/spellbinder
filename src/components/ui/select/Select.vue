<script setup lang="ts" generic="T extends string | number | null | undefined">
import type { HTMLAttributes } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

defineProps<{ class?: HTMLAttributes['class'] }>()
const model = defineModel<T>()
</script>

<template>
  <div class="relative w-full">
    <select
      v-model="model"
      :class="cn(
        'h-11 w-full cursor-pointer appearance-none rounded-md border border-input bg-surface-2 pl-3.5 pr-9 text-base text-foreground',
        'outline-none transition-colors',
        'focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-(--accent-glow)',
        'disabled:pointer-events-none disabled:opacity-40',
        $props.class
      )"
    >
      <slot />
    </select>
    <ChevronDown :size="16" class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft" />
  </div>
</template>
