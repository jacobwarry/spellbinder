<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { ScryfallSet, ScryfallCard, BinderPlan, Binder, Segment, BoxSortMode } from '@/types'
import { getPlacementOwnershipKey, type CardPlacement } from '@/types/placement'
import { getCardImageUri, getCardFaceName, isDoubleFaced, refreshCard, fetchSets, compareCollectorNumber } from '@/api/scryfall'
import { getBinderImage, binderImageVersion } from '@/utils/binderImages'
import { useBindersStore, useSegmentsStore, usePlansStore, useCollectionStore, usePricesStore } from '@/stores'
import { calculatePlacements, type PlacementResult } from '@/composables/usePlacement'
import { useAllPlacements, buildBinderStats, buildBinderValues, sumPlacementsValue } from '@/composables/useAllPlacements'
import { coverageLabel, missingCoverageLabel, emptyValue, type ValueSummary } from '@/utils/value'
import { formatEurAmount } from '@/utils/price'
import type { Mana, Ownership, BinderSlotCard } from '@/components/common/types'
import BinderCard from '@/components/binder/BinderCard.vue'
import StorageDialog from '@/components/binder/StorageDialog.vue'
import BinderSpread from '@/components/binder/BinderSpread.vue'
import CardActionSheet from '@/components/binder/CardActionSheet.vue'
import BoxView from '@/components/binder/BoxView.vue'
import SetStats from '@/components/sets/SetStats.vue'
import { SegmentedControl } from '@/components/ui/segmented'
import SegmentCard from '@/components/segments/SegmentCard.vue'
import AddCardsDialog from '@/components/sets/AddCardsDialog.vue'
import CardSearchModal from '@/components/cards/CardSearchModal.vue'
import CardSizeControl from '@/components/common/CardSizeControl.vue'
import { useCardSize } from '@/composables/useCardSize'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Dialog } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { isStorageBox, isPhysicalBinder } from '@/stores/binders'
import { Plus, ArrowLeft, Pencil, Check, X, Trash2, Lightbulb, Coins, Upload } from 'lucide-vue-next'
import NewSetDialog from '@/components/plans/NewSetDialog.vue'
import ImportSetDialog from '@/components/sets/ImportSetDialog.vue'

const route = useRoute()
const router = useRouter()

const bindersStore = useBindersStore()
const segmentsStore = useSegmentsStore()
const plansStore = usePlansStore()
const collectionStore = useCollectionStore()
const pricesStore = usePricesStore()

// Get current plan ID from route params
const currentPlanId = computed(() => {
  const planId = route.params.id as string | undefined
  return planId ?? null
})
const showBinderForm = ref(false)
const editingBinder = ref<Binder | null>(null)
const showNewSetDialog = ref(false)
const showImportDialog = ref(false)
// Unified "add cards from a set" flow. 'segment' = add as a plan segment,
// 'box' = add cards into the currently-viewed storage box (auto-owned).
const addCardsMode = ref<'segment' | 'box' | null>(null)
// Append multi-selected cards to an EXISTING segment. `set` is pre-resolved for
// set-backed segments (skips the picker's set-selector step); null for custom
// sections, which let you pick any set first.
const appendTarget = ref<{ segmentId: string; set: ScryfallSet | null } | null>(null)
// User-adjustable card size for the box grid (tile min-width, px), persisted.
const boxCardSize = useCardSize('spellbinder-cardsize-box', 170)
const placementResult = ref<PlacementResult | null>(null)
const selectedBinderForView = ref<string | null>(null)
const selectedPage = ref(1)
// Page number(s) currently visible in the binder viewer, reported by BinderSpread.
// Drives which segment card is highlighted as "currently viewing".
const visiblePages = ref<number[]>([])
const editingPlanName = ref(false)
const planNameInput = ref('')
// Sidebar drill-in: when a set is selected the panel shows its working data
// (storage + segments). Toggling this swaps back to the full set list to switch.
const showSetList = ref(false)
const showDeleteConfirm = ref(false)
// Drives the card-search dialog. 'insert' places the picked card at a specific binder
// slot (into the neighbouring segment); 'append' adds it to the end of a segment
// (used for custom sections, which aren't tied to one set).
type CardSearchTarget =
  | {
      mode: 'insert'
      binderId: string
      pageNumber: number
      slotOnPage: number
      segmentId: string
      segmentName: string
      setCode: string
      insertBeforeCardId: string | null
    }
  | { mode: 'append'; segmentId: string; segmentName: string; setCode: string }
const cardSearch = ref<CardSearchTarget | null>(null)

const currentPlan = computed(() =>
  currentPlanId.value ? plansStore.getPlan(currentPlanId.value) : null
)

const sortedPlans = computed(() =>
  [...plansStore.plans].sort((a, b) => a.name.localeCompare(b.name))
)

// Overview filter: narrow the set grid to sets that contain a given storage type.
// A set can hold both, but in practice it's usually one or the other, so this is a
// quick way to see just your binder sets or just your box sets.
const storageFilter = ref<'all' | 'binders' | 'boxes'>('all')
const storageFilterOptions = [
  { value: 'all' as const, label: 'All' },
  { value: 'binders' as const, label: 'Binders' },
  { value: 'boxes' as const, label: 'Boxes' }
]
const filteredPlans = computed(() => {
  if (storageFilter.value === 'all') return sortedPlans.value
  return sortedPlans.value.filter((plan) => {
    const containers = bindersStore.getBindersInOrder(plan.binderIds)
    return storageFilter.value === 'binders'
      ? containers.some(isPhysicalBinder)
      : containers.some(isStorageBox)
  })
})

interface PlanCompletion { percent: number; owned: number; total: number }
const planCompletion = computed(() => {
  const m = new Map<string, PlanCompletion>()
  for (const plan of plansStore.plans) {
    const segments = segmentsStore.getSegmentsInOrder(plan.segmentIds)
    let totalCards = 0
    let ownedCards = 0
    let skippedCards = 0
    for (const segment of segments) {
      totalCards += segment.cardIds.length
      for (let i = 0; i < segment.cardIds.length; i++) {
        const key = `${segment.id}:${i}`
        if (collectionStore.isOwned(key)) {
          ownedCards++
        } else if (collectionStore.isSkipped(key)) {
          skippedCards++
        }
      }
    }
    const effectiveTotal = totalCards - skippedCards
    m.set(plan.id, {
      percent: effectiveTotal > 0 ? Math.round((ownedCards / effectiveTotal) * 100) : 0,
      owned: ownedCards,
      total: effectiveTotal
    })
  }
  return m
})

// A set stored only in boxes has no fixed capacity to complete toward (boxes are
// unlimited), so a completion % is meaningless — we show the owned count instead.
// Mixed sets (any physical binder present) keep the percentage.
const planIsBoxOnly = computed(() => {
  const m = new Map<string, boolean>()
  for (const plan of plansStore.plans) {
    const containers = bindersStore.getBindersInOrder(plan.binderIds)
    m.set(plan.id, containers.length > 0 && containers.every(isStorageBox))
  }
  return m
})

// Calculate cards per binder for all plans (for overview section)
const { allPlacements } = useAllPlacements()

// Per-binder planned/owned stats for the overview, derived from all-plan placements.
const allPlansBinderStats = computed(() =>
  buildBinderStats(allPlacements.value.values(), (key) => collectionStore.isOwned(key))
)

// Owned EUR value (reactive on prices + ownership) for the overview: per binder and
// rolled up per plan/set. Reads the prices store so it recomputes as prices land.
const getPrice = (id: string) => pricesStore.getPrice(id)
const ownedNonFoil = (k: string) => collectionStore.isOwnedNonFoil(k)
const ownedFoil = (k: string) => collectionStore.isOwnedFoil(k)
const skipped = (k: string) => collectionStore.isSkipped(k)
const allPlansBinderValues = computed(() =>
  buildBinderValues(allPlacements.value.values(), getPrice, ownedNonFoil, ownedFoil, skipped)
)
const planValues = computed(() => {
  const m = new Map<string, ValueSummary>()
  for (const [planId, result] of allPlacements.value) {
    m.set(planId, sumPlacementsValue(result.placements, getPrice, ownedNonFoil, ownedFoil, skipped))
  }
  return m
})
// Combined owned value across every set, for the overview banner.
// Every unique card id across all sets — the batch "fetch all prices" target.
const allSetCardIds = computed(() => {
  const ids = new Set<string>()
  for (const plan of plansStore.plans) {
    for (const seg of segmentsStore.getSegmentsInOrder(plan.segmentIds)) {
      for (const id of seg.cardIds) ids.add(id)
    }
  }
  return [...ids]
})
function fetchAllPrices() {
  void pricesStore.fetchPricesFor(allSetCardIds.value)
}

