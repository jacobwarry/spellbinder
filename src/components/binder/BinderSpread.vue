<script setup lang="ts">
/**
 * The signature screen: a digital representation of a physical binder.
 * Renders the current one-or-two visible pages (cover / spine / rings / page
 * grids), fit to the measured stage, with page-turn nav (buttons, arrow keys,
 * drag/swipe), and an overview thumbnail grid for fast jumping.
 *
 * Presentational + reusable: it takes the binder geometry and a `pages` matrix
 * of slot cards and emits slot `select`/`insert`. The host owns the action
 * sheet and the real ownership/segment mutations. See
 * design-system/pages/binder-view.md.
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useElementSize } from '@vueuse/core'
import { ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-vue-next'
import BinderSlot from './BinderSlot.vue'
import { useBinderSpread, SPREAD_GEOMETRY } from '@/composables/useBinderSpread'
import type { BinderSlotCard, Mana } from '@/components/common/types'

const props = withDefaults(
  defineProps<{
    name: string
    pageCount: number
    slotsPerPage: number
    /** pages[pageIndex][slotIndex] = card or null (empty slot). */
    pages: (BinderSlotCard | null)[][]
    initialPage?: number
    /** Host sets true while a modal/sheet is open to suspend nav (keys + swipe). */
    paused?: boolean
    showToolbar?: boolean
  }>(),
  { initialPage: 1, paused: false, showToolbar: true }
)

const emit = defineEmits<{
  select: [pageNumber: number, slotIndex: number]
  insert: [pageNumber: number, slotIndex: number]
  pageChange: [page: number]
}>()

const { GAP, PAD, GUTTER, ASPECT } = SPREAD_GEOMETRY

const stageRef = ref<HTMLElement | null>(null)
const { width: stageWidth, height: stageHeight } = useElementSize(stageRef)

const pageCount = computed(() => props.pageCount)
const slotsPerPage = computed(() => props.slotsPerPage)

const {
  geom, layout, cardPx, currentView, currentPage,
  canPrev, canNext, go, goToPage, label, progress, mode
} = useBinderSpread({ pageCount, slotsPerPage, stageWidth, stageHeight })

onMounted(() => goToPage(props.initialPage))
watch(currentPage, (p) => emit('pageChange', p))

