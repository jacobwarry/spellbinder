<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { ScryfallSet, ScryfallCard, BinderPlan, Binder, Segment } from '@/types'
import { getPlacementOwnershipKey } from '@/types/placement'
import { useBindersStore, useSegmentsStore, usePlansStore, useCollectionStore } from '@/stores'
import { calculatePlacements, type PlacementResult } from '@/composables/usePlacement'
import BinderCard from '@/components/binder/BinderCard.vue'
import BinderForm from '@/components/binder/BinderForm.vue'
import BinderPageGrid from '@/components/binder/BinderPageGrid.vue'
import SegmentCard from '@/components/segments/SegmentCard.vue'
import SetSelector from '@/components/sets/SetSelector.vue'
import CardPicker from '@/components/sets/CardPicker.vue'
import CardSearchModal from '@/components/cards/CardSearchModal.vue'
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
const placementResult = ref<PlacementResult | null>(null)
const selectedBinderForView = ref<string | null>(null)
const selectedPage = ref(1)
const editingPlanName = ref(false)
const planNameInput = ref('')
const isSpreadView = ref(false)
const SPREAD_VIEW_MIN_WIDTH = 1200
const showCardSearch = ref(false)
const ZOOM_STORAGE_KEY = 'spellbinder-zoom-level'
const zoomLevel = ref(parseInt(localStorage.getItem(ZOOM_STORAGE_KEY) || '100', 10)) // Percentage zoom level
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
const allPlansBinderStats = ref(new Map<string, { planned: number; owned: number }>())

async function updateAllPlansBinderStats() {
  const stats = new Map<string, { planned: number; owned: number }>()

  for (const plan of plansStore.plans) {
    const segments = segmentsStore.getSegmentsInOrder(plan.segmentIds)
    const binders = bindersStore.getBindersInOrder(plan.binderIds)

    if (segments.length === 0 || binders.length === 0) continue

    const result = await calculatePlacements(segments, binders)
    if (!result) continue

    // Count planned and owned cards per binder
    for (const placement of result.placements) {
      const current = stats.get(placement.binderId) ?? { planned: 0, owned: 0 }
      current.planned++

      const key = getPlacementOwnershipKey(placement)
      if (collectionStore.isOwned(key)) {
        current.owned++
      }

      stats.set(placement.binderId, current)
    }
  }

  allPlansBinderStats.value = stats
}