const allSetsValue = computed(() => {
  const total = emptyValue()
  for (const v of planValues.value.values()) {
    total.value += v.value
    total.ownedCount += v.ownedCount
    total.pricedCount += v.pricedCount
    total.missingValue += v.missingValue
    total.missingCount += v.missingCount
    total.missingPricedCount += v.missingPricedCount
  }
  return total
})

function planValueLabel(planId: string): string | null {
  const v = planValues.value.get(planId)
  return v && v.pricedCount > 0 ? formatEurAmount(v.value) : null
}
function planValueTitle(planId: string): string | undefined {
  const v = planValues.value.get(planId)
  return v ? coverageLabel(v) : undefined
}
function planMissingLabel(planId: string): string | null {
  const v = planValues.value.get(planId)
  return v && v.missingPricedCount > 0 ? formatEurAmount(v.missingValue) : null
}
function planMissingTitle(planId: string): string | undefined {
  const v = planValues.value.get(planId)
  return v ? missingCoverageLabel(v) : undefined
}

const planBinders = computed(() =>
  currentPlan.value ? bindersStore.getBindersInOrder(currentPlan.value.binderIds) : []
)

const planSegments = computed(() =>
  currentPlan.value ? segmentsStore.getSegmentsInOrder(currentPlan.value.segmentIds) : []
)

// Cards can only be placed into storage, so a plan needs at least one binder/box
// before segments are worth adding.
const hasStorage = computed(() => planBinders.value.length > 0)

// Boxes are unlimited, so a plan containing one has no meaningful total capacity.
const planHasBox = computed(() => planBinders.value.some(isStorageBox))

// Reset transient header state whenever the active set changes (covers in-app
// navigation and direct URL changes), so edit/confirm UI never leaks across sets.
watch(currentPlanId, () => {
  editingPlanName.value = false
  showDeleteConfirm.value = false
  mainView.value = 'binder'
})

const viewingBinder = computed(() =>
  selectedBinderForView.value ? bindersStore.getBinder(selectedBinderForView.value) : null
)

const currentBinderPlacements = computed(() => {
  if (!viewingBinder.value || !placementResult.value) return []
  return placementResult.value.placements.filter(p => p.binderId === viewingBinder.value!.id)
})

// Main-area tab for a selected set: the card viewer vs the stats/search view.
const mainView = ref<'binder' | 'stats'>('binder')
const mainViewOptions = [
  { value: 'binder' as const, label: 'Cards' },
  { value: 'stats' as const, label: 'Stats' }
]
const planPlacements = computed(() => placementResult.value?.placements ?? [])

// Segments with at least one card on the page(s) currently visible in the viewer.
// Used to highlight the segment you're looking at; updates live as pages turn.
const activeSegmentIds = computed(() => {
  const ids = new Set<string>()
  if (!viewingBinder.value || visiblePages.value.length === 0) return ids
  const pages = new Set(visiblePages.value)
  for (const p of currentBinderPlacements.value) {
    if (pages.has(p.pageNumber)) ids.add(p.segmentId)
  }
  return ids
})

// ---- Binder viewer: card → slot mapping + the pages matrix (P10) ----
const MANA_BY_LETTER: Record<string, Mana> = { W: 'W', U: 'U', B: 'B', R: 'R', G: 'G' }
function cardMana(card: ScryfallCard): Mana {
  const ci = card.color_identity ?? []
  return ci.length === 1 ? (MANA_BY_LETTER[ci[0]!] ?? 'C') : 'C'
}
const RARITY_SHORT: Record<string, string> = { common: 'C', uncommon: 'U', rare: 'R', mythic: 'M' }
function rarityShort(r: string): string {
  return RARITY_SHORT[r.toLowerCase()] ?? r.charAt(0).toUpperCase()
}
function placementStatus(p: CardPlacement): Ownership {
  const key = getPlacementOwnershipKey(p)
  return collectionStore.isOwned(key) ? 'owned' : collectionStore.isSkipped(key) ? 'skipped' : 'missing'
}
function placementToSlot(p: CardPlacement): BinderSlotCard {
  const price = pricesStore.getPrice(p.card.id)
  const key = getPlacementOwnershipKey(p)
  return {
    name: getCardFaceName(p.card, p.face ?? 0),
    set: p.card.set.toUpperCase(),
    number: p.card.collector_number.padStart(4, '0'),
    color: cardMana(p.card),
    multicolor: (p.card.color_identity?.length ?? 0) > 1,
    status: placementStatus(p),
    rarity: rarityShort(p.card.rarity),
    image: getCardImageUri(p.card, 'normal', p.face ?? 0) ?? undefined,
    eur: price?.eur,
    eurFoil: price?.eurFoil,
    priceFetchedAt: price?.fetchedAt,
    ownsNonFoil: collectionStore.isOwnedNonFoil(key),
    ownsFoil: collectionStore.isOwnedFoil(key),
    canNonFoil: p.card.finishes ? p.card.finishes.includes('nonfoil') : true,
    canFoil: p.card.finishes ? p.card.finishes.includes('foil') : true
  }
}

// Card ids to price when the user clicks "Fetch prices". For binders this is the
// current spread (the pages on screen); boxes have no spreads, so we take the whole box.
const visibleCardIds = computed(() => {
  if (!viewingBinder.value) return []
  if (viewingBinder.value.type === 'box') {
    return currentBinderPlacements.value.map(p => p.card.id)
  }
  const pages = new Set(visiblePages.value)
  return currentBinderPlacements.value.filter(p => pages.has(p.pageNumber)).map(p => p.card.id)
})
function fetchVisiblePrices() {
  void pricesStore.fetchPricesFor(visibleCardIds.value)
}

// pages[pageIndex][slotIndex] = slot card (or null) + a lookup back to the placement.
interface BinderLayout { pages: (BinderSlotCard | null)[][]; meta: Map<string, CardPlacement> }
const binderLayout = computed<BinderLayout | null>(() => {
  const binder = viewingBinder.value
  if (!binder || binder.type !== 'binder') return null
  const spp = binder.slotsPerPage
  const pages: (BinderSlotCard | null)[][] = Array.from({ length: binder.pageCount }, () => Array(spp).fill(null))
  const meta = new Map<string, CardPlacement>()
  for (const p of currentBinderPlacements.value) {
    const slot0 = p.slotOnPage - 1
    if (p.pageNumber < 1 || p.pageNumber > binder.pageCount || slot0 < 0 || slot0 >= spp) continue
    pages[p.pageNumber - 1]![slot0] = placementToSlot(p)
    meta.set(`${p.pageNumber}:${slot0}`, p)
  }
  return { pages, meta }
})
const viewingBinderPages = computed(() => binderLayout.value?.pages ?? [])

// Uploaded binder cover for the viewing binder (shown on the cover pages).
const viewingBinderCover = ref<string | null>(null)
watch([() => viewingBinder.value?.id, binderImageVersion], async () => {
  if (viewingBinderCover.value) {
    URL.revokeObjectURL(viewingBinderCover.value)
    viewingBinderCover.value = null
  }
  const b = viewingBinder.value
  if (b && b.type === 'binder') {
    try {
      viewingBinderCover.value = await getBinderImage(b.id)
    } catch { /* no cover */ }
  }
}, { immediate: true })

// Whether the viewing binder has neighbours, so edge page-turns can hop binders.
const viewingBinderIndex = computed(() => planBinders.value.findIndex(b => b.id === selectedBinderForView.value))
const hasPrevBinderView = computed(() => viewingBinderIndex.value > 0)
const hasNextBinderView = computed(() => viewingBinderIndex.value >= 0 && viewingBinderIndex.value < planBinders.value.length - 1)

