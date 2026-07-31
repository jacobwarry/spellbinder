<script setup lang="ts">
/**
 * Storage-box view: boxes are unlimited and linear (no pages), so we render
 * their cards as a single virtualized grid of BinderSlot tiles — the exact same
 * slot the binder uses (card art + set·№ band), so the experience is unified and
 * the printed card name is read straight off the art, just like the binder. The
 * card images are sized up to a readable scale rather than stretched edge-to-edge.
 */
import { ref, computed, watch } from 'vue'
import { useElementSize } from '@vueuse/core'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { Search, X } from 'lucide-vue-next'
import BinderSlot from './BinderSlot.vue'
import { SLOT_ASPECT } from '@/composables/useBinderSpread'
import { normalizeForSearch, cardMatchesQuery } from '@/utils/cardSearch'
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
  toggleFoil: [placement: CardPlacement]
}>()

const GAP = 14

const scrollEl = ref<HTMLElement | null>(null)
const { width } = useElementSize(scrollEl)

// Filter (not a highlight): a box is a flat, unlimited list with no spread to fade
// against, so typing hides the non-matches outright and the grid reflows. Matching
// is the same forgiving substring used by the binder highlight (see cardSearch).
const query = ref('')
const normalizedQuery = computed(() => normalizeForSearch(query.value))
const filteredItems = computed(() =>
  normalizedQuery.value
    ? props.items.filter(it => cardMatchesQuery(it.slot, normalizedQuery.value))
    : props.items
)
// A narrowed filter can leave us scrolled past the shorter list; jump back to top.
watch(normalizedQuery, () => { if (scrollEl.value) scrollEl.value.scrollTop = 0 })

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
  const items = filteredItems.value
  const out: BoxItem[][] = []
  for (let i = 0; i < items.length; i += cols) out.push(items.slice(i, i + cols))
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
  <div class="flex h-full flex-col">
    <!-- filter bar -->
    <div class="shrink-0 border-b border-line px-4 py-2">
      <div class="relative max-w-xs">
        <Search :size="15" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input
          v-model="query"
          type="text"
          placeholder="Filter cards…"
          aria-label="Filter cards in this box"
          class="h-10 w-full rounded-md border border-line bg-surface-2 pl-8 pr-8 text-sm text-foreground outline-none transition-colors placeholder:text-ink-faint focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          v-if="query"
          type="button"
          class="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-ink-faint outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Clear filter"
          @click="query = ''"
        >
          <X :size="14" />
        </button>
      </div>
    </div>

    <div ref="scrollEl" class="box-scroll min-h-0 flex-1 overflow-y-auto p-4">
      <p v-if="filteredItems.length === 0" class="py-6 text-center text-sm text-ink-soft">
        No cards match “{{ query }}”.
      </p>
      <div v-else :style="{ height: rowVirtualizer.getTotalSize() + 'px', position: 'relative', width: '100%' }">
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
              @toggle-foil="emit('toggleFoil', item.placement)"
            />
          </div>
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
