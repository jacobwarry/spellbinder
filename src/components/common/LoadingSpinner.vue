<script setup lang="ts">
/**
 * Loading indicator built on the MTG planeswalker mark. The rotation uses an
 * ease-in curve per revolution (slow start, accelerating to fast just before
 * 360°) and loops — so each turn "winds up" and restarts rather than spinning at
 * a constant rate. Respects prefers-reduced-motion.
 *
 * The mark is a transparent PNG (dark artwork), so it's inverted in dark mode to
 * stay legible against dark surfaces.
 */
import planeswalkerMark from '@/assets/planeswalker.png'

withDefaults(defineProps<{
  size?: number
  label?: string
}>(), {
  size: 52,
  label: 'Loading…'
})
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-3" role="status" :aria-label="label">
    <img
      :src="planeswalkerMark"
      class="mtg-spinner object-contain dark:invert"
      :style="{ width: `${size}px`, height: `${size}px` }"
      alt=""
      aria-hidden="true"
    />
    <span class="text-sm text-ink-soft">{{ label }}</span>
  </div>
</template>

<style scoped>
.mtg-spinner {
  transform-origin: 50% 50%;
  /* easeInCubic: slow at the start, fast near the end of each full rotation */
  animation: mtg-spin 1.25s cubic-bezier(0.32, 0, 0.67, 0) infinite;
}

@keyframes mtg-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes mtg-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

@media (prefers-reduced-motion: reduce) {
  .mtg-spinner {
    animation: mtg-pulse 1.6s ease-in-out infinite;
  }
}
</style>