// Storage boxes are linear: render their placements in order, no page grid.
const boxItems = computed(() => {
  const box = viewingBinder.value
  if (!box || box.type !== 'box') return []
  const items = currentBinderPlacements.value.map(p => ({ slot: placementToSlot(p), placement: p }))
  // 'added' keeps placement order; name/number sort display-only (see BoxSortMode).
  const mode = box.sortMode ?? 'added'
  if (mode === 'name') {
    items.sort((a, b) =>
      a.placement.card.name.localeCompare(b.placement.card.name) ||
      compareCollectorNumber(a.placement.card, b.placement.card)
    )
  } else if (mode === 'number') {
    items.sort((a, b) =>
      compareCollectorNumber(a.placement.card, b.placement.card) ||
      a.placement.card.name.localeCompare(b.placement.card.name)
    )
  }
  return items
})

// Writable sort selector for the currently-viewed box; persists on the box.
const boxSortMode = computed<BoxSortMode>({
  get() {
    const b = viewingBinder.value
    return b && b.type === 'box' ? (b.sortMode ?? 'added') : 'added'
  },
  set(mode) {
    const b = viewingBinder.value
    if (b && b.type === 'box') bindersStore.setBoxSortMode(b.id, mode)
  }
})
function onBoxSlotSelect(p: CardPlacement) {
  sheetRef.value = { segmentId: p.segmentId, cardIndex: p.cardIndexInSegment }
  sheetOpen.value = true
}

// A storage box holds physical cards: one slot = one card = one finish. So in a box,
// choosing a finish is exclusive — picking one clears the other, and re-picking the
// active finish clears ownership. (Binders track a printing's finishes independently,
// so they keep the dual toggles.) Quantity is modeled as separate slots: importing N
// copies already expands into N single-finish slots.
const isBoxView = computed(() => viewingBinder.value?.type === 'box')
function setBoxFinish(key: string, finish: 'nonfoil' | 'foil') {
  const wasNonFoil = collectionStore.isOwnedNonFoil(key)
  const wasFoil = collectionStore.isOwnedFoil(key)
  if (finish === 'nonfoil') {
    const next = !wasNonFoil
    collectionStore.setOwned(key, next)
    if (next && wasFoil) collectionStore.setFoilOwned(key, false)
  } else {
    const next = !wasFoil
    collectionStore.setFoilOwned(key, next)
    if (next && wasNonFoil) collectionStore.setOwned(key, false)
  }
}

// Double-click shortcut: toggle owned without opening the sheet.
// Double left-click toggles non-foil; double right-click toggles foil. Each is an
// independent per-finish toggle (BinderSlot only fires the finish the printing allows).
function onBinderQuickOwn(page: number, slot0: number) {
  const p = binderLayout.value?.meta.get(`${page}:${slot0}`)
  if (p) collectionStore.toggleOwned(getPlacementOwnershipKey(p))
}
function onBoxQuickOwn(p: CardPlacement) {
  setBoxFinish(getPlacementOwnershipKey(p), 'nonfoil')
}
// Double right-click shortcut: toggle the foil finish (BinderSlot only fires this
// for printings that can be foil).
function onBinderQuickFoil(page: number, slot0: number) {
  const p = binderLayout.value?.meta.get(`${page}:${slot0}`)
  if (p) collectionStore.toggleFoil(getPlacementOwnershipKey(p))
}
function onBoxQuickFoil(p: CardPlacement) {
  setBoxFinish(getPlacementOwnershipKey(p), 'foil')
}

// Toggle owned for every card on the currently visible binder page(s).
function onMarkPageOwned(pages: number[]) {
  const keys = currentBinderPlacements.value
    .filter(p => pages.includes(p.pageNumber))
    .map(p => getPlacementOwnershipKey(p))
  if (keys.length === 0) return
  const allOwned = keys.every(k => collectionStore.isOwned(k))
  collectionStore.setMultipleOwned(keys, !allOwned)
}

// Turning past the first/last page hops to the previous/next binder in the plan.
function onBinderEdge(direction: -1 | 1) {
  const idx = planBinders.value.findIndex(b => b.id === selectedBinderForView.value)
  if (idx === -1) return
  if (direction < 0 && idx > 0) {
    const prev = planBinders.value[idx - 1]
    if (!prev) return
    selectedBinderForView.value = prev.id
    selectedPage.value = prev.type === 'binder' ? prev.pageCount : 1 // land on its last page
  } else if (direction > 0 && idx < planBinders.value.length - 1) {
    const next = planBinders.value[idx + 1]
    if (!next) return
    selectedBinderForView.value = next.id
    selectedPage.value = 1
  }
}

// ---- Card action sheet (keyed by segment+index so it survives recalcs) ----
const sheetOpen = ref(false)
const sheetRef = ref<{ segmentId: string; cardIndex: number } | null>(null)
const sheetPlacement = computed<CardPlacement | null>(() => {
  const r = sheetRef.value
  if (!r) return null
  return currentBinderPlacements.value.find(
    p => p.segmentId === r.segmentId && p.cardIndexInSegment === r.cardIndex
  ) ?? null
})
const sheetCard = computed(() => {
  const p = sheetPlacement.value
  if (!p) return null
  return {
    ...placementToSlot(p),
    spacerCount: segmentsStore.getSpacerCount(p.segmentId, p.cardIndexInSegment),
    isDoubleFaced: isDoubleFaced(p.card),
    isBackFace: (p.face ?? 0) === 1,
    location: viewingBinder.value?.type === 'box'
      ? `Box · #${p.slotOnPage}`
      : `Page ${p.pageNumber} · Slot ${p.slotOnPage}`
  }
})

// Suspend binder-spread nav (arrows/swipe) while any editor modal/sheet is open.
const anyModalOpen = computed(() =>
  sheetOpen.value || !!cardSearch.value || !!addCardsMode.value ||
  !!appendTarget.value || showBinderForm.value || showNewSetDialog.value ||
  showImportDialog.value
)

function onBinderSlotSelect(page: number, slot0: number) {
  const p = binderLayout.value?.meta.get(`${page}:${slot0}`)
  if (!p) return
  sheetRef.value = { segmentId: p.segmentId, cardIndex: p.cardIndexInSegment }
  sheetOpen.value = true
}
function onBinderSlotInsert(page: number, slot0: number) {
  handleInsertCard(page, slot0 + 1)
}
function onSheetToggleNonFoil() {
  const p = sheetPlacement.value
  if (!p) return
  const key = getPlacementOwnershipKey(p)
  if (isBoxView.value) setBoxFinish(key, 'nonfoil')
  else collectionStore.toggleOwned(key)
}
function onSheetToggleFoil() {
  const p = sheetPlacement.value
  if (!p) return
  const key = getPlacementOwnershipKey(p)
  if (isBoxView.value) setBoxFinish(key, 'foil')
  else collectionStore.toggleFoil(key)
}
function onSheetToggleSkipped() {
  const p = sheetPlacement.value
  if (p) collectionStore.toggleSkipped(getPlacementOwnershipKey(p))
}
async function onSheetAddBackFace() {
  const p = sheetPlacement.value
  if (!p) return
  segmentsStore.insertBackFaceAfter(p.segmentId, p.cardIndexInSegment)
  sheetOpen.value = false
  sheetRef.value = null
  if (planBinders.value.length > 0 && planSegments.value.length > 0) {
    placementResult.value = await calculatePlacements(planSegments.value, planBinders.value)
  }
}
async function onSheetAddSpacer() {
  const p = sheetPlacement.value
  if (p) await handleAddSpacer(p.segmentId, p.cardIndexInSegment)
}
async function onSheetRemoveSpacer() {
  const p = sheetPlacement.value
  if (p) await handleRemoveSpacer(p.segmentId, p.cardIndexInSegment)
}
function onSheetDetails() {
  const p = sheetPlacement.value
  if (p) router.push(`/card/${p.card.id}`)
}
function onSheetScryfall() {
  const p = sheetPlacement.value
  if (p) window.open(`https://scryfall.com/search?q=${encodeURIComponent(p.card.name)}`, '_blank', 'noopener')
}
function onSheetCardmarket() {
  const p = sheetPlacement.value
  if (!p) return
  // Prefer the exact product link Scryfall gives us; fall back to a name search for
  // cards cached before we captured purchase links.
  const url = p.card.purchase_uris?.cardmarket
    ?? `https://www.cardmarket.com/en/Magic/Products/Search?searchString=${encodeURIComponent(p.card.name)}`
  window.open(url, '_blank', 'noopener')
}

