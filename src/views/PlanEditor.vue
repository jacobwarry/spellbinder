<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { ScryfallSet, ScryfallCard, BinderPlan, Binder, Segment } from '@/types'
import { getPlacementOwnershipKey, type CardPlacement } from '@/types/placement'
import { getCardImageUri } from '@/api/scryfall'
import { getBinderImage } from '@/utils/binderImages'
import { useBindersStore, useSegmentsStore, usePlansStore, useCollectionStore } from '@/stores'
import { calculatePlacements, type PlacementResult } from '@/composables/usePlacement'
import { useAllPlacements, buildBinderStats } from '@/composables/useAllPlacements'
import type { Mana, Ownership, BinderSlotCard } from '@/components/common/types'
import BinderCard from '@/components/binder/BinderCard.vue'
import BinderForm from '@/components/binder/BinderForm.vue'
import BinderSpread from '@/components/binder/BinderSpread.vue'
import CardActionSheet from '@/components/binder/CardActionSheet.vue'
import BoxView from '@/components/binder/BoxView.vue'
import SegmentCard from '@/components/segments/SegmentCard.vue'
import SetSelector from '@/components/sets/SetSelector.vue'
import CardPicker from '@/components/sets/CardPicker.vue'
import BoxCardPicker from '@/components/sets/BoxCardPicker.vue'
import CardSearchModal from '@/components/cards/CardSearchModal.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Plus, ArrowLeft, Pencil, Check, X, Trash2, Lightbulb } from 'lucide-vue-next'
import NewSetDialog from '@/components/plans/NewSetDialog.vue'

const route = useRoute()
const router = useRouter()

const bindersStore = useBindersStore()
const segmentsStore = useSegmentsStore()
const plansStore = usePlansStore()
const collectionStore = useCollectionStore()

// Get current plan ID from route params
const currentPlanId = computed(() => {
  const planId = route.params.id as string | undefined
  return planId ?? null
})
const showBinderForm = ref(false)
const editingBinder = ref<Binder | null>(null)
const showSetSelector = ref(false)
const showNewSetDialog = ref(false)
const selectedSet = ref<ScryfallSet | null>(null)
const showBoxCardSelector = ref(false)
const selectedSetForBox = ref<ScryfallSet | null>(null)
const placementResult = ref<PlacementResult | null>(null)
const selectedBinderForView = ref<string | null>(null)
const selectedPage = ref(1)
const editingPlanName = ref(false)
const planNameInput = ref('')
const showCardSearch = ref(false)
const insertTargetSlot = ref<{
  binderId: string
  pageNumber: number
  slotOnPage: number
  segmentId: string
  segmentName: string
  setCode: string
  insertBeforeCardId: string | null
} | null>(null)

const currentPlan = computed(() =>
  currentPlanId.value ? plansStore.getPlan(currentPlanId.value) : null
)

const sortedPlans = computed(() =>
  [...plansStore.plans].sort((a, b) => a.name.localeCompare(b.name))
)

const planOwnedPercentage = computed(() => {
  const percentages = new Map<string, number>()
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
    percentages.set(plan.id, effectiveTotal > 0 ? Math.round((ownedCards / effectiveTotal) * 100) : 0)
  }
  return percentages
})

// Calculate cards per binder for all plans (for overview section)
const { allPlacements } = useAllPlacements()

// Per-binder planned/owned stats for the overview, derived from all-plan placements.
const allPlansBinderStats = computed(() =>
  buildBinderStats(allPlacements.value.values(), (key) => collectionStore.isOwned(key))
)

const planBinders = computed(() =>
  currentPlan.value ? bindersStore.getBindersInOrder(currentPlan.value.binderIds) : []
)

const planSegments = computed(() =>
  currentPlan.value ? segmentsStore.getSegmentsInOrder(currentPlan.value.segmentIds) : []
)

const viewingBinder = computed(() =>
  selectedBinderForView.value ? bindersStore.getBinder(selectedBinderForView.value) : null
)

