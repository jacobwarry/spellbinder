<script setup lang="ts">
/**
 * Storage-box view: boxes are unlimited and linear (no pages), so we render
 * their cards as a single virtualized grid of BinderSlot tiles — the exact same
 * slot the binder uses (card art + set·№ band), so the experience is unified and
 * the printed card name is read straight off the art, just like the binder. The
 * card images are sized up to a readable scale rather than stretched edge-to-edge.
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

const props = withDefaults(defineProps<{
  items: BoxItem[]
  /** Card size as a tile min-width (px); columns auto-fit, cards fill the row. */
  tileSize?: number
}>(), {
  tileSize: 170
})
const emit = defineEmits<{
  select: [placement: CardPlacement]
  toggleOwned: [placement: CardPlacement]
}>()

const GAP = 14

const scrollEl = ref<HTMLElement | null>(null)
const { width } = useElementSize(scrollEl)

// Columns auto-fit the chosen card size; cards then fill the row evenly (the same
// min-width model the Decks/Search grids use).
const columnCount = computed(() => {
  const w = width.value
  if (!w) return 1
  return Math.max(1, Math.floor((w + GAP) / (props.tileSize + GAP)))
})

const colWidth = computed(() => {
  const w = width.value
  const cols = columnCount.value
  if (!w) return props.tileSize
  return (w - (cols - 1) * GAP) / cols
})

const rows = computed(() => {
  const cols = columnCount.value
  const out: BoxItem[][] = []
  for (let i = 0; i < props.items.length; i += cols) out.push(props.items.slice(i, i + cols))
  return out
})

const estimatedRowHeight = computed(() => colWidth.value * SLOT_ASPECT + GAP)

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
  <div ref="scrollEl" class="box-scroll h-full overflow-y-auto p-4">
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
            @toggle-owned="emit('toggleOwned', item.placement)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
 * The box is a primary scrolling surface, but the global thin scrollbar's
 * --line-strong thumb is nearly invisible against the box's bg-surface in dark
 * mode. Give it a higher-contrast thumb and reserve a stable gutter so the
 * scroll affordance is unmistakable and the grid doesn't shift when it appears.
 */
.box-scroll {
  scrollbar-gutter: stable;
  scrollbar-color: var(--ink-faint) transparent;
}
.box-scroll::-webkit-scrollbar {
  width: 12px;
}
.box-scroll::-webkit-scrollbar-thumb {
  background-color: var(--ink-faint);
  border-radius: 100px;
  border: 3px solid transparent;
  background-clip: padding-box;
}
.box-scroll::-webkit-scrollbar-thumb:hover {
  background-color: var(--ink-soft);
}
</style>