// Force-refetch this printing from Scryfall (bypassing the cache) to pick up updated
// image URLs or other changed data, then recalc so the fresh card flows into the view.
const isRefreshingCard = ref(false)
async function onSheetRefresh() {
  const p = sheetPlacement.value
  if (!p || isRefreshingCard.value) return
  isRefreshingCard.value = true
  try {
    await refreshCard(p.card.id)
    placementResult.value = await calculatePlacements(planSegments.value, planBinders.value)
  } catch (error) {
    console.error('Failed to refresh card data:', error)
  } finally {
    isRefreshingCard.value = false
  }
}
async function onSheetRemove() {
  const p = sheetPlacement.value
  if (!p) return
  const target = { segmentId: p.segmentId, cardIndex: p.cardIndexInSegment }
  sheetOpen.value = false
  sheetRef.value = null
  await handleRemoveCard(target.segmentId, target.cardIndex)
}

const totalOverflowCount = computed(() => {
  if (!placementResult.value) return 0
  return placementResult.value.overflow.reduce((sum, o) => sum + o.overflowCount, 0)
})

const cardsPerBinder = computed(() => {
  const counts = new Map<string, number>()
  if (!placementResult.value) return counts
  for (const placement of placementResult.value.placements) {
    counts.set(placement.binderId, (counts.get(placement.binderId) ?? 0) + 1)
  }
  return counts
})

// Owned value per binder for the current plan's Storage list.
const binderValues = computed(() =>
  placementResult.value
    ? buildBinderValues([placementResult.value], getPrice, ownedNonFoil, ownedFoil, skipped)
    : new Map<string, ValueSummary>()
)

const ownedCardsPerBinder = computed(() => {
  const counts = new Map<string, number>()
  if (!placementResult.value) return counts
  for (const placement of placementResult.value.placements) {
    const key = getPlacementOwnershipKey(placement)
    if (collectionStore.isOwned(key)) {
      counts.set(placement.binderId, (counts.get(placement.binderId) ?? 0) + 1)
    }
  }
  return counts
})

const currentBinderPlacementKeys = computed(() => {
  if (!placementResult.value || !selectedBinderForView.value) return []
  return placementResult.value.placements
    .filter(p => p.binderId === selectedBinderForView.value)
    .map(p => getPlacementOwnershipKey(p))
})

const allBinderCardsOwned = computed(() =>
  currentBinderPlacementKeys.value.length > 0 &&
  currentBinderPlacementKeys.value.every(key => collectionStore.isOwned(key))
)

function toggleAllBinderOwned() {
  if (currentBinderPlacementKeys.value.length === 0) return
  collectionStore.setMultipleOwned(currentBinderPlacementKeys.value, !allBinderCardsOwned.value)
}

watch([planBinders, planSegments], async () => {
  // Auto-select first binder if none selected
  if (!selectedBinderForView.value && planBinders.value.length > 0) {
    const firstBinder = planBinders.value[0]
    if (firstBinder) {
      selectedBinderForView.value = firstBinder.id
    }
  }

  // Calculate placements if we have both binders and segments
  if (planBinders.value.length > 0 && planSegments.value.length > 0) {
    placementResult.value = await calculatePlacements(planSegments.value, planBinders.value)
  } else {
    placementResult.value = null
  }
}, { immediate: true })

function createNewPlan() {
  showNewSetDialog.value = true
}

function handleNewSetSubmit(data: { name: string; binderId?: string; segmentId?: string }) {
  const plan = plansStore.createPlan(data.name)

  // Add binder if provided
  if (data.binderId) {
    plansStore.addBinderToPlan(plan.id, data.binderId)
  }

  // Add segment if provided
  if (data.segmentId) {
    plansStore.addSegmentToPlan(plan.id, data.segmentId)
    const seg = segmentsStore.getSegment(data.segmentId)
    if (seg?.cardIds.length) void pricesStore.fetchPricesFor(seg.cardIds)
  }

  showNewSetDialog.value = false

  // Reset view state and set to newly created binder if available
  selectedBinderForView.value = data.binderId ?? null
  selectedPage.value = 1

  router.push(`/sets/${plan.id}`)
}

function handleNewSetCancel() {
  showNewSetDialog.value = false
}

// The import dialog resolves cards and creates the binder + segment itself, then
// emits the same shape as NewSetDialog — so plan creation/linking is shared.
function handleImportSubmit(data: { name: string; binderId?: string; segmentId?: string }) {
  showImportDialog.value = false
  handleNewSetSubmit(data)
}

function selectPlan(plan: BinderPlan) {
  // Only reset view state when switching to a different plan
  if (currentPlanId.value !== plan.id) {
    selectedBinderForView.value = null
    selectedPage.value = 1
  }
  router.push(`/sets/${plan.id}`)
  showBinderForm.value = false
  editingBinder.value = null
  showSetList.value = false
  window.scrollTo({ top: 0 })
}

function startEditPlanName() {
  if (currentPlan.value) {
    planNameInput.value = currentPlan.value.name
    editingPlanName.value = true
  }
}

function savePlanName() {
  if (currentPlanId.value && planNameInput.value.trim()) {
    plansStore.updatePlan(currentPlanId.value, { name: planNameInput.value.trim() })
  }
  editingPlanName.value = false
}

function cancelEditPlanName() {
  editingPlanName.value = false
}

async function handleBinderSubmit(data:
  | { name: string; type: 'binder'; pageCount: number; slotsPerPage: number; coverImage?: File | null; outsideColor?: string; insideColor?: string }
  | { name: string; type: 'box'; coverImage?: File | null; outsideColor?: string; insideColor?: string }
) {
  // The cover image is a File handled separately by the store — keep it out of
  // the persisted-field updates so it isn't serialized onto the binder.
  const { coverImage, ...fields } = data
  if (editingBinder.value) {
    await bindersStore.updateBinder(editingBinder.value.id, fields, coverImage)
  } else {
    const containerConfig = data.type === 'binder'
      ? { type: 'binder' as const, pageCount: data.pageCount, slotsPerPage: data.slotsPerPage }
      : { type: 'box' as const }

    const binder = await bindersStore.addBinder(
      data.name,
      containerConfig,
      coverImage || undefined,
      { outsideColor: data.outsideColor, insideColor: data.insideColor }
    )
    if (currentPlanId.value) {
      plansStore.addBinderToPlan(currentPlanId.value, binder.id)
    }
  }
  showBinderForm.value = false
  editingBinder.value = null
}

function editBinder(binder: Binder) {
  editingBinder.value = binder
  showBinderForm.value = true
}

function removeBinder(binder: Binder) {
  if (currentPlanId.value) {
    plansStore.removeBinderFromPlan(currentPlanId.value, binder.id)
  }
}

function onAddCardsConfirm({ set, cardIds }: { set: ScryfallSet; cardIds: string[] }) {
  if (!currentPlanId.value) {
    addCardsMode.value = null
    return
  }

  if (addCardsMode.value === 'box') {
    // Add cards into the currently-viewed box, pinned to it and marked owned.
    if (!selectedBinderForView.value) {
      addCardsMode.value = null
      return
    }
    const segment = segmentsStore.addSegment(set.name, set.code, cardIds)
    segmentsStore.updateSegment(segment.id, { targetBinderId: selectedBinderForView.value })
    plansStore.addSegmentToPlan(currentPlanId.value, segment.id)
    const ownershipKeys = cardIds.map((_, index) => `${segment.id}:${index}`)
    collectionStore.setMultipleOwned(ownershipKeys, true)
  } else {
    // Add as a regular plan segment.
    const segment = segmentsStore.addSegment(set.name, set.code, cardIds)
    plansStore.addSegmentToPlan(currentPlanId.value, segment.id)
  }

  // Pull prices for the freshly added cards so value shows without a manual fetch.
  if (cardIds.length) void pricesStore.fetchPricesFor(cardIds)

  addCardsMode.value = null
}

// A set-less section for hand-picked cards from any set (promos, trailing extras).
// Created empty and appended to the plan; fill it via the card's "Add card" button.
function addCustomSection() {
  if (!currentPlanId.value) return
  const segment = segmentsStore.addCustomSegment('Custom section')
  plansStore.addSegmentToPlan(currentPlanId.value, segment.id)
}

function removeSegment(segment: Segment) {
  if (currentPlanId.value) {
    plansStore.removeSegmentFromPlan(currentPlanId.value, segment.id)
  }
}

