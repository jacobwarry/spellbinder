<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{ label: string; value: string | number; icon?: Component; sub?: string }>()
</script>

<template>
  <div class="rounded-md border border-line bg-surface p-4 shadow-(--shadow-1)">
    <div class="flex items-center gap-2 text-ink-faint">
      <component :is="icon" v-if="icon" :size="16" />
      <span class="text-[13px] font-medium">{{ label }}</span>
    </div>
    <div class="mt-1.5 font-display text-3xl font-bold tracking-tight tabular-nums">
      {{ value }}
      <span v-if="sub" class="text-sm font-semibold text-owned">{{ sub }}</span>
    </div>
  </div>
</template>
