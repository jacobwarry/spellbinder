import { ref, computed, watch, type Ref } from 'vue'

/**
 * Binder-spread core: the physical-binder page model + fit-to-viewport sizing.
 *
 * The mental model (see design-system/pages/binder-view.md §2): the user is
 * looking at a digital representation of their real binder. Page 1 sits alone
 * against the inside front cover; pages then pair into spreads (2–3, 4–5 …); a
 * lone last page sits against the inside back cover.
 *
 * Everything here is pure and unit-tested except the thin reactive glue at the
 * bottom (`useBinderSpread`). Sizing is *measured*, never device-assumed — the
 * caller feeds in the stage's measured width/height and we pick spread-vs-single.
 */

// Constants from the reference prototype (design-poc/binder-view.html).
export const SPREAD_GEOMETRY = {
  GAP: 6, // gap between slots (px)
  PAD: 10, // page padding (px)
  GUTTER: 28, // spine width between the two open pages (px)
  ASPECT: 88 / 63, // card height / width
  MIN_SPREAD_CARD: 84, // card-readability floor for choosing a spread
  MIN_CARD: 58, // clamp floor for the rendered card size
  MAX_CARD: 210, // clamp ceiling
  MIN_SPREAD_WIDTH: 620, // a spread also needs real horizontal room
  STAGE_INSET: 24 // stage padding subtracted from the measured size
} as const

export type BinderLayout = 'spread' | 'single'

export interface BinderGeometry {
  cols: number
  rows: number
}

/** 4×3 binders have 12 slots; everything else is treated as 3×3. */
export function gridDims(slotsPerPage: number): BinderGeometry {
  return { cols: slotsPerPage === 12 ? 4 : 3, rows: 3 }
}

/**
 * Spread views: page 1 alone, then pairs. A lone final page stays alone.
 * `spreadViews(6)` → `[[1],[2,3],[4,5],[6]]`.
 */
export function spreadViews(pageCount: number): number[][] {
  if (pageCount < 1) return []
  const views: number[][] = [[1]]
  for (let p = 2; p <= pageCount; p += 2) {
    views.push(p + 1 <= pageCount ? [p, p + 1] : [p])
  }
  return views
}

/** Single-page views: one page per step. `singleViews(3)` → `[[1],[2],[3]]`. */
export function singleViews(pageCount: number): number[][] {
  return Array.from({ length: Math.max(0, pageCount) }, (_, i) => [i + 1])
}

/** Which view (by index) contains a given 1-based page. */
export function viewIndexForPage(views: number[][], page: number): number {
  for (let i = 0; i < views.length; i++) {
    if (views[i]!.includes(page)) return i
  }
  return Math.min(views.length - 1, Math.max(0, page - 1))
}

export interface LayoutDecision {
  layout: BinderLayout
  cardPx: number
}

/**
 * The decision ladder: prefer a two-page spread when it fits the measured stage
 * with cards above the readability floor and there's real width; otherwise a
 * single page contained to the stage. Returns the chosen mode + the card pixel
 * size (clamped). Pure — drives off measured `stageW`/`stageH` only.
 */
export function decideLayout(stageW: number, stageH: number, geom: BinderGeometry): LayoutDecision {
  const {
    GAP, PAD, GUTTER, ASPECT,
    MIN_SPREAD_CARD, MIN_CARD, MAX_CARD, MIN_SPREAD_WIDTH, STAGE_INSET
  } = SPREAD_GEOMETRY
  const { cols, rows } = geom

  const sw = stageW - STAGE_INSET
  const sh = stageH - STAGE_INSET

  const heightCard = (sh - (rows - 1) * GAP - 2 * PAD) / (rows * ASPECT)

  // Single page: the full stage width holds one page.
  const singleWidthCard = (sw - (cols - 1) * GAP - 2 * PAD) / cols
  const single = Math.min(singleWidthCard, heightCard)

  // Spread: two pages + the spine share the stage width.
  const perPage = (sw - GUTTER) / 2
  const spreadWidthCard = (perPage - (cols - 1) * GAP - 2 * PAD) / cols
  const spread = Math.min(spreadWidthCard, heightCard)

  const useSpread = spread >= MIN_SPREAD_CARD && sw >= MIN_SPREAD_WIDTH
  const chosen = useSpread ? spread : single

  return {
    layout: useSpread ? 'spread' : 'single',
    cardPx: Math.max(MIN_CARD, Math.min(MAX_CARD, chosen))
  }
}

/** "Pages 4–5 of 24" for a two-page spread, else "Page 4 of 24". */
export function navLabel(view: number[], pageCount: number, layout: BinderLayout): string {
  if (layout === 'spread' && view.length === 2) {
    return `Pages ${view[0]}–${view[1]} of ${pageCount}`
  }
  return `Page ${view[0]} of ${pageCount}`
}

/** Progress as a 0–1 fraction of the last visible page over the total. */
export function navProgress(view: number[], pageCount: number): number {
  if (pageCount <= 0 || view.length === 0) return 0
  return view[view.length - 1]! / pageCount
}

export interface UseBinderSpreadOptions {
  pageCount: Ref<number>
  slotsPerPage: Ref<number>
  stageWidth: Ref<number>
  stageHeight: Ref<number>
}

/**
 * Reactive glue around the pure core. Tracks the current view as the stage is
 * measured and the layout flips; the current page is preserved across
 * spread↔single switches and overview jumps.
 */
export function useBinderSpread(opts: UseBinderSpreadOptions) {
  const geom = computed(() => gridDims(opts.slotsPerPage.value))
  const decision = computed(() =>
    decideLayout(opts.stageWidth.value, opts.stageHeight.value, geom.value)
  )
  const layout = computed(() => decision.value.layout)
  const cardPx = computed(() => decision.value.cardPx)

  const views = computed(() =>
    layout.value === 'spread' ? spreadViews(opts.pageCount.value) : singleViews(opts.pageCount.value)
  )

  const currentPage = ref(1)
  const viewIndex = ref(0)

  // Realign the view index to the current page whenever the view list changes
  // (layout flip or page-count change), so position survives the transition.
  watch(
    views,
    (vs) => {
      if (!vs.length) {
        viewIndex.value = 0
        return
      }
      viewIndex.value = Math.min(vs.length - 1, Math.max(0, viewIndexForPage(vs, currentPage.value)))
    },
    { immediate: true }
  )

  const currentView = computed<number[]>(() => views.value[viewIndex.value] ?? [1])
  watch(currentView, (v) => {
    if (v.length) currentPage.value = v[0]!
  })

  const canPrev = computed(() => viewIndex.value > 0)
  const canNext = computed(() => viewIndex.value < views.value.length - 1)

  /** Turn one view forward (+1) or back (-1). Returns the direction actually moved (0 if blocked). */
  function go(dir: 1 | -1): number {
    const next = viewIndex.value + dir
    if (next < 0 || next >= views.value.length) return 0
    viewIndex.value = next
    currentPage.value = currentView.value[0]!
    return dir
  }

  function goToPage(page: number) {
    currentPage.value = page
    viewIndex.value = viewIndexForPage(views.value, page)
  }

  const label = computed(() => navLabel(currentView.value, opts.pageCount.value, layout.value))
  const progress = computed(() => navProgress(currentView.value, opts.pageCount.value))
  const mode = computed(() => (layout.value === 'spread' ? 'Spread' : 'Single page'))

  return {
    geom,
    layout,
    cardPx,
    views,
    viewIndex,
    currentView,
    currentPage,
    canPrev,
    canNext,
    go,
    goToPage,
    label,
    progress,
    mode
  }
}
