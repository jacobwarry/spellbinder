<script setup lang="ts">
/**
 * Storage-box view: boxes are unlimited and linear (no pages), so we render
 * their cards as a single virtualized grid of slots, reusing BinderSlot and the
 * same tap → action sheet flow as the binder. Part of the same visual system,
 * minus the page/spread chrome.
 */
import { ref, computed } from 'vue'
import { useElementSize } from '@vueuse/core'
import { useVirtualizer } from '@tanstack/vue-virtual'
import BinderSlot from './BinderSlot.vue'
import { SLOT_ASPECT } from '@/composables/useBinderSpread'
import type { BinderSlotCard } from '@/components/common/types'
import type { CardPlacement } from '@/types/placement'

interface BoxItem {
  slot: BinderSlotCard
  placement: CardPlacement
}

const props = defineProps<{ items: BoxItem[] }>()
const emit = defineEmits<{ select: [placement: CardPlacement] }>()

const TILE_MIN = 150
const GAP = 12

const scrollEl = ref<HTMLElement | null>(null)
const { width } = useElementSize(scrollEl)

const columnCount = computed(() => {
  const w = width.value
  if (!w) return 1
  return Math.max(1, Math.floor((w + GAP) / (TILE_MIN + GAP)))
})

const rows = computed(() => {
  const cols = columnCount.value
  const out: BoxItem[][] = []
  for (let i = 0; i < props.items.length; i += cols) out.push(props.items.slice(i, i + cols))
  return out
})

const estimatedRowHeight = computed(() => {
  const cols = columnCount.value
  const w = width.value || TILE_MIN * cols
  const colWidth = (w - (cols - 1) * GAP) / cols
  return colWidth * SLOT_ASPECT + GAP
})

const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: rows.value.length,
    getScrollElement: () => scrollEl.value,
    estimateSize: () => estimatedRowHeight.value,
    overscan: 4,
    gap: GAP
  }))
)

function measureRow(el: unknown) {
  if (el) rowVirtualizer.value.measureElement(el as Element)
}
</script>

<template>
  <div ref="scrollEl" class="h-full overflow-y-auto p-4">
    <div :style="{ height: rowVirtualizer.getTotalSize() + 'px', position: 'relative', width: '100%' }">
      <div
        v-for="vRow in rowVirtualizer.getVirtualItems()"
        :key="vRow.index"
        :data-index="vRow.index"
        :ref="measureRow"
        :style="{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vRow.start}px)` }"
      >
        <div class="grid" :style="{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`, gap: GAP + 'px' }">
          <BinderSlot
            v-for="(item, i) in rows[vRow.index] ?? []"
            :key="i"
            :slot-number="vRow.index * columnCount + i + 1"
            :card="item.slot"
            @select="emit('select', item.placement)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
