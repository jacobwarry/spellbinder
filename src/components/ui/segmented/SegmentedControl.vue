<script setup lang="ts" generic="T extends string">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

defineProps<{ options: { value: T; label: string }[]; class?: HTMLAttributes['class'] }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div :class="cn('inline-flex gap-0.5 rounded-full bg-surface-2 p-1', $props.class)" role="tablist">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      role="tab"
      :aria-selected="model === o.value"
      class="rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
      :class="model === o.value
        ? 'bg-surface text-foreground shadow-(--shadow-1)'
        : 'text-ink-soft hover:text-foreground'"
      @click="model = o.value"
    >
      {{ o.label }}
    </button>
  </div>
</template>