function updateSegmentName(segment: Segment, name: string) {
  segmentsStore.updateSegment(segment.id, { name })
}

function updateSegmentOffset(segment: Segment, offset: number) {
  segmentsStore.updateSegment(segment.id, { offset })
}

function updateSegmentPageOffset(segment: Segment, pageOffset: number) {
  segmentsStore.updateSegment(segment.id, { pageOffset })
}

function updateSegmentTargetBinder(segment: Segment, binderId: string | undefined) {
  segmentsStore.updateSegment(segment.id, { targetBinderId: binderId })
}

function moveSegmentUp(segment: Segment) {
  if (!currentPlanId.value) return
  const plan = plansStore.getPlan(currentPlanId.value)
  if (!plan) return

  const index = plan.segmentIds.indexOf(segment.id)
  if (index <= 0) return // Already at top or not found

  const newSegmentIds = [...plan.segmentIds]
  // Swap with previous segment
  ;[newSegmentIds[index - 1], newSegmentIds[index]] = [newSegmentIds[index]!, newSegmentIds[index - 1]!]
  plansStore.reorderSegments(currentPlanId.value, newSegmentIds)
}

function moveSegmentDown(segment: Segment) {
  if (!currentPlanId.value) return
  const plan = plansStore.getPlan(currentPlanId.value)
  if (!plan) return

  const index = plan.segmentIds.indexOf(segment.id)
  if (index === -1 || index >= plan.segmentIds.length - 1) return // Already at bottom or not found

  const newSegmentIds = [...plan.segmentIds]
  // Swap with next segment
  ;[newSegmentIds[index], newSegmentIds[index + 1]] = [newSegmentIds[index + 1]!, newSegmentIds[index]!]
  plansStore.reorderSegments(currentPlanId.value, newSegmentIds)
}

function handleSegmentNavigate(segment: Segment) {
  if (!placementResult.value) return

  // Find the first card placement for this segment
  const firstPlacement = placementResult.value.placements.find(
    p => p.segmentId === segment.id
  )

  if (firstPlacement) {
    // Navigate to the binder and page where this segment starts
    selectedBinderForView.value = firstPlacement.binderId
    selectedPage.value = firstPlacement.pageNumber
  } else {
    // Check if segment overflowed
    const overflowed = placementResult.value.overflow.find(
      o => o.segmentId === segment.id
    )
    if (overflowed) {
      alert(`This segment has ${overflowed.overflowCount} cards that don't fit in any binder. Add more binder capacity.`)
    }
  }
}

async function handleRemoveCard(segmentId: string, cardIndex: number) {
  segmentsStore.removeCardAtIndex(segmentId, cardIndex)
  // Recalculate placements after removing the card
  if (planBinders.value.length > 0 && planSegments.value.length > 0) {
    placementResult.value = await calculatePlacements(planSegments.value, planBinders.value)
  }
}

async function handleAddSpacer(segmentId: string, cardIndex: number) {
  segmentsStore.addSpacerBefore(segmentId, cardIndex)
  await nextTick()
  if (planBinders.value.length > 0 && planSegments.value.length > 0) {
    placementResult.value = await calculatePlacements(planSegments.value, planBinders.value)
  }
}

async function handleRemoveSpacer(segmentId: string, cardIndex: number) {
  segmentsStore.removeSpacerBefore(segmentId, cardIndex)
  await nextTick() // Wait for Vue to process reactive updates
  // Recalculate placements after removing the spacer
  if (planBinders.value.length > 0 && planSegments.value.length > 0) {
    placementResult.value = await calculatePlacements(planSegments.value, planBinders.value)
  }
}

function handleInsertCard(pageNumber: number, slotOnPage: number) {
  if (!selectedBinderForView.value || !placementResult.value) return

  const targetBinder = bindersStore.getBinder(selectedBinderForView.value)
  if (!targetBinder || targetBinder.type === 'box') return  // Only for binders

  // Calculate target slot index (0-indexed)
  const targetSlotIndex = (pageNumber - 1) * targetBinder.slotsPerPage + (slotOnPage - 1)

  // Get all placements in this binder with their slot indices
  const placementsInBinder = placementResult.value.placements
    .filter(p => p.binderId === selectedBinderForView.value)
    .map(p => ({
      ...p,
      slotIndex: (p.pageNumber - 1) * targetBinder.slotsPerPage + (p.slotOnPage - 1)
    }))
    .sort((a, b) => a.slotIndex - b.slotIndex)

  // Find the placement just before the target slot
  const placementBefore = [...placementsInBinder]
    .reverse()
    .find(p => p.slotIndex < targetSlotIndex)

  // Find the placement just after the target slot
  const placementAfter = placementsInBinder.find(p => p.slotIndex > targetSlotIndex)

  // Determine the owning segment - prefer the one before, fall back to after
  let owningSegment: Segment | undefined
  let insertBeforeCardId: string | null = null

  if (placementBefore) {
    owningSegment = segmentsStore.getSegment(placementBefore.segmentId)
    // If there's a card after in the same segment, insert before it
    if (placementAfter && placementAfter.segmentId === placementBefore.segmentId) {
      insertBeforeCardId = placementAfter.card.id
    }
  } else if (placementAfter) {
    owningSegment = segmentsStore.getSegment(placementAfter.segmentId)
    insertBeforeCardId = placementAfter.card.id
  }

  if (!owningSegment) {
    // No segment found - can't insert
    return
  }

  cardSearch.value = {
    mode: 'insert',
    binderId: selectedBinderForView.value,
    pageNumber,
    slotOnPage,
    segmentId: owningSegment.id,
    segmentName: owningSegment.name,
    setCode: owningSegment.scryfallSetCode,
    insertBeforeCardId
  }
}

// Open the (unfiltered) card search to append a card to a custom section.
function handleSegmentAddCard(segment: Segment) {
  cardSearch.value = {
    mode: 'append',
    segmentId: segment.id,
    segmentName: segment.name,
    setCode: segment.scryfallSetCode
  }
}

// Multi-select cards into an existing segment. Set-backed segments jump straight
// to that set's card picker; custom sections open the set selector first.
async function handleSegmentAddCards(segment: Segment) {
  let set: ScryfallSet | null = null
  if (segment.scryfallSetCode) {
    const sets = await fetchSets()
    set = sets.find(s => s.code === segment.scryfallSetCode) ?? null
  }
  appendTarget.value = { segmentId: segment.id, set }
}

async function onAppendCardsConfirm({ cardIds }: { set: ScryfallSet; cardIds: string[] }) {
  const target = appendTarget.value
  if (!target || !currentPlanId.value) {
    appendTarget.value = null
    return
  }

  // Append to the end (fresh indices, so existing ownership keys are untouched);
  // skip cards already in the segment so we don't create duplicates.
  const existing = new Set(segmentsStore.getSegment(target.segmentId)?.cardIds ?? [])
  const toAdd = cardIds.filter(id => !existing.has(id))
  for (const id of toAdd) {
    segmentsStore.insertCardInSegment(target.segmentId, id, null)
  }

  if (toAdd.length) {
    void pricesStore.fetchPricesFor(toAdd)
    if (planBinders.value.length > 0 && planSegments.value.length > 0) {
      placementResult.value = await calculatePlacements(planSegments.value, planBinders.value)
    }
  }

  appendTarget.value = null
}

async function handleCardSelected(card: ScryfallCard) {
  const target = cardSearch.value
  if (!target || !currentPlanId.value) {
    cardSearch.value = null
    return
  }

  try {
    // 'insert' drops the card at a specific slot (before insertBeforeCardId);
    // 'append' (null) adds it to the end of the segment's card list.
    segmentsStore.insertCardInSegment(
      target.segmentId,
      card.id,
      target.mode === 'insert' ? target.insertBeforeCardId : null
    )
    // Grab this card's price right away.
    void pricesStore.fetchPricesFor([card.id])

    // Recalculate placements
    if (planBinders.value.length > 0 && planSegments.value.length > 0) {
      placementResult.value = await calculatePlacements(planSegments.value, planBinders.value)
    }
  } finally {
    // Always close modal and reset
    cardSearch.value = null
  }
}

function cancelCardSearch() {
  cardSearch.value = null
}

function viewBinder(binderId: string) {
  selectedBinderForView.value = binderId
  selectedPage.value = 1
  showBinderForm.value = false
  editingBinder.value = null
  window.scrollTo({ top: 0 })
}

