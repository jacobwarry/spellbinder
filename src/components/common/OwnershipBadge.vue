<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { Check, X } from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import type { Ownership } from './types'

const props = defineProps<{ status: Ownership; class?: HTMLAttributes['class'] }>()

const map: Record<Ownership, { label: string; style: string }> = {
  owned: { label: 'Owned', style: 'color:var(--owned);background:var(--owned-soft)' },
  skipped: { label: 'Skipped', style: 'color:var(--skipped);background:var(--skipped-soft)' },
  missing: { label: 'Missing', style: 'color:var(--missing);background:var(--surface-2)' }
}
</script>

<template>
  <span
    :class="cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', props.class)"
    :style="map[status].style"
  >
    <Check v-if="status === 'owned'" :size="13" />
    <X v-else-if="status === 'skipped'" :size="13" />
    {{ map[status].label }}
  </span>
</template>
