import type { Binder, Segment, CardPlacement } from '@/types'
import { getCachedCards } from '@/api/scryfall'

export interface PlacementResult {
  placements: CardPlacement[]
  overflow: {
    segmentId: string
    segmentName: string
    overflowCount: number
  }[]
  totalCards: number
  totalCapacity: number
}

export async function calculatePlacements(
  segments: Segment[],
  binders: Binder[]
): Promise<PlacementResult> {
  const allCardIds = segments.flatMap(s => s.cardIds)
  const cardMap = await getCachedCards(allCardIds)

  const placements: CardPlacement[] = []
  const overflow: PlacementResult['overflow'] = []

  const binderCapacities = binders.map(b =>
    b.type === 'box' ? Number.MAX_SAFE_INTEGER : b.pageCount * b.slotsPerPage
  )
  const totalCapacity = binderCapacities.reduce((sum, cap) => sum + cap, 0)

  // Track next available slot per binder (shared across all placements)
  const binderNextSlot = new Map<string, number>()
  for (const binder of binders) {
    binderNextSlot.set(binder.id, 0)
  }

  // Helper to find first binder with available space, starting from a given index
  function findBinderWithSpace(startIndex: number = 0): { binder: Binder; index: number; slot: number } | null {
    for (let i = startIndex; i < binders.length; i++) {
      const binder = binders[i]
      if (!binder) continue
      const nextSlot = binderNextSlot.get(binder.id) ?? 0
      const cap = binderCapacities[i] ?? 0
      if (nextSlot < cap) {
        return { binder, index: i, slot: nextSlot }
      }
    }
    return null
  }

  // Helper to place a card in a binder at a specific slot
  function placeCard(card: NonNullable<ReturnType<typeof cardMap.get>>, segmentId: string, cardIndexInSegment: number, binder: Binder, binderIndex: number, slot: number) {
    let pageNumber: number
    let slotOnPage: number

    if (binder.type === 'box') {
      // For boxes, no page concept - use linear positioning
      pageNumber = 1  // Always page 1 for boxes (ignored in UI)
      slotOnPage = slot + 1  // Linear position
    } else {
      // Existing binder logic with pages
      pageNumber = Math.floor(slot / binder.slotsPerPage) + 1
      slotOnPage = (slot % binder.slotsPerPage) + 1
    }

    placements.push({
      card,
      segmentId,
      cardIndexInSegment,
      binderId: binder.id,
      binderIndex,
      pageNumber,
      slotOnPage
    })

    binderNextSlot.set(binder.id, slot + 1)
  }

  for (const segment of segments) {
    let segmentOverflow = 0

    // Determine target binder if specified
    let targetBinder: Binder | undefined
    let targetBinderIndex = -1

    if (segment.targetBinderId) {
      targetBinderIndex = binders.findIndex(b => b.id === segment.targetBinderId)
      if (targetBinderIndex !== -1) {
        targetBinder = binders[targetBinderIndex]
      }
    }

    // Apply segment offset to target binder or find auto-fill binder
    if (segment.offset > 0) {
      if (targetBinder) {
        // Apply offset to target binder
        const currentSlot = binderNextSlot.get(targetBinder.id) ?? 0
        binderNextSlot.set(targetBinder.id, currentSlot + segment.offset)
      } else {
        // Apply offset to first binder with space
        const available = findBinderWithSpace()
        if (available) {
          binderNextSlot.set(available.binder.id, available.slot + segment.offset)
        }
      }
    }

    for (let cardIndex = 0; cardIndex < segment.cardIds.length; cardIndex++) {
      const cardId = segment.cardIds[cardIndex]!
      const card = cardMap.get(cardId)
      if (!card) continue

      // Check how many spacers are before this card (by index)
      const spacerCount = segment.spacersBefore[cardIndex] ?? 0

      // First, determine which binder will receive this card
      let placementBinder: Binder | null = null
      let placementBinderIndex: number = -1

      // Try target binder first if specified
      if (targetBinder) {
        const nextSlot = binderNextSlot.get(targetBinder.id) ?? 0
        const cap = binderCapacities[targetBinderIndex] ?? 0
        // Need room for spacers + the card itself
        if (nextSlot + spacerCount < cap) {
          placementBinder = targetBinder
          placementBinderIndex = targetBinderIndex
        }
      }

      // Fall back to auto-fill if no target or target is full
      if (!placementBinder) {
        const startIndex = targetBinderIndex !== -1 ? targetBinderIndex + 1 : 0
        // Find a binder with enough space for spacers + the card
        for (let i = startIndex; i < binders.length; i++) {
          const binder = binders[i]
          if (!binder) continue
          const nextSlot = binderNextSlot.get(binder.id) ?? 0
          const cap = binderCapacities[i] ?? 0
          if (nextSlot + spacerCount < cap) {
            placementBinder = binder
            placementBinderIndex = i
            break
          }
        }
      }

      // Place the card (with spacers applied to the actual destination binder)
      if (placementBinder) {
        // Apply spacers to the binder where the card will actually go
        if (spacerCount > 0) {
          const currentSlot = binderNextSlot.get(placementBinder.id) ?? 0
          binderNextSlot.set(placementBinder.id, currentSlot + spacerCount)
        }

        const slot = binderNextSlot.get(placementBinder.id) ?? 0
        placeCard(card, segment.id, cardIndex, placementBinder, placementBinderIndex, slot)
      } else {
        segmentOverflow++
      }
    }

    if (segmentOverflow > 0) {
      overflow.push({
        segmentId: segment.id,
        segmentName: segment.name,
        overflowCount: segmentOverflow
      })
    }
  }

  return {
    placements,
    overflow,
    totalCards: allCardIds.length,
    totalCapacity
  }
}

export function getPlacementsForBinder(
  placements: CardPlacement[],
  binderId: string
): CardPlacement[] {
  return placements.filter(p => p.binderId === binderId)
}

export function getPlacementsForPage(
  placements: CardPlacement[],
  binderId: string,
  pageNumber: number
): CardPlacement[] {
  return placements.filter(p => p.binderId === binderId && p.pageNumber === pageNumber)
}

export function groupPlacementsByBinder(
  placements: CardPlacement[]
): Map<string, CardPlacement[]> {
  const grouped = new Map<string, CardPlacement[]>()

  for (const placement of placements) {
    const existing = grouped.get(placement.binderId)
    if (existing) {
      existing.push(placement)
    } else {
      grouped.set(placement.binderId, [placement])
    }
  }

  return grouped
}

export function groupPlacementsByPage(
  placements: CardPlacement[]
): Map<string, Map<number, CardPlacement[]>> {
  const grouped = new Map<string, Map<number, CardPlacement[]>>()

  for (const placement of placements) {
    if (!grouped.has(placement.binderId)) {
      grouped.set(placement.binderId, new Map())
    }

    const binderPages = grouped.get(placement.binderId)!
    if (!binderPages.has(placement.pageNumber)) {
      binderPages.set(placement.pageNumber, [])
    }

    binderPages.get(placement.pageNumber)!.push(placement)
  }

  return grouped
}