const currentBinderPlacements = computed(() => {
  if (!viewingBinder.value || !placementResult.value) return []
  return placementResult.value.placements.filter(p => p.binderId === viewingBinder.value!.id)
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
  return {
    name: p.card.name,
    set: p.card.set.toUpperCase(),
    number: p.card.collector_number.padStart(4, '0'),
    color: cardMana(p.card),
    multicolor: (p.card.color_identity?.length ?? 0) > 1,
    status: placementStatus(p),
    rarity: rarityShort(p.card.rarity),
    image: getCardImageUri(p.card, 'normal') ?? undefined
  }
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
watch(() => viewingBinder.value?.id, async () => {
  if (viewingBinderCover.value) {
    URL.revokeObjectURL(viewingBinderCover.value)
    viewingBinderCover.value = null
  }
  const b = viewingBinder.value
  if (b && b.hasCoverImage) {
    try {
      viewingBinderCover.value = await getBinderImage(b.id)
    } catch { /* no cover */ }
  }
}, { immediate: true })

// Storage boxes are linear: render their placements in order, no page grid.
const boxItems = computed(() => {
  if (!viewingBinder.value || viewingBinder.value.type !== 'box') return []
  return currentBinderPlacements.value.map(p => ({ slot: placementToSlot(p), placement: p }))
})
function onBoxSlotSelect(p: CardPlacement) {
  sheetRef.value = { segmentId: p.segmentId, cardIndex: p.cardIndexInSegment }
  sheetOpen.value = true
}

// Double-click shortcut: toggle owned without opening the sheet.
function onBinderQuickOwn(page: number, slot0: number) {
  const p = binderLayout.value?.meta.get(`${page}:${slot0}`)
  if (p) collectionStore.toggleOwned(getPlacementOwnershipKey(p))
}
function onBoxQuickOwn(p: CardPlacement) {
  collectionStore.toggleOwned(getPlacementOwnershipKey(p))
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
    location: viewingBinder.value?.type === 'box'
      ? `Box · #${p.slotOnPage}`
      : `Page ${p.pageNumber} · Slot ${p.slotOnPage}`
  }
})