function deletePlan() {
  if (!currentPlanId.value) return
  plansStore.removePlan(currentPlanId.value)
  router.push('/sets')
  selectedBinderForView.value = null
  placementResult.value = null
  showDeleteConfirm.value = false
}

function addBinderForOverflow() {
  showBinderForm.value = true
  editingBinder.value = null
}

function handleKeyDown(event: KeyboardEvent) {
  // Handle ESC key to close modals. Dialog-based flows (add storage, add cards,
  // new set, card search) close themselves via reka-ui; only the inline plan-name
  // edit needs handling here.
  if (event.key === 'Escape') {
    if (editingPlanName.value) {
      editingPlanName.value = false
      event.preventDefault()
      return
    }
  }

  // Foil-marking shortcuts while the card action sheet is open: N = non-foil,
  // F = foil, B = both available finishes. Each applies and closes the sheet so you
  // can click the next card and keep marking. Keys the printing can't be are ignored.
  if (sheetOpen.value && !event.metaKey && !event.ctrlKey && !event.altKey) {
    const t = event.target as HTMLElement | null
    const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
    const p = typing ? null : sheetPlacement.value
    if (p) {
      const key = getPlacementOwnershipKey(p)
      const finishes = p.card.finishes
      const canNon = finishes ? finishes.includes('nonfoil') : true
      const canFoil = finishes ? finishes.includes('foil') : true
      let handled = true
      switch (event.key.toLowerCase()) {
        case 'n':
          if (!canNon) { handled = false; break }
          if (isBoxView.value) setBoxFinish(key, 'nonfoil')
          else collectionStore.toggleOwned(key)
          break
        case 'f':
          if (!canFoil) { handled = false; break }
          if (isBoxView.value) setBoxFinish(key, 'foil')
          else collectionStore.toggleFoil(key)
          break
        case 'b':
          // No "both" in a box: a physical card is a single finish.
          if (isBoxView.value) { handled = false; break }
          if (canNon) collectionStore.setOwned(key, true)
          if (canFoil) collectionStore.setFoilOwned(key, true)
          break
        default: handled = false
      }
      if (handled) {
        event.preventDefault()
        sheetOpen.value = false
      }
    }
  }
  // Page-turn arrows/space are owned by BinderSpread now.
}

// Handle Escape key to close New Set dialog
function handleNewSetDialogKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && showNewSetDialog.value) {
    showNewSetDialog.value = false
  }
}

