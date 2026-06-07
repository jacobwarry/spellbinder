<script setup lang="ts">
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose
} from 'reka-ui'
import { X } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{ title: string; description?: string; size?: 'default' | 'lg' | 'xl' }>(),
  { size: 'default' }
)
const open = defineModel<boolean>('open', { default: false })

const sizeClass = { default: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-3xl' }[props.size]
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay
        class="fixed inset-0 z-40 bg-(--scrim) backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0"
      />
      <DialogContent
        :class="cn(
          'fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-6 shadow-(--shadow-2) focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
          sizeClass
        )"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle class="font-display text-lg font-bold tracking-tight">{{ title }}</DialogTitle>
            <DialogDescription v-if="description" class="mt-1 text-sm text-ink-soft">
              {{ description }}
            </DialogDescription>
          </div>
          <DialogClose
            class="grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-soft transition-colors hover:bg-surface-2 hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close"
          >
            <X :size="18" />
          </DialogClose>
        </div>

        <div class="mt-4">
          <slot />
        </div>

        <div v-if="$slots.footer" class="mt-6 flex justify-end gap-2">
          <slot name="footer" />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