// Suspend binder-spread nav (arrows/swipe) while any editor modal/sheet is open.
const anyModalOpen = computed(() =>
  sheetOpen.value || showCardSearch.value || showSetSelector.value || !!selectedSet.value ||
  showBoxCardSelector.value || !!selectedSetForBox.value || showBinderForm.value || showNewSetDialog.value
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
function onSheetToggleOwned() {
  const p = sheetPlacement.value
  if (p) collectionStore.toggleOwned(getPlacementOwnershipKey(p))
}
function onSheetToggleSkipped() {
  const p = sheetPlacement.value
  if (p) collectionStore.toggleSkipped(getPlacementOwnershipKey(p))
}
async function onSheetAddSpacer() {
  const p = sheetPlacement.value
  if (p) await handleAddSpacer(p.segmentId, p.cardIndexInSegment)
}
async function onSheetRemoveSpacer() {
  const p = sheetPlacement.value
  if (p) await handleRemoveSpacer(p.segmentId, p.cardIndexInSegment)
}
function onSheetScryfall() {
  const p = sheetPlacement.value
  if (p) window.open(`https://scryfall.com/search?q=${encodeURIComponent(p.card.name)}`, '_blank', 'noopener')
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

function selectPlan(plan: BinderPlan) {
  // Only reset view state when switching to a different plan
  if (currentPlanId.value !== plan.id) {
    selectedBinderForView.value = null
    selectedPage.value = 1
  }
  router.push(`/sets/${plan.id}`)
  showBinderForm.value = false
  editingBinder.value = null
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
  | { name: string; type: 'binder'; pageCount: number; slotsPerPage: number; coverImage?: File | null }
  | { name: string; type: 'box'; coverImage?: File | null }
) {
  if (editingBinder.value) {
    await bindersStore.updateBinder(editingBinder.value.id, data, data.coverImage)
  } else {
    const containerConfig = data.type === 'binder'
      ? { type: 'binder' as const, pageCount: data.pageCount, slotsPerPage: data.slotsPerPage }
      : { type: 'box' as const }

    const binder = await bindersStore.addBinder(
      data.name,
      containerConfig,
      data.coverImage || undefined
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

function handleSetSelect(set: ScryfallSet) {
  selectedSet.value = set
  showSetSelector.value = false
}

function handleCardsConfirm(cardIds: string[]) {
  if (!selectedSet.value || !currentPlanId.value) return

  const segment = segmentsStore.addSegment(
    selectedSet.value.name,
    selectedSet.value.code,
    cardIds
  )
  plansStore.addSegmentToPlan(currentPlanId.value, segment.id)

  selectedSet.value = null
}

function handleBoxSetSelect(set: ScryfallSet) {
  selectedSetForBox.value = set
  showBoxCardSelector.value = false
}

function handleBoxCardsConfirm(cardIds: string[]) {
  if (!selectedSetForBox.value || !currentPlanId.value || !selectedBinderForView.value) return

  // Create a segment with selected cards, targeted to the current box
  const segment = segmentsStore.addSegment(
    selectedSetForBox.value.name,
    selectedSetForBox.value.code,
    cardIds
  )

  // Set the segment to target this box
  segmentsStore.updateSegment(segment.id, { targetBinderId: selectedBinderForView.value })

  // Add segment to plan
  plansStore.addSegmentToPlan(currentPlanId.value, segment.id)

  // Mark all cards as owned
  const ownershipKeys = cardIds.map((_, index) => `${segment.id}:${index}`)
  collectionStore.setMultipleOwned(ownershipKeys, true)

  // Reset state
  selectedSetForBox.value = null
}

function cancelBoxCardPicker() {
  selectedSetForBox.value = null
  showBoxCardSelector.value = true
}

function removeSegment(segment: Segment) {
  if (currentPlanId.value) {
    plansStore.removeSegmentFromPlan(currentPlanId.value, segment.id)
  }
}

function updateSegmentOffset(segment: Segment, offset: number) {
  segmentsStore.updateSegment(segment.id, { offset })
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

  insertTargetSlot.value = {
    binderId: selectedBinderForView.value,
    pageNumber,
    slotOnPage,
    segmentId: owningSegment.id,
    segmentName: owningSegment.name,
    setCode: owningSegment.scryfallSetCode,
    insertBeforeCardId
  }
  showCardSearch.value = true
}

async function handleCardSelected(card: ScryfallCard) {
  if (!insertTargetSlot.value || !currentPlanId.value) {
    showCardSearch.value = false
    insertTargetSlot.value = null
    return
  }

  try {
    // Insert the card into the existing segment
    segmentsStore.insertCardInSegment(
      insertTargetSlot.value.segmentId,
      card.id,
      insertTargetSlot.value.insertBeforeCardId
    )

    // Recalculate placements
    if (planBinders.value.length > 0 && planSegments.value.length > 0) {
      placementResult.value = await calculatePlacements(planSegments.value, planBinders.value)
    }
  } finally {
    // Always close modal and reset
    showCardSearch.value = false
    insertTargetSlot.value = null
  }
}

function cancelCardSearch() {
  showCardSearch.value = false
  insertTargetSlot.value = null
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
}

function addBinderForOverflow() {
  showBinderForm.value = true
  editingBinder.value = null
}

function cancelCardPicker() {
  selectedSet.value = null
  showSetSelector.value = true
}

function handleKeyDown(event: KeyboardEvent) {
  // Handle ESC key to close modals
  if (event.key === 'Escape') {
    // Close modals in order of priority (most specific/topmost first)
    if (showCardSearch.value) {
      showCardSearch.value = false
      insertTargetSlot.value = null
      event.preventDefault()
      return
    }
    if (selectedSetForBox.value) {
      selectedSetForBox.value = null
      event.preventDefault()
      return
    }
    if (showBoxCardSelector.value) {
      showBoxCardSelector.value = false
      event.preventDefault()
      return
    }
    if (selectedSet.value) {
      selectedSet.value = null
      event.preventDefault()
      return
    }
    if (showSetSelector.value) {
      showSetSelector.value = false
      event.preventDefault()
      return
    }
    if (showNewSetDialog.value) {
      showNewSetDialog.value = false
      event.preventDefault()
      return
    }
    if (showBinderForm.value) {
      showBinderForm.value = false
      editingBinder.value = null
      event.preventDefault()
      return
    }
    if (editingPlanName.value) {
      editingPlanName.value = false
      event.preventDefault()
      return
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
      <section class="flex flex-col gap-3">
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
        <Button class="w-full" @click="createNewPlan"><Plus :size="18" /> New Set</Button>
        <div class="flex flex-col gap-1">
          <button
            v-for="plan in sortedPlans"
            :key="plan.id"
            class="relative overflow-hidden rounded-md border px-3 py-2 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            :class="plan.id === currentPlanId
              ? 'border-brand text-foreground'
              : 'border-line text-ink-soft hover:bg-surface-2 hover:text-foreground'"
            @click="selectPlan(plan)"
          >
            <span class="absolute inset-y-0 left-0 bg-(--accent-soft)" :style="{ width: `${planOwnedPercentage.get(plan.id) ?? 0}%` }" aria-hidden="true"></span>
            <span class="relative flex items-center justify-between gap-2">
              <span class="truncate">{{ plan.name }}</span>
              <span class="shrink-0 text-xs text-ink-faint tabular-nums">{{ planOwnedPercentage.get(plan.id) ?? 0 }}%</span>
            </span>
          </button>
        </div>
      </section>

      <template v-if="currentPlan">
        <section class="flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <template v-if="editingPlanName">
              <Input v-model="planNameInput" class="h-9" @keyup.enter="savePlanName" @keyup.escape="cancelEditPlanName" />
              <Button variant="ghost" size="icon" class="h-9 w-9" title="Save" aria-label="Save" @click="savePlanName"><Check :size="16" /></Button>
              <Button variant="ghost" size="icon" class="h-9 w-9" title="Cancel" aria-label="Cancel" @click="cancelEditPlanName"><X :size="16" /></Button>
            </template>
            <template v-else>
              <h2 class="min-w-0 flex-1 truncate font-display text-base font-bold tracking-tight">{{ currentPlan.name }}</h2>
              <Button variant="ghost" size="icon" class="h-9 w-9" title="Rename" aria-label="Rename" @click="startEditPlanName"><Pencil :size="15" /></Button>
            </template>
          </div>
          <Button v-if="!editingPlanName" variant="ghost" size="sm" class="self-start text-skipped" @click="deletePlan">
            <Trash2 :size="15" /> Delete Set
          </Button>
        </section>

        <section class="flex flex-col gap-2">
          <h2 class="font-display text-sm font-semibold uppercase tracking-[0.08em] text-ink-soft">Storage</h2>
          <Button variant="secondary" class="w-full" @click="showBinderForm = true; editingBinder = null">
            <Plus :size="18" /> Add Storage
          </Button>
          <div class="flex flex-col gap-2">
            <BinderCard
              v-for="binder in planBinders"
              :key="binder.id"
              :binder="binder"
              :planned-cards="cardsPerBinder.get(binder.id)"
              :owned-cards="ownedCardsPerBinder.get(binder.id) ?? 0"
              :selected="binder.id === selectedBinderForView"
              @edit="editBinder"
              @remove="removeBinder"
              @click="viewBinder(binder.id)"
            />
          </div>
        </section>

        <section v-if="!viewingBinder || viewingBinder.type !== 'box'" class="flex flex-col gap-2">
          <h2 class="font-display text-sm font-semibold uppercase tracking-[0.08em] text-ink-soft">Segments</h2>
          <Button variant="secondary" class="w-full" @click="showSetSelector = true">
            <Plus :size="18" /> Add Segment
          </Button>
          <div class="flex flex-col gap-2">
            <SegmentCard
              v-for="segment in planSegments"
              :key="segment.id"
              :segment="segment"
              :binders="planBinders"
              @remove="removeSegment"
              @update-offset="updateSegmentOffset"
              @update-target-binder="updateSegmentTargetBinder"
              @navigate="handleSegmentNavigate"
              @move-up="moveSegmentUp"
              @move-down="moveSegmentDown"
            />
          </div>
        </section>

        <section v-if="placementResult" class="flex flex-col gap-2">
          <h2 class="font-display text-sm font-semibold uppercase tracking-[0.08em] text-ink-soft">Summary</h2>
          <p class="text-sm text-ink-soft tabular-nums">
            {{ placementResult.totalCards }} cards / {{ placementResult.totalCapacity }} capacity
          </p>
          <div v-if="placementResult.overflow.length > 0" class="rounded-lg border border-[color-mix(in_srgb,var(--skipped)_35%,transparent)] bg-(--skipped-soft) p-3 text-sm">
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
          <h2 class="font-display text-2xl font-bold tracking-tight">Your Sets</h2>
          <p class="mt-1 text-ink-soft">Click a set to view and manage your collection.</p>

          <div class="mt-6 grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            <div
              v-for="plan in sortedPlans"
              :key="plan.id"
              class="rounded-xl border border-line bg-surface p-4 shadow-(--shadow-1) transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-(--shadow-2)"
            >
              <div class="flex cursor-pointer items-start justify-between gap-3" @click="selectPlan(plan)">
                <h3 class="min-w-0 truncate font-semibold">{{ plan.name }}</h3>
                <span class="shrink-0 text-xs text-ink-faint tabular-nums">{{ planOwnedPercentage.get(plan.id) ?? 0 }}% complete</span>
              </div>

              <div class="mt-2 cursor-pointer text-sm text-ink-soft tabular-nums" @click="selectPlan(plan)">
                Segments: {{ plan.segmentIds.length }}
              </div>

              <div class="mt-2 h-2 cursor-pointer overflow-hidden rounded-full bg-surface-2" @click="selectPlan(plan)">
                <div class="h-full rounded-full" :style="{ width: `${planOwnedPercentage.get(plan.id) ?? 0}%`, background: 'var(--accent-grad)' }"></div>
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
                    :show-actions="false"
                    @click="selectPlan(plan); viewBinder(binder.id)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="showBinderForm">
        <div class="mx-auto w-full max-w-xl">
          <h2 class="mb-4 font-display text-xl font-bold tracking-tight">{{ editingBinder ? 'Edit' : 'Add' }} Storage</h2>
          <BinderForm
            :binder="editingBinder ?? undefined"
            @submit="handleBinderSubmit"
            @cancel="showBinderForm = false; editingBinder = null"
          />
        </div>
      </template>

      <template v-else-if="showSetSelector">
        <div class="mx-auto w-full max-w-xl">
          <h2 class="mb-4 font-display text-xl font-bold tracking-tight">Select set</h2>
          <SetSelector @select="handleSetSelect" />
          <Button variant="ghost" class="mt-4" @click="showSetSelector = false">Cancel</Button>
        </div>
      </template>

      <template v-else-if="selectedSet">
        <div class="modal-content full-height">
          <CardPicker
            :set="selectedSet"
            @confirm="handleCardsConfirm"
            @cancel="cancelCardPicker"
          />
        </div>
      </template>

      <template v-else-if="showBoxCardSelector">
        <div class="mx-auto w-full max-w-xl">
          <h2 class="mb-4 font-display text-xl font-bold tracking-tight">Select set to add cards from</h2>
          <SetSelector @select="handleBoxSetSelect" />
          <Button variant="ghost" class="mt-4" @click="showBoxCardSelector = false">Cancel</Button>
        </div>
      </template>

      <template v-else-if="selectedSetForBox">
        <div class="card-picker-container">
          <BoxCardPicker
            :set="selectedSetForBox"
            @confirm="handleBoxCardsConfirm"
            @cancel="cancelBoxCardPicker"
          />
        </div>
      </template>

      <template v-else-if="viewingBinder">
        <div class="flex h-[calc(100dvh-6rem)] flex-col gap-3">
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
              v-if="viewingBinder.type === 'binder'"
              size="sm"
              :variant="allBinderCardsOwned ? 'secondary' : 'default'"
              @click="toggleAllBinderOwned"
            >
              {{ allBinderCardsOwned ? 'Mark binder unowned' : 'Mark binder owned' }}
            </Button>
            <Button v-if="viewingBinder.type === 'box'" size="sm" @click="showBoxCardSelector = true">
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
              :initial-page="selectedPage"
              :paused="anyModalOpen"
              @select="onBinderSlotSelect"
              @insert="onBinderSlotInsert"
              @quick-own="onBinderQuickOwn"
              @edge="onBinderEdge"
              @mark-page-owned="onMarkPageOwned"
            />
          </div>

          <!-- Storage box: virtualized linear slot grid -->
          <div v-else class="min-h-0 flex-1 overflow-hidden rounded-lg border border-line bg-surface">
            <div v-if="boxItems.length === 0" class="p-4 text-sm text-ink-soft">
              This box is empty. Use "Add cards" above to add cards from a set.
            </div>
            <BoxView v-else :items="boxItems" @select="onBoxSlotSelect" @toggle-owned="onBoxQuickOwn" />
          </div>
        </div>
      </template>

      <template v-else>
        <div class="empty-state">
          <p>Add storage and segments, then click storage to view placements.</p>
        </div>
      </template>
    </main>

    <CardSearchModal
      v-if="showCardSearch && insertTargetSlot"
      :set-code="insertTargetSlot.setCode"
      :segment-name="insertTargetSlot.segmentName"
      @select="handleCardSelected"
      @cancel="cancelCardSearch"
    />

    <NewSetDialog
      v-if="showNewSetDialog"
      @submit="handleNewSetSubmit"
      @cancel="handleNewSetCancel"
    />

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
      @toggle-owned="onSheetToggleOwned"
      @toggle-skipped="onSheetToggleSkipped"
      @add-spacer="onSheetAddSpacer"
      @remove-spacer="onSheetRemoveSpacer"
      @open-scryfall="onSheetScryfall"
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

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--ink-soft);
  max-width: 600px;
  margin: 0 auto;
  text-align: center;
  padding: 2rem;
}

.modal-content {
  max-width: 600px;
  margin: 0 auto;
}

.card-picker-container {
  height: calc(100vh - 6rem);
  padding: 1rem;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