// Add/remove keyboard listener when New Set dialog opens/closes
watch(showNewSetDialog, (isOpen) => {
  if (isOpen) {
    window.addEventListener('keydown', handleNewSetDialogKeydown)
  } else {
    window.removeEventListener('keydown', handleNewSetDialogKeydown)
  }
})

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)

  // Check if we should auto-open the create dialog
  if (route.query.create === 'true') {
    showNewSetDialog.value = true
    // Clean up the query parameter
    router.replace('/sets')
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div class="plan-editor">
    <aside class="sticky top-16 flex max-h-[calc(100dvh-4rem)] w-95 shrink-0 flex-col gap-6 overflow-y-auto border-r border-line bg-surface p-4">
      <!-- Set switcher: the full set list. Shown when no set is selected, or when
           the user taps back/switch from the detail view (drill-in navigation). -->
      <section v-if="!currentPlan || showSetList" class="flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <h2 class="font-display text-lg font-bold tracking-tight">Sets</h2>
          <Button
            v-if="currentPlan"
            variant="ghost"
            size="icon"
            class="h-9 w-9"
            title="Back to overview"
            aria-label="Back to overview"
            @click="router.push('/sets')"
          >
            <ArrowLeft :size="18" />
          </Button>
        </div>
        <div class="flex gap-2">
          <Button class="flex-1" @click="createNewPlan"><Plus :size="18" /> New Set</Button>
          <Button variant="outline" title="Import a ManaBox CSV export" @click="showImportDialog = true"><Upload :size="16" /> Import</Button>
        </div>
        <div class="flex flex-col gap-1">
          <button
            v-for="plan in sortedPlans"
            :key="plan.id"
            class="relative cursor-pointer overflow-hidden rounded-md border px-3 py-2 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            :class="plan.id === currentPlanId
              ? 'border-brand text-foreground'
              : 'border-line text-ink-soft hover:bg-surface-2 hover:text-foreground'"
            @click="selectPlan(plan)"
          >
            <span v-if="!planIsBoxOnly.get(plan.id)" class="absolute inset-y-0 left-0 bg-(--accent-soft)" :style="{ width: `${planCompletion.get(plan.id)?.percent ?? 0}%` }" aria-hidden="true"></span>
            <span class="relative flex items-center justify-between gap-2">
              <span class="truncate">{{ plan.name }}</span>
              <span class="shrink-0 text-xs text-ink-faint tabular-nums">
                <template v-if="planIsBoxOnly.get(plan.id)">{{ planCompletion.get(plan.id)?.owned ?? 0 }}</template>
                <template v-else>{{ planCompletion.get(plan.id)?.percent ?? 0 }}%</template>
              </span>
            </span>
          </button>
        </div>
      </section>

      <!-- Detail view: the selected set's working data. Replaces the set list so
           storage/segments aren't buried below every other set. -->
      <template v-else-if="currentPlan">
        <section class="flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              class="h-9 w-9 shrink-0"
              title="All sets"
              aria-label="All sets"
              @click="showSetList = true"
            >
              <ArrowLeft :size="18" />
            </Button>
            <template v-if="editingPlanName">
              <Input v-model="planNameInput" class="h-9" @keyup.enter="savePlanName" @keyup.escape="cancelEditPlanName" />
              <Button variant="ghost" size="icon" class="h-9 w-9" title="Save" aria-label="Save" @click="savePlanName"><Check :size="16" /></Button>
              <Button variant="ghost" size="icon" class="h-9 w-9" title="Cancel" aria-label="Cancel" @click="cancelEditPlanName"><X :size="16" /></Button>
            </template>
            <template v-else>
              <h2 class="min-w-0 flex-1 truncate font-display text-base font-bold tracking-tight">{{ currentPlan.name }}</h2>
              <Button variant="ghost" size="icon" class="h-9 w-9 shrink-0" title="Rename set" aria-label="Rename set" @click="startEditPlanName"><Pencil :size="15" /></Button>
              <Button variant="ghost" size="icon" class="h-9 w-9 shrink-0 text-skipped hover:bg-(--skipped-soft) hover:text-skipped" title="Delete set" aria-label="Delete set" @click="showDeleteConfirm = true"><Trash2 :size="15" /></Button>
            </template>
          </div>
          <p v-if="placementResult" class="text-sm text-ink-soft tabular-nums">
            <template v-if="planHasBox">{{ placementResult.totalCards }} cards · unlimited capacity</template>
            <template v-else>{{ placementResult.totalCards }} / {{ placementResult.totalCapacity }} capacity</template>
          </p>
        </section>

        <section class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <h2 class="font-display text-sm font-semibold uppercase tracking-[0.08em] text-ink-soft">Storage</h2>
            <Button variant="ghost" size="icon" class="h-8 w-8" title="Add storage" aria-label="Add storage" @click="showBinderForm = true; editingBinder = null">
              <Plus :size="18" />
            </Button>
          </div>
          <div v-if="planBinders.length" class="flex flex-col gap-2">
            <BinderCard
              v-for="binder in planBinders"
              :key="binder.id"
              :binder="binder"
              :planned-cards="cardsPerBinder.get(binder.id)"
              :owned-cards="ownedCardsPerBinder.get(binder.id) ?? 0"
              :value="binderValues.get(binder.id)"
              :selected="binder.id === selectedBinderForView"
              @edit="editBinder"
              @remove="removeBinder"
              @click="viewBinder(binder.id)"
            />
          </div>
          <button
            v-else
            class="rounded-lg border border-dashed border-line px-3 py-4 text-left text-xs text-ink-faint outline-none transition-colors hover:border-line-strong hover:text-ink-soft focus-visible:ring-2 focus-visible:ring-ring"
            @click="showBinderForm = true; editingBinder = null"
          >
            No storage yet. Add a binder or box to start placing cards.
          </button>
        </section>

        <section v-if="hasStorage && (!viewingBinder || viewingBinder.type !== 'box')" class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <h2 class="font-display text-sm font-semibold uppercase tracking-[0.08em] text-ink-soft">Segments</h2>
            <DropdownMenu>
              <template #trigger>
                <Button variant="ghost" size="icon" class="h-8 w-8" title="Add segment" aria-label="Add segment">
                  <Plus :size="18" />
                </Button>
              </template>
              <DropdownMenuItem @select="addCardsMode = 'segment'"><Plus :size="15" /> Add set's cards</DropdownMenuItem>
              <DropdownMenuItem @select="addCustomSection"><Plus :size="15" /> Add custom section</DropdownMenuItem>
            </DropdownMenu>
          </div>
          <div v-if="planSegments.length" class="flex flex-col gap-2">
            <SegmentCard
              v-for="segment in planSegments"
              :key="segment.id"
              :segment="segment"
              :binders="planBinders"
              :selected="activeSegmentIds.has(segment.id)"
              @update-name="updateSegmentName"
              @remove="removeSegment"
              @update-offset="updateSegmentOffset"
              @update-page-offset="updateSegmentPageOffset"
              @update-target-binder="updateSegmentTargetBinder"
              @navigate="handleSegmentNavigate"
              @move-up="moveSegmentUp"
              @move-down="moveSegmentDown"
              @add-card="handleSegmentAddCard"
              @add-cards="handleSegmentAddCards"
            />
          </div>
          <button
            v-else
            class="rounded-lg border border-dashed border-line px-3 py-4 text-left text-xs text-ink-faint outline-none transition-colors hover:border-line-strong hover:text-ink-soft focus-visible:ring-2 focus-visible:ring-ring"
            @click="addCardsMode = 'segment'"
          >
            No segments yet. Add a set's cards to track and place them.
          </button>
        </section>

        <section v-if="placementResult && placementResult.overflow.length > 0" class="flex flex-col gap-2">
          <div class="rounded-lg border border-[color-mix(in_srgb,var(--skipped)_35%,transparent)] bg-(--skipped-soft) p-3 text-sm">
            <strong class="text-skipped">Overflow: {{ totalOverflowCount }} cards</strong>
            <ul class="mt-1 list-disc pl-5 text-ink-soft">
              <li v-for="o in placementResult.overflow" :key="o.segmentId">
                {{ o.segmentName }}: {{ o.overflowCount }} cards
              </li>
            </ul>
            <Button class="mt-3 w-full" size="sm" @click="addBinderForOverflow">
              <Plus :size="16" /> Add Storage for Overflow
            </Button>
          </div>
        </section>
      </template>
    </aside>

    <main class="main-content">
      <template v-if="!currentPlan">
        <!-- No sets exist -->
        <div v-if="plansStore.plans.length === 0" class="mx-auto max-w-xl py-16 text-center">
          <h2 class="font-display text-2xl font-bold tracking-tight">Get started with your collection</h2>
          <p class="mt-3 text-ink-soft">
            Use <strong class="text-foreground">+ New Set</strong> to create your first set. Add storage to organize your
            cards and segments to track specific MTG sets from Scryfall.
          </p>
          <div class="mt-5 flex items-start gap-2.5 rounded-xl border border-line bg-(--accent-soft) p-4 text-left text-sm text-ink-soft">
            <Lightbulb :size="18" class="mt-0.5 shrink-0 text-brand" />
            <span><strong class="text-foreground">Tip:</strong> when creating a set you can also create storage and pick a Scryfall set in one step.</span>
          </div>
        </div>

        <!-- Sets exist, show overview -->
        <div v-else class="mx-auto max-w-6xl">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="font-display text-2xl font-bold tracking-tight">Your Sets</h2>
              <p class="mt-1 text-ink-soft">Click a set to view and manage your collection.</p>
            </div>
            <SegmentedControl v-model="storageFilter" :options="storageFilterOptions" />
          </div>

          <!-- Combined owned value + cost-to-complete across every set -->
          <div class="mt-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-3 rounded-xl border border-line bg-surface p-5 shadow-(--shadow-1)">
            <div class="flex flex-wrap items-end gap-x-8 gap-y-3">
              <div class="min-w-0">
                <p class="text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">Total collection value</p>
                <p v-if="allSetsValue.pricedCount > 0" class="mt-1 font-display text-3xl font-bold tabular-nums text-brand">{{ formatEurAmount(allSetsValue.value) }}</p>
                <p v-else class="mt-1 text-sm text-ink-faint">Fetch prices in a binder to start valuing your collection.</p>
              </div>
              <div v-if="allSetsValue.missingPricedCount > 0" class="min-w-0" :title="missingCoverageLabel(allSetsValue) ?? undefined">
                <p class="text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">Cost to complete</p>
                <p class="mt-1 font-display text-2xl font-bold tabular-nums text-ink-faint">{{ formatEurAmount(allSetsValue.missingValue) }}</p>
              </div>
            </div>
            <div class="flex shrink-0 flex-col items-end gap-2">
              <Button size="sm" :disabled="pricesStore.isFetching || allSetCardIds.length === 0" @click="fetchAllPrices">
                <Coins :size="16" />
                <template v-if="pricesStore.isFetching && pricesStore.fetchProgress">
                  Fetching {{ pricesStore.fetchProgress.done }}/{{ pricesStore.fetchProgress.total }}…
                </template>
                <template v-else>Fetch all prices</template>
              </Button>
              <p v-if="allSetsValue.pricedCount > 0" class="text-xs text-ink-faint tabular-nums">
                {{ allSetsValue.pricedCount }} priced · {{ allSetsValue.ownedCount }} owned
              </p>
            </div>
          </div>

          <p v-if="filteredPlans.length === 0" class="mt-6 rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink-faint">
            No sets with {{ storageFilter === 'binders' ? 'binders' : 'storage boxes' }} yet.
          </p>
          <div v-else class="mt-6 grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            <div
              v-for="plan in filteredPlans"
              :key="plan.id"
              class="cursor-pointer rounded-xl border border-line bg-surface p-4 shadow-(--shadow-1) transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-(--shadow-2)"
              @click="selectPlan(plan)"
            >
              <div class="flex items-start justify-between gap-3">
                <h3 class="min-w-0 truncate font-semibold">{{ plan.name }}</h3>
                <span class="shrink-0 text-xs text-ink-faint tabular-nums">
                  <template v-if="planIsBoxOnly.get(plan.id)">{{ planCompletion.get(plan.id)?.owned ?? 0 }} owned</template>
                  <template v-else>{{ planCompletion.get(plan.id)?.percent ?? 0 }}% complete</template>
                </span>
              </div>

              <div v-if="planValueLabel(plan.id) || planMissingLabel(plan.id)" class="mt-1 flex items-baseline gap-2 tabular-nums">
                <span v-if="planValueLabel(plan.id)" class="text-lg font-bold text-brand" :title="planValueTitle(plan.id) ?? undefined">{{ planValueLabel(plan.id) }}</span>
                <span v-if="planMissingLabel(plan.id)" class="text-sm font-semibold text-ink-faint" :title="planMissingTitle(plan.id) ?? undefined">{{ planMissingLabel(plan.id) }}</span>
              </div>

              <div class="mt-2 text-sm text-ink-soft tabular-nums">
                Segments: {{ plan.segmentIds.length }}
              </div>

              <div v-if="!planIsBoxOnly.get(plan.id)" class="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                <div class="h-full rounded-full" :style="{ width: `${planCompletion.get(plan.id)?.percent ?? 0}%`, background: 'var(--accent-grad)' }"></div>
              </div>

              <div v-if="plan.binderIds.length > 0" class="mt-4">
                <h4 class="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">Storage</h4>
                <div class="flex flex-col gap-2">
                  <BinderCard
                    v-for="binder in bindersStore.getBindersInOrder(plan.binderIds)"
                    :key="binder.id"
                    :binder="binder"
                    :planned-cards="allPlansBinderStats.get(binder.id)?.planned"
                    :owned-cards="allPlansBinderStats.get(binder.id)?.owned ?? 0"
                    :value="allPlansBinderValues.get(binder.id)"
                    :show-actions="false"
                    @click.stop="selectPlan(plan); viewBinder(binder.id)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="viewingBinder">
        <div class="flex h-[calc(100dvh-6rem)] flex-col gap-3">
          <!-- switch between the card viewer and the set's stats/search view -->
          <div class="flex shrink-0 items-center">
            <SegmentedControl v-model="mainView" :options="mainViewOptions" />
          </div>

          <SetStats v-if="mainView === 'stats'" :placements="planPlacements" :binders="planBinders" class="min-h-0 flex-1" />

          <template v-else>
          <!-- slim header: storage picker + bulk/box action -->
          <div class="flex shrink-0 flex-wrap items-center gap-3">
            <label class="flex items-center gap-2 text-sm">
              <span class="shrink-0 text-ink-soft">Storage</span>
              <div class="w-56">
                <Select v-model="selectedBinderForView" class="font-semibold" @change="selectedPage = 1">
                  <option v-for="binder in planBinders" :key="binder.id" :value="binder.id">
                    {{ binder.name }}
                  </option>
                </Select>
              </div>
            </label>
            <div class="flex-1"></div>
            <Button
              size="sm"
              variant="secondary"
              :disabled="pricesStore.isFetching || visibleCardIds.length === 0"
              @click="fetchVisiblePrices"
            >
              <Coins :size="16" /> {{ pricesStore.isFetching ? 'Fetching…' : 'Fetch prices' }}
            </Button>
            <label v-if="viewingBinder.type === 'box'" class="flex items-center gap-2 text-sm">
              <span class="shrink-0 text-ink-soft">Sort</span>
              <div class="w-36">
                <Select v-model="boxSortMode">
                  <option value="added">Added order</option>
                  <option value="name">Name</option>
                  <option value="number">Number</option>
                </Select>
              </div>
            </label>
            <CardSizeControl
              v-if="viewingBinder.type === 'box'"
              v-model="boxCardSize"
              :min="120"
              :max="240"
              :step="10"
              class="hidden sm:flex"
            />
            <Button
              v-if="viewingBinder.type === 'binder'"
              size="sm"
              :variant="allBinderCardsOwned ? 'secondary' : 'default'"
              @click="toggleAllBinderOwned"
            >
              {{ allBinderCardsOwned ? 'Mark binder unowned' : 'Mark binder owned' }}
            </Button>
            <Button v-if="viewingBinder.type === 'box'" size="sm" @click="addCardsMode = 'box'">
              <Plus :size="16" /> Add cards
            </Button>
          </div>

          <!-- Binder viewer (fit-to-viewport spread) -->
          <div
            v-if="viewingBinder.type === 'binder'"
            class="min-h-0 flex-1 overflow-hidden rounded-lg border border-line bg-surface"
          >
            <BinderSpread
              :key="viewingBinder.id"
              :name="viewingBinder.name"
              :page-count="viewingBinder.pageCount"
              :slots-per-page="viewingBinder.slotsPerPage"
              :pages="viewingBinderPages"
              :cover-image="viewingBinderCover ?? undefined"
              :inside-color="viewingBinder.insideColor"
              :initial-page="selectedPage"
              :paused="anyModalOpen"
              :has-prev-binder="hasPrevBinderView"
              :has-next-binder="hasNextBinderView"
              @select="onBinderSlotSelect"
              @insert="onBinderSlotInsert"
              @quick-own="onBinderQuickOwn"
              @quick-foil="onBinderQuickFoil"
              @edge="onBinderEdge"
              @view-change="visiblePages = $event"
              @mark-page-owned="onMarkPageOwned"
            />
          </div>

          <!-- Storage box: virtualized linear slot grid -->
          <div v-else class="min-h-0 flex-1 overflow-hidden rounded-lg border border-line bg-surface">
            <div v-if="boxItems.length === 0" class="p-4 text-sm text-ink-soft">
              This box is empty. Use "Add cards" above to add cards from a set.
            </div>
            <BoxView v-else :items="boxItems" :tile-size="boxCardSize" @select="onBoxSlotSelect" @toggle-owned="onBoxQuickOwn" @toggle-foil="onBoxQuickFoil" />
          </div>
          </template>
        </div>
      </template>

      <template v-else>
        <div class="mx-auto max-w-xl py-16 text-center">
          <h2 class="font-display text-2xl font-bold tracking-tight">Add storage to get started</h2>
          <p class="mt-3 text-ink-soft">
            A set needs a binder or storage box before any cards can be placed. Add storage first,
            then add segments to track specific MTG sets from Scryfall.
          </p>
          <Button class="mt-6" @click="showBinderForm = true; editingBinder = null">
            <Plus :size="18" /> Add Storage
          </Button>
          <div
            v-if="planSegments.length > 0"
            class="mt-6 flex items-start gap-2.5 rounded-xl border border-line bg-(--accent-soft) p-4 text-left text-sm text-ink-soft"
          >
            <Lightbulb :size="18" class="mt-0.5 shrink-0 text-brand" />
            <span>
              <strong class="text-foreground">Heads up:</strong>
              this set has {{ planSegments.length }} segment{{ planSegments.length === 1 ? '' : 's' }}
              with nowhere to go yet. Once you add storage, their cards will be placed automatically.
            </span>
          </div>
        </div>
      </template>
    </main>

    <CardSearchModal
      v-if="cardSearch"
      :set-code="cardSearch.setCode"
      :segment-name="cardSearch.segmentName"
      :title="cardSearch.mode === 'append' ? 'Add card' : 'Insert card'"
      @select="handleCardSelected"
      @cancel="cancelCardSearch"
    />

    <NewSetDialog
      v-if="showNewSetDialog"
      @submit="handleNewSetSubmit"
      @cancel="handleNewSetCancel"
    />

    <ImportSetDialog
      v-if="showImportDialog"
      @submit="handleImportSubmit"
      @cancel="showImportDialog = false"
    />

    <StorageDialog
      v-if="showBinderForm"
      :binder="editingBinder"
      @submit="handleBinderSubmit"
      @cancel="showBinderForm = false; editingBinder = null"
    />

    <AddCardsDialog
      v-if="addCardsMode"
      @confirm="onAddCardsConfirm"
      @cancel="addCardsMode = null"
    />

    <AddCardsDialog
      v-if="appendTarget"
      :initial-set="appendTarget.set ?? undefined"
      @confirm="onAppendCardsConfirm"
      @cancel="appendTarget = null"
    />

    <Dialog v-if="currentPlan" v-model:open="showDeleteConfirm" title="Delete this set?">
      <p class="text-sm text-ink-soft">
        Deleting <strong class="text-foreground">{{ currentPlan.name }}</strong> removes the set and all its segments. This can't be undone.
      </p>
      <template #footer>
        <Button variant="ghost" @click="showDeleteConfirm = false">Cancel</Button>
        <Button variant="destructive" @click="deletePlan">Delete set</Button>
      </template>
    </Dialog>

    <CardActionSheet
      v-if="sheetCard"
      v-model:open="sheetOpen"
      :name="sheetCard.name"
      :set="sheetCard.set"
      :number="sheetCard.number"
      :color="sheetCard.color"
      :status="sheetCard.status"
      :spacer-count="sheetCard.spacerCount"
      :rarity="sheetCard.rarity"
      :image="sheetCard.image"
      :location="sheetCard.location"
      :eur="sheetCard.eur"
      :eur-foil="sheetCard.eurFoil"
      :price-fetched-at="sheetCard.priceFetchedAt"
      :owns-non-foil="sheetCard.ownsNonFoil"
      :owns-foil="sheetCard.ownsFoil"
      :can-non-foil="sheetCard.canNonFoil"
      :can-foil="sheetCard.canFoil"
      :single-finish="isBoxView"
      :is-double-faced="sheetCard.isDoubleFaced"
      :is-back-face="sheetCard.isBackFace"
      :is-refreshing="isRefreshingCard"
      @toggle-non-foil="onSheetToggleNonFoil"
      @toggle-foil="onSheetToggleFoil"
      @toggle-skipped="onSheetToggleSkipped"
      @add-back-face="onSheetAddBackFace"
      @add-spacer="onSheetAddSpacer"
      @remove-spacer="onSheetRemoveSpacer"
      @open-details="onSheetDetails"
      @open-scryfall="onSheetScryfall"
      @open-cardmarket="onSheetCardmarket"
      @refresh="onSheetRefresh"
      @remove="onSheetRemove"
    />
  </div>
</template>

<style scoped>
.plan-editor {
  display: flex;
  align-items: flex-start;
}

.main-content {
  flex: 1;
  min-width: 0;
  padding: 1rem;
}
</style>