// ---- page geometry (px) ----
const pageHeight = computed(
  () => geom.value.rows * cardPx.value * ASPECT + (geom.value.rows - 1) * GAP + 2 * PAD
)
const pageWidth = computed(
  () => geom.value.cols * cardPx.value + (geom.value.cols - 1) * GAP + 2 * PAD
)
const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${geom.value.cols}, ${cardPx.value}px)`,
  gap: `${GAP}px`,
  padding: `${PAD}px`
}))
const ringCount = computed(() => geom.value.rows + 1)

// ---- what to draw in the leaf ----
type Part =
  | { type: 'page'; page: number; side: 'left' | 'right' | null }
  | { type: 'spine' }
  | { type: 'cover'; side: 'left' | 'right'; label: string }

const leafParts = computed<Part[]>(() => {
  const view = currentView.value
  if (layout.value !== 'spread') {
    return [{ type: 'page', page: view[0]!, side: null }]
  }
  if (view.length === 1 && view[0] === 1) {
    return [
      { type: 'cover', side: 'left', label: 'Inside front cover' },
      { type: 'spine' },
      { type: 'page', page: 1, side: 'right' }
    ]
  }
  if (view.length === 1) {
    return [
      { type: 'page', page: view[0]!, side: 'left' },
      { type: 'spine' },
      { type: 'cover', side: 'right', label: 'Inside back cover' }
    ]
  }
  return [
    { type: 'page', page: view[0]!, side: 'left' },
    { type: 'spine' },
    { type: 'page', page: view[1]!, side: 'right' }
  ]
})

function slotsForPage(page: number): (BinderSlotCard | null)[] {
  return props.pages[page - 1] ?? []
}

// ---- navigation + turn animation ----
const turnSeq = ref(0)
const turnDir = ref(0)
const animClass = computed(() => (turnDir.value > 0 ? 'anim-r' : turnDir.value < 0 ? 'anim-l' : ''))

function turn(dir: 1 | -1) {
  if (props.paused) return
  const moved = go(dir)
  if (moved) {
    turnDir.value = moved
    turnSeq.value++
  }
}

function onKey(e: KeyboardEvent) {
  if (overviewOpen.value) {
    if (e.key === 'Escape') overviewOpen.value = false
    return
  }
  if (props.paused) return
  if (e.key === 'ArrowRight') turn(1)
  else if (e.key === 'ArrowLeft') turn(-1)
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// ---- drag / swipe with live tracking ----
let drag: { x: number; moved: boolean; onCard: boolean } | null = null
const dragX = ref(0)
const leafStyle = computed(() => (dragX.value ? { transform: `translateX(${dragX.value * 0.5}px)` } : {}))

function onPointerDown(e: PointerEvent) {
  const onCard = !!(e.target as Element)?.closest?.('button')
  drag = { x: e.clientX, moved: false, onCard }
  if (!onCard) stageRef.value?.setPointerCapture?.(e.pointerId)
}
function onPointerMove(e: PointerEvent) {
  if (!drag || drag.onCard || props.paused) return
  const dx = e.clientX - drag.x
  if (Math.abs(dx) > 6) drag.moved = true
  if (drag.moved) dragX.value = dx
}
function onPointerUp(e: PointerEvent) {
  if (!drag) return
  if (!drag.onCard && drag.moved && !props.paused) {
    const dx = e.clientX - drag.x
    if (dx <= -60) turn(1)
    else if (dx >= 60) turn(-1)
  }
  dragX.value = 0
  drag = null
}

// ---- overview ----
const overviewOpen = ref(false)
function manaVar(color: Mana) {
  return `var(--mana-${color.toLowerCase()})`
}
function jumpTo(page: number) {
  goToPage(page)
  overviewOpen.value = false
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- toolbar -->
    <div v-if="showToolbar" class="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2">
      <div class="min-w-0">
        <p class="truncate font-display text-sm font-bold">{{ name }}</p>
        <p class="text-xs text-ink-faint tabular-nums">{{ geom.cols }}×{{ geom.rows }} · {{ pageCount }} pages</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-ink-soft">
          <span class="h-1.5 w-1.5 rounded-full bg-brand"></span>{{ mode }}
        </span>
        <button
          type="button"
          :aria-pressed="overviewOpen"
          class="inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :class="overviewOpen
            ? 'border-brand bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-brand'
            : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-brand'"
          @click="overviewOpen = !overviewOpen"
        >
          <LayoutGrid :size="18" />
          <span class="hidden sm:inline">Overview</span>
        </button>
      </div>
    </div>

    <!-- stage -->
    <div
      ref="stageRef"
      class="relative grid min-h-0 flex-1 touch-pan-y select-none place-items-center overflow-hidden p-3"
      style="background: radial-gradient(900px 500px at 50% -10%, var(--accent-glow), transparent 60%)"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="dragX = 0; drag = null"
    >
      <div class="flex items-start justify-center" :style="leafStyle">
        <template v-for="(part, i) in leafParts" :key="i">
          <!-- spine + rings -->
          <div
            v-if="part.type === 'spine'"
            class="relative shrink-0"
            :style="{ width: GUTTER + 'px', height: pageHeight + 'px',
              background: 'linear-gradient(90deg,var(--paper-edge),color-mix(in srgb,var(--paper-edge) 50%,transparent),var(--paper-edge))' }"
            aria-hidden="true"
          >
            <div class="absolute inset-y-0 left-1/2 flex -translate-x-1/2 flex-col justify-evenly py-3.5">
              <span
                v-for="r in ringCount"
                :key="r"
                class="h-3 w-3 rounded-full"
                style="background: radial-gradient(circle at 35% 30%, var(--ring-hi), var(--ring)); box-shadow: inset 0 -1px 2px rgba(0,0,0,.5), 0 1px 1px rgba(0,0,0,.3)"
              ></span>
            </div>
          </div>

          <!-- inside cover placeholder -->
          <div
            v-else-if="part.type === 'cover'"
            class="grid place-items-center rounded-xl border border-dashed border-line-strong p-3 text-center text-xs text-ink-faint"
            :style="{ width: pageWidth + 'px', height: pageHeight + 'px',
              background: 'repeating-linear-gradient(135deg,var(--surface-2),var(--surface-2) 10px,var(--surface) 10px,var(--surface) 20px)' }"
            aria-hidden="true"
          >
            <span>{{ part.label }}</span>
          </div>

          <!-- a binder page -->
          <div
            v-else
            :key="`page-${part.page}-${turnSeq}`"
            class="page border border-line-strong bg-(--paper) shadow-(--shadow-2)"
            :class="[part.side === 'left' ? 'rounded-l-xl rounded-r' : part.side === 'right' ? 'rounded-l rounded-r-xl' : 'rounded-xl', animClass]"
          >
            <div class="grid" :style="gridStyle">
              <BinderSlot
                v-for="(card, idx) in slotsForPage(part.page)"
                :key="idx"
                :slot-number="idx + 1"
                :card="card ?? undefined"
                @select="emit('select', part.page, idx)"
                @insert="emit('insert', part.page, idx)"
              />
            </div>
          </div>
        </template>
      </div>

      <!-- overview overlay -->
      <div v-if="overviewOpen" class="absolute inset-0 z-20 overflow-y-auto bg-background p-5">
        <div class="mx-auto max-w-275">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="font-display text-xl font-bold">All pages</h2>
            <button
              type="button"
              class="grid h-10 w-10 place-items-center rounded-md border border-line text-ink-soft outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close overview"
              @click="overviewOpen = false"
            >
              <ChevronLeft :size="18" />
            </button>
          </div>
          <div class="grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(120px, 1fr))">
            <button
              v-for="p in pageCount"
              :key="p"
              type="button"
              class="rounded-md border bg-surface p-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
              :class="p === currentPage ? 'border-brand ring-1 ring-brand' : 'border-line hover:border-line-strong'"
              @click="jumpTo(p)"
            >
              <div class="grid gap-0.75" :style="{ gridTemplateColumns: `repeat(${geom.cols}, 1fr)` }">
                <span
                  v-for="(card, idx) in slotsForPage(p)"
                  :key="idx"
                  class="aspect-63/88 rounded-xs"
                  :class="card ? (card.status !== 'owned' ? 'opacity-40' : '') : 'border border-dashed border-line-strong'"
                  :style="card ? { background: manaVar(card.color) } : undefined"
                ></span>
              </div>
              <p class="mt-2 text-center text-xs font-semibold tabular-nums text-ink-soft">Page {{ p }}</p>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- bottom page-turn nav -->
    <div class="flex shrink-0 items-center gap-3 border-t border-line px-4 py-2">
      <button
        type="button"
        :disabled="!canPrev"
        class="grid h-11 min-w-11 place-items-center rounded-md border border-line-strong bg-surface text-ink outline-none transition-colors hover:enabled:border-brand hover:enabled:text-brand disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Previous page"
        @click="turn(-1)"
      >
        <ChevronLeft :size="18" />
      </button>
      <div class="flex min-w-0 flex-1 flex-col items-center gap-1.5">
        <span class="whitespace-nowrap text-sm font-semibold tabular-nums text-ink-soft" aria-live="polite">{{ label }}</span>
        <div class="h-1.5 w-full max-w-72 overflow-hidden rounded-full bg-surface-2">
          <i class="block h-full rounded-full transition-[width] duration-300" :style="{ width: progress * 100 + '%', background: 'linear-gradient(90deg,var(--accent),var(--accent-2))' }"></i>
        </div>
      </div>
      <button
        type="button"
        :disabled="!canNext"
        class="grid h-11 min-w-11 place-items-center rounded-md border border-line-strong bg-surface text-ink outline-none transition-colors hover:enabled:border-brand hover:enabled:text-brand disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Next page"
        @click="turn(1)"
      >
        <ChevronRight :size="18" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.page {
  padding: 0;
  position: relative;
}
@keyframes inRight {
  from { transform: translateX(7%); opacity: 0; }
  to { transform: none; opacity: 1; }
}
@keyframes inLeft {
  from { transform: translateX(-7%); opacity: 0; }
  to { transform: none; opacity: 1; }
}
.anim-r { animation: inRight 0.26s cubic-bezier(0.22, 0.61, 0.36, 1); }
.anim-l { animation: inLeft 0.26s cubic-bezier(0.22, 0.61, 0.36, 1); }
@media (prefers-reduced-motion: reduce) {
  .anim-r, .anim-l { animation: none; }
}
</style>