// Update stats when plans, segments, or collection changes
watch(
  () => [plansStore.plans, segmentsStore.segments, collectionStore.ownedCardIds] as const,
  () => updateAllPlansBinderStats(),
  { immediate: true }
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

const currentPagePlacements = computed(() => {
  if (!placementResult.value || !selectedBinderForView.value) return []
  // In spread view, show the left page (even pages on left)
  const pageToShow = isSpreadView.value && leftPageNumber.value ? leftPageNumber.value : selectedPage.value
  return placementResult.value.placements.filter(
    p => p.binderId === selectedBinderForView.value && p.pageNumber === pageToShow
  )
})

const leftPageNumber = computed(() => {
  if (!viewingBinder.value) return null
  if (!isSpreadView.value) return null
  // Page 1 is always alone (front of binder)
  if (selectedPage.value === 1) return selectedPage.value
  // For spreads: even pages go on left, odd pages go on right
  // If we're on an even page, it's already the left page
  // If we're on an odd page, show the previous (even) page as left
  return selectedPage.value % 2 === 0 ? selectedPage.value : selectedPage.value - 1
})

const rightPageNumber = computed(() => {
  if (!viewingBinder.value) return null
  if (!isSpreadView.value) return null
  // Page 1 is always alone (front of binder)
  if (selectedPage.value === 1) return null
  // For spreads: even pages go on left, odd pages go on right
  // Calculate the right page (odd) for this spread
  const leftPage = leftPageNumber.value
  if (leftPage === null) return null
  const rightPage = leftPage + 1
  return rightPage <= viewingBinder.value.pageCount ? rightPage : null
})

const rightPagePlacements = computed(() => {
  if (!placementResult.value || !selectedBinderForView.value || !rightPageNumber.value) return []
  return placementResult.value.placements.filter(
    p => p.binderId === selectedBinderForView.value && p.pageNumber === rightPageNumber.value
  )
})

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

function getPageCardRange(placements: typeof currentPagePlacements.value): string {
  if (placements.length === 0) return ''

  // Group placements by set code
  const setGroups = new Map<string, { min: string; max: string }>()

  for (const placement of placements) {
    const setCode = placement.card.set.toUpperCase()
    const collectorNumber = placement.card.collector_number

    if (!setGroups.has(setCode)) {
      setGroups.set(setCode, { min: collectorNumber, max: collectorNumber })
    } else {
      const group = setGroups.get(setCode)!
      // Compare as strings, but pad with zeros for proper comparison
      const padNum = (num: string) => num.padStart(4, '0')
      if (padNum(collectorNumber) < padNum(group.min)) {
        group.min = collectorNumber
      }
      if (padNum(collectorNumber) > padNum(group.max)) {
        group.max = collectorNumber
      }
    }
  }

  // Format ranges for each set with zero-padded collector numbers
  const padCollectorNumber = (num: string) => num.padStart(4, '0')
  const ranges = Array.from(setGroups.entries()).map(([setCode, { min, max }]) => {
    if (min === max) {
      return `${setCode} ${padCollectorNumber(min)}`
    }
    return `${setCode} ${padCollectorNumber(min)} - ${padCollectorNumber(max)}`
  })

  return ranges.join(', ')
}

const currentPageCardRange = computed(() => getPageCardRange(currentPagePlacements.value))

const rightPageCardRange = computed(() => getPageCardRange(rightPagePlacements.value))

function toggleAllBinderOwned() {
  if (currentBinderPlacementKeys.value.length === 0) return
  collectionStore.setMultipleOwned(currentBinderPlacementKeys.value, !allBinderCardsOwned.value)
}

watch([planBinders, planSegments], async () => {
  if (planBinders.value.length > 0 && planSegments.value.length > 0) {
    placementResult.value = await calculatePlacements(planSegments.value, planBinders.value)
    if (!selectedBinderForView.value && planBinders.value.length > 0) {
      const firstBinder = planBinders.value[0]
      if (firstBinder) {
        selectedBinderForView.value = firstBinder.id
      }
    }
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
  router.push(`/sets/${plan.id}`)
}

function handleNewSetCancel() {
  showNewSetDialog.value = false
}

function selectPlan(plan: BinderPlan) {
  router.push(`/sets/${plan.id}`)
  selectedBinderForView.value = null
  selectedPage.value = 1
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

async function handleBinderSubmit(data: {
  name: string
  pageCount: number
  slotsPerPage: number
  coverImage?: File | null
}) {
  if (editingBinder.value) {
    await bindersStore.updateBinder(editingBinder.value.id, data, data.coverImage)
  } else {
    const binder = await bindersStore.addBinder(
      data.name,
      data.pageCount,
      data.slotsPerPage,
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

function getSpacerCount(segmentId: string, cardIndex: number): number {
  return segmentsStore.getSpacerCount(segmentId, cardIndex)
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
  if (!targetBinder) return

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

// Zoom controls
const zoomLevels = [75, 90, 100, 110, 125, 150]
const currentZoomIndex = computed(() => {
  const index = zoomLevels.indexOf(zoomLevel.value)
  return index >= 0 ? index : 2 // Default to 100%
})

function zoomIn() {
  const nextIndex = Math.min(currentZoomIndex.value + 1, zoomLevels.length - 1)
  zoomLevel.value = zoomLevels[nextIndex] ?? 100
}

function zoomOut() {
  const prevIndex = Math.max(currentZoomIndex.value - 1, 0)
  zoomLevel.value = zoomLevels[prevIndex] ?? 100
}

const canZoomIn = computed(() => currentZoomIndex.value < zoomLevels.length - 1)
const canZoomOut = computed(() => currentZoomIndex.value > 0)

function viewBinder(binderId: string) {
  selectedBinderForView.value = binderId
  selectedPage.value = 1
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

function goToPrevPage() {
  if (isSpreadView.value) {
    // In spread view: from page 2 go to 1, otherwise subtract 2
    if (selectedPage.value === 2) {
      selectedPage.value = 1
    } else if (selectedPage.value > 2) {
      selectedPage.value -= 2
    }
  } else {
    if (selectedPage.value > 1) {
      selectedPage.value--
    }
  }
}

function goToNextPage() {
  if (!viewingBinder.value) return
  const maxPage = viewingBinder.value.pageCount

  if (isSpreadView.value) {
    // In spread view: from page 1 go to 2, otherwise add 2
    if (selectedPage.value === 1) {
      if (maxPage >= 2) selectedPage.value = 2
    } else {
      const nextPos = selectedPage.value + 2
      if (nextPos <= maxPage) {
        selectedPage.value = nextPos
      }
    }
  } else {
    if (selectedPage.value < maxPage) {
      selectedPage.value++
    }
  }
}

const isFirstPageOfBinder = computed(() => selectedPage.value <= 1)

const isLastPageOfBinder = computed(() => {
  if (!viewingBinder.value) return true
  const maxPage = viewingBinder.value.pageCount

  if (isSpreadView.value) {
    if (selectedPage.value === 1) {
      // On page 1, only last if there's just 1 page
      return maxPage === 1
    }
    // On an even page, check if next spread position would be valid
    // Next position would be selectedPage + 2
    return selectedPage.value + 2 > maxPage
  }
  return selectedPage.value >= maxPage
})

const currentBinderIndex = computed(() => {
  return planBinders.value.findIndex(b => b.id === selectedBinderForView.value)
})

const hasPrevBinder = computed(() => currentBinderIndex.value > 0)

const hasNextBinder = computed(() => currentBinderIndex.value < planBinders.value.length - 1)

function goToPrevBinder() {
  if (hasPrevBinder.value) {
    const prevBinder = planBinders.value[currentBinderIndex.value - 1]
    if (prevBinder) {
      selectedBinderForView.value = prevBinder.id
      const binder = bindersStore.getBinder(prevBinder.id)
      selectedPage.value = binder?.pageCount ?? 1
    }
  }
}

function goToNextBinder() {
  if (hasNextBinder.value) {
    const nextBinder = planBinders.value[currentBinderIndex.value + 1]
    if (nextBinder) {
      selectedBinderForView.value = nextBinder.id
      selectedPage.value = 1
    }
  }
}

const totalPages = computed(() => {
  return planBinders.value.reduce((sum, b) => sum + b.pageCount, 0)
})

const globalPagePosition = computed(() => {
  if (!selectedBinderForView.value) return 0
  const currentIndex = planBinders.value.findIndex(b => b.id === selectedBinderForView.value)
  let position = selectedPage.value
  for (let i = 0; i < currentIndex; i++) {
    const binder = planBinders.value[i]
    if (binder) position += binder.pageCount
  }
  return position
})

function goToFirstPage() {
  selectedPage.value = 1
}

function getLastSpreadPosition(pageCount: number): number {
  if (!isSpreadView.value) return pageCount
  if (pageCount <= 1) return 1
  // For even pageCount, last position shows that page alone
  // For odd pageCount, last position is pageCount - 1 (spread ending with last page)
  return pageCount % 2 === 0 ? pageCount : pageCount - 1
}

function goToLastPage() {
  if (viewingBinder.value) {
    selectedPage.value = getLastSpreadPosition(viewingBinder.value.pageCount)
  }
}

function handlePageInput(event: Event) {
  const input = event.target as HTMLInputElement
  const page = parseInt(input.value, 10)
  if (viewingBinder.value && page >= 1 && page <= viewingBinder.value.pageCount) {
    selectedPage.value = page
  } else {
    input.value = String(selectedPage.value)
  }
}

function cancelCardPicker() {
  selectedSet.value = null
  showSetSelector.value = true
}

function handleKeyDown(event: KeyboardEvent) {
  if (!viewingBinder.value || !placementResult.value) return

  const target = event.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') {
    return
  }

  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    if (isSpreadView.value) {
      // Spread view navigation: 1 <- 2 <- 4 <- 6 <- ...
      if (selectedPage.value === 2) {
        selectedPage.value = 1
      } else if (selectedPage.value > 2) {
        selectedPage.value -= 2
      } else if (hasPrevBinder.value) {
        // On page 1, go to previous binder's last spread position
        const prevBinder = planBinders.value[currentBinderIndex.value - 1]
        if (prevBinder) {
          selectedBinderForView.value = prevBinder.id
          const binder = bindersStore.getBinder(prevBinder.id)
          const lastPage = binder?.pageCount ?? 1
          selectedPage.value = getLastSpreadPosition(lastPage)
        }
      }
    } else {
      if (selectedPage.value > 1) {
        selectedPage.value--
      } else if (hasPrevBinder.value) {
        const prevBinder = planBinders.value[currentBinderIndex.value - 1]
        if (prevBinder) {
          selectedBinderForView.value = prevBinder.id
          const binder = bindersStore.getBinder(prevBinder.id)
          selectedPage.value = binder?.pageCount ?? 1
        }
      }
    }
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    const maxPage = viewingBinder.value.pageCount

    if (isSpreadView.value) {
      // Spread view navigation: 1 -> 2 -> 4 -> 6 -> ...
      if (selectedPage.value === 1) {
        if (maxPage >= 2) {
          selectedPage.value = 2
        } else if (hasNextBinder.value) {
          const nextBinder = planBinders.value[currentBinderIndex.value + 1]
          if (nextBinder) {
            selectedBinderForView.value = nextBinder.id
            selectedPage.value = 1
          }
        }
      } else {
        const nextPos = selectedPage.value + 2
        if (nextPos <= maxPage) {
          selectedPage.value = nextPos
        } else if (hasNextBinder.value) {
          const nextBinder = planBinders.value[currentBinderIndex.value + 1]
          if (nextBinder) {
            selectedBinderForView.value = nextBinder.id
            selectedPage.value = 1
          }
        }
      }
    } else {
      if (selectedPage.value < maxPage) {
        selectedPage.value++
      } else if (hasNextBinder.value) {
        const nextBinder = planBinders.value[currentBinderIndex.value + 1]
        if (nextBinder) {
          selectedBinderForView.value = nextBinder.id
          selectedPage.value = 1
        }
      }
    }
  } else if (event.key === ' ') {
    event.preventDefault()
    // In spread view, toggle both pages (but page 1 is alone)
    const leftKeys = currentPagePlacements.value.map(p => getPlacementOwnershipKey(p))
    const rightKeys = isSpreadView.value && rightPageNumber.value ? rightPagePlacements.value.map(p => getPlacementOwnershipKey(p)) : []
    const pageKeys = [...leftKeys, ...rightKeys]
    if (pageKeys.length === 0) return
    const allOwned = pageKeys.every(key => collectionStore.isOwned(key))
    collectionStore.setMultipleOwned(pageKeys, !allOwned)
  }
}

function updateSpreadView() {
  isSpreadView.value = window.innerWidth >= SPREAD_VIEW_MIN_WIDTH
}

// Persist zoom level to localStorage
watch(zoomLevel, (newZoom) => {
  localStorage.setItem(ZOOM_STORAGE_KEY, String(newZoom))
})

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
  window.addEventListener('resize', updateSpreadView)
  updateSpreadView()

  // Check if we should auto-open the create dialog
  if (route.query.create === 'true') {
    showNewSetDialog.value = true
    // Clean up the query parameter
    router.replace('/sets')
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('resize', updateSpreadView)
})
</script>

<template>
  <div class="plan-editor">
    <aside class="sidebar">
      <section class="sidebar-section">
        <div class="section-header">
          <h2>Sets</h2>
          <button
            v-if="currentPlan"
            @click="router.push('/sets')"
            class="btn-back"
            title="Back to overview"
          >
            ←
          </button>
        </div>
        <button @click="createNewPlan" class="btn btn-primary btn-full">+ New Set</button>
        <div class="plan-list">
          <button
            v-for="plan in sortedPlans"
            :key="plan.id"
            @click="selectPlan(plan)"
            class="plan-item"
            :class="{ active: plan.id === currentPlanId }"
          >
            <span
              class="plan-progress"
              :style="{ width: `${planOwnedPercentage.get(plan.id) ?? 0}%` }"
            ></span>
            <span class="plan-name">{{ plan.name }}</span>
            <span class="plan-percent">{{ planOwnedPercentage.get(plan.id) ?? 0 }}%</span>
          </button>
        </div>
      </section>

      <template v-if="currentPlan">
        <section class="sidebar-section plan-actions">
          <div class="plan-header">
            <template v-if="editingPlanName">
              <input
                v-model="planNameInput"
                @keyup.enter="savePlanName"
                @keyup.escape="cancelEditPlanName"
                class="plan-name-input"
                autofocus
              />
              <button @click="savePlanName" class="btn-icon" title="Save">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </button>
              <button @click="cancelEditPlanName" class="btn-icon" title="Cancel">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </template>
            <template v-else>
              <h2>{{ currentPlan.name }}</h2>
              <button @click="startEditPlanName" class="btn-icon" title="Rename">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            </template>
          </div>
          <button v-if="!editingPlanName" @click="deletePlan" class="btn btn-danger btn-small">Delete Set</button>
        </section>

        <section class="sidebar-section">
          <h2>Binders</h2>
          <button @click="showBinderForm = true; editingBinder = null" class="btn btn-secondary btn-full">
            + Add Binder
          </button>
          <div class="item-list">
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

        <section class="sidebar-section">
          <h2>Segments</h2>
          <button @click="showSetSelector = true" class="btn btn-secondary btn-full">
            + Add Segment
          </button>
          <div class="item-list">
            <SegmentCard
              v-for="segment in planSegments"
              :key="segment.id"
              :segment="segment"
              :binders="planBinders"
              @remove="removeSegment"
              @update-offset="updateSegmentOffset"
              @update-target-binder="updateSegmentTargetBinder"
              @navigate="handleSegmentNavigate"
            />
          </div>
        </section>

        <section v-if="placementResult" class="sidebar-section">
          <h2>Summary</h2>
          <p class="summary-text">
            {{ placementResult.totalCards }} cards / {{ placementResult.totalCapacity }} capacity
          </p>
          <div v-if="placementResult.overflow.length > 0" class="overflow-warning">
            <strong>Overflow: {{ totalOverflowCount }} cards</strong>
            <ul>
              <li v-for="o in placementResult.overflow" :key="o.segmentId">
                {{ o.segmentName }}: {{ o.overflowCount }} cards
              </li>
            </ul>
            <button @click="addBinderForOverflow" class="btn btn-primary btn-small btn-full overflow-btn">
              + Add Binder for Overflow
            </button>
          </div>
        </section>
      </template>
    </aside>

    <main class="main-content">
      <template v-if="!currentPlan">
        <!-- No sets exist -->
        <div v-if="plansStore.plans.length === 0" class="empty-state">
          <h2>Get Started with Your Collection</h2>
          <p class="empty-description">
            Click the <strong>"+ New Set"</strong> button to create your first set. You can add binders to organize your cards
            and segments to track specific MTG sets from Scryfall.
          </p>
          <p class="empty-tip">
            💡 <strong>Tip:</strong> When creating a set, you can optionally create a binder and select a Scryfall set
            all in one step to get started quickly!
          </p>
        </div>

        <!-- Sets exist, show overview -->
        <div v-else class="overview-section">
          <h2>Your Sets</h2>
          <p class="overview-subtitle">Click on a set to view and manage your collection</p>

          <div class="sets-overview">
            <div
              v-for="plan in sortedPlans"
              :key="plan.id"
              class="set-overview-card"
            >
              <div class="set-overview-header" @click="selectPlan(plan)">
                <h3>{{ plan.name }}</h3>
                <div class="set-completion">
                  {{ planOwnedPercentage.get(plan.id) ?? 0 }}% complete
                </div>
              </div>

              <div class="set-overview-stats" @click="selectPlan(plan)">
                <div class="stat-item">
                  <span class="stat-label">Segments:</span>
                  <span class="stat-value">{{ plan.segmentIds.length }}</span>
                </div>
              </div>

              <div class="set-progress-bar" @click="selectPlan(plan)">
                <div
                  class="set-progress-fill"
                  :style="{ width: `${planOwnedPercentage.get(plan.id) ?? 0}%` }"
                ></div>
              </div>

              <div v-if="plan.binderIds.length > 0" class="set-binders">
                <h4>Binders</h4>
                <div class="binder-list-compact">
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
        <div class="modal-content">
          <h2>{{ editingBinder ? 'Edit' : 'Add' }} Binder</h2>
          <BinderForm
            :binder="editingBinder ?? undefined"
            @submit="handleBinderSubmit"
            @cancel="showBinderForm = false; editingBinder = null"
          />
        </div>
      </template>

      <template v-else-if="showSetSelector">
        <div class="modal-content">
          <h2>Select Set</h2>
          <SetSelector @select="handleSetSelect" />
          <button @click="showSetSelector = false" class="btn btn-secondary" style="margin-top: 1rem">
            Cancel
          </button>
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

      <template v-else-if="viewingBinder && placementResult">
        <div class="binder-view">
          <div class="binder-view-header">
            <div class="binder-selector">
              <label>Binder:</label>
              <select v-model="selectedBinderForView" @change="selectedPage = 1">
                <option v-for="binder in planBinders" :key="binder.id" :value="binder.id">
                  {{ binder.name }}
                </option>
              </select>
            </div>
            <div class="zoom-controls">
              <button
                @click="zoomOut"
                :disabled="!canZoomOut"
                class="btn btn-small btn-icon"
                title="Zoom out"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                  <line x1="8" y1="11" x2="14" y2="11"/>
                </svg>
              </button>
              <span class="zoom-level">{{ zoomLevel }}%</span>
              <button
                @click="zoomIn"
                :disabled="!canZoomIn"
                class="btn btn-small btn-icon"
                title="Zoom in"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                  <line x1="11" y1="8" x2="11" y2="14"/>
                  <line x1="8" y1="11" x2="14" y2="11"/>
                </svg>
              </button>
            </div>
            <button
              @click="toggleAllBinderOwned"
              class="btn btn-small"
              :class="allBinderCardsOwned ? 'btn-secondary' : 'btn-primary'"
            >
              {{ allBinderCardsOwned ? 'Mark binder unowned' : 'Mark binder owned' }}
            </button>
          </div>
          <div class="page-spread" :class="{ 'spread-view': isSpreadView }">
            <div class="page-wrapper">
              <div class="page-label">
                Page {{ isSpreadView && leftPageNumber ? leftPageNumber : selectedPage }}
                <span v-if="currentPageCardRange" class="card-range">{{ currentPageCardRange }}</span>
              </div>
              <BinderPageGrid
                :placements="currentPagePlacements"
                :slots-per-page="viewingBinder.slotsPerPage"
                :page-number="isSpreadView && leftPageNumber ? leftPageNumber : selectedPage"
                :get-spacer-count="getSpacerCount"
                :zoom-level="zoomLevel"
                @remove-card="handleRemoveCard"
                @add-spacer="handleAddSpacer"
                @remove-spacer="handleRemoveSpacer"
                @insert-card="handleInsertCard"
              />
            </div>
            <div v-if="isSpreadView && rightPageNumber" class="page-wrapper">
              <div class="page-label">
                Page {{ rightPageNumber }}
                <span v-if="rightPageCardRange" class="card-range">{{ rightPageCardRange }}</span>
              </div>
              <BinderPageGrid
                :placements="rightPagePlacements"
                :slots-per-page="viewingBinder.slotsPerPage"
                :page-number="rightPageNumber"
                :get-spacer-count="getSpacerCount"
                :zoom-level="zoomLevel"
                @remove-card="handleRemoveCard"
                @add-spacer="handleAddSpacer"
                @remove-spacer="handleRemoveSpacer"
                @insert-card="handleInsertCard"
              />
            </div>
          </div>
          <div class="pagination">
            <button
              @click="goToFirstPage"
              :disabled="isFirstPageOfBinder"
              class="btn btn-small"
              title="First page of binder"
            >
              ««
            </button>
            <button
              @click="goToPrevPage"
              :disabled="isFirstPageOfBinder"
              class="btn btn-small"
              title="Previous page"
            >
              «
            </button>
            <div class="page-input-group">
              <input
                type="number"
                :value="selectedPage"
                @change="handlePageInput"
                :min="1"
                :max="viewingBinder.pageCount"
                class="page-input"
              />
              <span v-if="isSpreadView && rightPageNumber" class="page-range">-{{ rightPageNumber }}</span>
              <span class="page-total">/ {{ viewingBinder.pageCount }}</span>
            </div>
            <button
              @click="goToNextPage"
              :disabled="isLastPageOfBinder"
              class="btn btn-small"
              title="Next page"
            >
              »
            </button>
            <button
              @click="goToLastPage"
              :disabled="isLastPageOfBinder"
              class="btn btn-small"
              title="Last page of binder"
            >
              »»
            </button>
            <span class="global-position">
              ({{ globalPagePosition }} / {{ totalPages }} total)
            </span>
          </div>
          <div v-if="isFirstPageOfBinder && hasPrevBinder" class="binder-nav binder-nav-prev">
            <button @click="goToPrevBinder" class="btn btn-secondary btn-small">
              ← Previous binder
            </button>
          </div>
          <div v-if="isLastPageOfBinder && hasNextBinder" class="binder-nav binder-nav-next">
            <button @click="goToNextBinder" class="btn btn-secondary btn-small">
              Next binder →
            </button>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="empty-state">
          <p>Add binders and segments, then click a binder to view placements.</p>
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
  </div>
</template>

<style scoped>
.plan-editor {
  display: flex;
  height: 100%;
}

.sidebar {
  width: 380px;
  background: #f8f8f8;
  border-right: 1px solid #ddd;
  padding: 1rem;
  overflow-y: auto;
  flex-shrink: 0;
}

.sidebar-section {
  margin-bottom: 1.5rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.sidebar-section h2 {
  margin: 0;
  font-size: 1rem;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.btn-back {
  background: none;
  border: 1px solid #ddd;
  color: #666;
  font-size: 1.25rem;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.2s;
}

.btn-back:hover {
  background: #e5e5e5;
  border-color: #4a90d9;
  color: #4a90d9;
}

.plan-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-top: 0.5rem;
}

.plan-item {
  position: relative;
  display: flex;
  align-items: center;
  padding: 0.5rem;
  border: 2px solid #ddd;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  text-align: left;
  overflow: hidden;
}

.plan-item:hover {
  border-color: #bbb;
}

.plan-item.active {
  border-color: #4a90d9;
}

.plan-progress {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  background: #d4edda;
  transition: width 0.2s ease;
}

.plan-name {
  position: relative;
  z-index: 1;
  flex: 1;
}

.plan-percent {
  position: relative;
  z-index: 1;
  font-weight: bold;
  font-size: 0.875rem;
}

.item-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.summary-text {
  margin: 0;
  font-size: 0.875rem;
}

.overflow-warning {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: #fee;
  border: 1px solid #fcc;
  border-radius: 4px;
  font-size: 0.875rem;
  color: #c00;
}

.overflow-warning ul {
  margin: 0.25rem 0 0 1rem;
  padding: 0;
}

.main-content {
  flex: 1;
  padding: 1rem;
  overflow-y: auto;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #666;
  max-width: 600px;
  margin: 0 auto;
  text-align: center;
  padding: 2rem;
}

.empty-state h2 {
  margin: 0 0 1rem 0;
  font-size: 1.75rem;
  color: #333;
}

.empty-description {
  font-size: 1.125rem;
  line-height: 1.6;
  margin: 0 0 1.5rem 0;
  color: #555;
}

.empty-tip {
  background: #f0f7ff;
  border: 1px solid #4a90d9;
  border-radius: 8px;
  padding: 1rem;
  font-size: 0.95rem;
  line-height: 1.5;
  color: #333;
  text-align: left;
}

.overview-section {
  padding: 2rem;
}

.overview-section h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1.75rem;
  color: #333;
}

.overview-subtitle {
  margin: 0 0 2rem 0;
  color: #666;
  font-size: 1rem;
}

.sets-overview {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
}

.set-overview-card {
  background: white;
  border: 2px solid #ddd;
  border-radius: 8px;
  padding: 1.5rem;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
}

.set-overview-header,
.set-overview-stats,
.set-progress-bar {
  cursor: pointer;
}

.set-overview-card:hover .set-overview-header,
.set-overview-card:hover .set-overview-stats,
.set-overview-card:hover .set-progress-bar {
  opacity: 0.8;
}

.set-overview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.set-overview-header h3 {
  margin: 0;
  font-size: 1.25rem;
  color: #333;
  flex: 1;
}

.set-completion {
  font-size: 0.75rem;
  font-weight: 600;
  color: #28a745;
}

.set-overview-stats {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 1rem;
}

.stat-item {
  display: flex;
  gap: 0.5rem;
}

.stat-label {
  color: #888;
  font-size: 0.875rem;
}

.stat-value {
  font-weight: 600;
  color: #333;
  font-size: 0.875rem;
}

.set-progress-bar {
  width: 100%;
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
}

.set-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #28a745 0%, #20c997 100%);
  transition: width 0.3s ease;
}

.set-binders {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #eee;
}

.set-binders h4 {
  margin: 0 0 0.75rem 0;
  font-size: 0.875rem;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.binder-list-compact {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.modal-content {
  max-width: 600px;
  margin: 0 auto;
}

.modal-content.full-height {
  height: calc(100vh - 2rem);
  max-width: 100%;
}

.binder-view {
  max-width: 600px;
  margin: 0 auto;
  padding: 1rem;
}

.binder-view:has(.spread-view) {
  max-width: none;
}

.page-spread {
  display: flex;
  gap: 1rem;
  justify-content: center;
  overflow-x: auto;
}

.page-spread:not(.spread-view) {
  flex-direction: column;
}

.page-spread.spread-view {
  justify-content: center;
}

.page-spread.spread-view .page-wrapper {
  flex-shrink: 0;
}

.page-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.page-label {
  text-align: center;
  font-size: 0.75rem;
  color: #666;
  font-weight: 500;
}

.card-range {
  display: block;
  font-size: 0.65rem;
  color: #999;
  font-weight: 400;
  margin-top: 0.125rem;
}

.page-range {
  color: #666;
  font-size: 0.875rem;
}

.binder-view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.binder-view-header h2 {
  margin: 0;
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.zoom-level {
  font-size: 0.875rem;
  color: #666;
  min-width: 3rem;
  text-align: center;
}

.btn-icon {
  padding: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.page-nav {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
}

.btn-primary {
  background: #4a90d9;
  color: white;
}

.btn-primary:hover {
  background: #3a7bc8;
}

.btn-secondary {
  background: #e5e5e5;
  color: #333;
}

.btn-secondary:hover {
  background: #d5d5d5;
}

.btn-full {
  width: 100%;
}

.btn-small {
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-danger {
  background: #dc3545;
  color: white;
}

.btn-danger:hover {
  background: #c82333;
}

.plan-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #ddd;
}

.plan-actions h2 {
  margin: 0;
  text-transform: none;
  color: #333;
}

.plan-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.plan-name-input {
  flex: 1;
  padding: 0.25rem 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  border: 1px solid #4a90d9;
  border-radius: 4px;
  outline: none;
}

.plan-header .btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #f5f5f5;
  color: #666;
  cursor: pointer;
}

.plan-header .btn-icon:hover {
  background: #e5e5e5;
  color: #333;
}

.overflow-btn {
  margin-top: 0.5rem;
}

.binder-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.binder-selector label {
  font-weight: 500;
}

.binder-selector select {
  padding: 0.375rem 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 1rem;
  min-width: 150px;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #eee;
}

.page-input-group {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.page-input {
  width: 60px;
  padding: 0.25rem 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  text-align: center;
  font-size: 0.875rem;
}

.page-input::-webkit-inner-spin-button,
.page-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.page-input[type=number] {
  -moz-appearance: textfield;
}

.page-total {
  color: #666;
  font-size: 0.875rem;
}

.global-position {
  color: #999;
  font-size: 0.75rem;
  margin-left: 0.5rem;
}

.binder-nav {
  display: flex;
  justify-content: center;
  margin-top: 0.75rem;
}

.binder-nav button {
  background: #f0f7ff;
  border: 1px solid #4a90d9;
  color: #4a90d9;
}

.binder-nav button:hover {
  background: #e0efff;
}
</style>
