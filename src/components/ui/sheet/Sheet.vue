<script setup lang="ts">
import { ref } from 'vue'
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription
} from 'reka-ui'

defineProps<{ title: string; description?: string }>()
const open = defineModel<boolean>('open', { default: false })

// Swipe-down to dismiss with live tracking.
const dragY = ref(0)
let startY: number | null = null

function onDown(e: PointerEvent) {
  startY = e.clientY
  dragY.value = 0
}
function onMove(e: PointerEvent) {
  if (startY === null) return
  const dy = e.clientY - startY
  if (dy > 0) dragY.value = dy
}
function onUp() {
  if (dragY.value > 90) open.value = false
  dragY.value = 0
  startY = null
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay
        class="fixed inset-0 z-40 bg-(--scrim) backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0"
      />
      <DialogContent
        class="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-lg rounded-t-2xl border-t border-line bg-surface px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_40px_rgba(0,0,0,.45)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom"
        :style="dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
      >
        <div class="mx-auto mb-3 h-1 w-9 rounded-full bg-line-strong" aria-hidden="true"></div>
        <DialogTitle class="font-display text-base font-bold tracking-tight">{{ title }}</DialogTitle>
        <DialogDescription v-if="description" class="mt-0.5 text-sm text-ink-soft">{{ description }}</DialogDescription>

        <div class="mt-3">
          <slot />
        </div>

        <div v-if="$slots.footer" class="mt-4">
          <slot name="footer" />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
