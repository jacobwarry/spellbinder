<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { DropdownMenuItem } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
  disabled?: boolean
  destructive?: boolean
}>()
</script>

<template>
  <DropdownMenuItem
    :disabled="disabled"
    :class="cn(
      'flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none transition-colors',
      'data-[highlighted]:bg-secondary data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
      destructive ? 'text-skipped data-[highlighted]:bg-(--skipped-soft)' : 'text-foreground',
      props.class
    )"
  >
    <slot />
  </DropdownMenuItem>
</template>
