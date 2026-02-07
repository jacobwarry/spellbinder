import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Segment } from '@/types'
import { useCollectionStore } from './collection'

const STORAGE_KEY = 'spellbinder-segments'

function generateId(): string {
  return crypto.randomUUID()
}

function loadFromStorage(): Segment[] {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return []
  const segments: unknown[] = JSON.parse(stored)
  return segments.map((s: unknown) => {
    const seg = s as Record<string, unknown>
    // Migrate old spacersBefore format (string[]) to new format (Record<number, number>)
    let spacersBefore: Record<number, number> = {}
    if (Array.isArray(seg.spacersBefore)) {
      // Old format was card IDs - we can't migrate these meaningfully, start fresh
      spacersBefore = {}
    } else if (seg.spacersBefore && typeof seg.spacersBefore === 'object') {
      spacersBefore = seg.spacersBefore as Record<number, number>
    }
    return {
      id: seg.id as string,
      name: seg.name as string,
      scryfallSetCode: seg.scryfallSetCode as string,
      cardIds: seg.cardIds as string[],
      offset: (seg.offset as number) ?? 0,
      targetBinderId: seg.targetBinderId as string | undefined,
      spacersBefore
    }
  })
}

function saveToStorage(segments: Segment[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(segments))
}

export const useSegmentsStore = defineStore('segments', () => {
  const segments = ref<Segment[]>(loadFromStorage())

  const segmentMap = computed(() => {
    const map = new Map<string, Segment>()
    for (const segment of segments.value) {
      map.set(segment.id, segment)
    }
    return map
  })

  function getSegment(id: string): Segment | undefined {
    return segmentMap.value.get(id)
  }

  function getSegmentCardCount(segment: Segment): number {
    return segment.cardIds.length
  }

  function addSegment(name: string, scryfallSetCode: string, cardIds: string[], offset: number = 0, targetBinderId?: string): Segment {
    const segment: Segment = {
      id: generateId(),
      name,
      scryfallSetCode,
      cardIds,
      offset,
      targetBinderId,
      spacersBefore: {}
    }
    segments.value.push(segment)
    saveToStorage(segments.value)
    return segment
  }

  function updateSegment(id: string, updates: Partial<Omit<Segment, 'id'>>): void {
    const index = segments.value.findIndex(s => s.id === id)
    if (index !== -1) {
      const existing = segments.value[index]
      if (existing) {
        segments.value[index] = { ...existing, ...updates }
        saveToStorage(segments.value)
      }
    }
  }

  function removeSegment(id: string): void {
    const index = segments.value.findIndex(s => s.id === id)
    if (index !== -1) {
      segments.value.splice(index, 1)
      saveToStorage(segments.value)
    }
  }

  function removeCardFromSegment(segmentId: string, cardId: string): void {
    const segment = segmentMap.value.get(segmentId)
    if (segment) {
      const cardIndex = segment.cardIds.indexOf(cardId)
      if (cardIndex !== -1) {
        removeCardAtIndex(segmentId, cardIndex)
      }
    }
  }

  function removeCardAtIndex(segmentId: string, cardIndex: number): void {
    const segment = segmentMap.value.get(segmentId)
    if (!segment || cardIndex < 0 || cardIndex >= segment.cardIds.length) return

    segment.cardIds.splice(cardIndex, 1)

    // Update spacersBefore: remove spacer for this card and shift indices down
    const newSpacers: Record<number, number> = {}
    for (const [indexStr, count] of Object.entries(segment.spacersBefore)) {
      const idx = parseInt(indexStr, 10)
      if (idx < cardIndex) {
        newSpacers[idx] = count
      } else if (idx > cardIndex) {
        newSpacers[idx - 1] = count
      }
      // Skip idx === cardIndex (remove the spacer for the removed card)
    }
    segment.spacersBefore = newSpacers

    // Shift ownership/skipped indices in collection store
    const collectionStore = useCollectionStore()
    collectionStore.shiftIndicesForRemove(segmentId, cardIndex)

    saveToStorage(segments.value)
  }

  function insertCardInSegment(segmentId: string, cardId: string, insertBeforeCardId: string | null): void {
    const segment = segmentMap.value.get(segmentId)
    if (!segment) return

    if (insertBeforeCardId) {
      // Insert before a specific card
      const index = segment.cardIds.indexOf(insertBeforeCardId)
      if (index !== -1) {
        // Check if the target card has spacers (the new card may be filling one)
        const existingSpacers = segment.spacersBefore[index] ?? 0

        // Shift ownership/skipped indices in collection store BEFORE inserting
        const collectionStore = useCollectionStore()
        collectionStore.shiftIndicesForInsert(segmentId, index)

        segment.cardIds.splice(index, 0, cardId)

        // Shift spacer indices up for cards at or after the insertion point
        const newSpacers: Record<number, number> = {}
        for (const [indexStr, count] of Object.entries(segment.spacersBefore)) {
          const idx = parseInt(indexStr, 10)
          if (idx < index) {
            newSpacers[idx] = count
          } else {
            newSpacers[idx + 1] = count
          }
        }

        // If the target card had spacers, the new card fills one of those blank slots
        // Reduce the spacer count by 1 (it stays with the original card, now shifted)
        if (existingSpacers > 0) {
          if (existingSpacers > 1) {
            newSpacers[index + 1] = existingSpacers - 1
          } else {
            // Only 1 spacer which is now filled by the new card
            delete newSpacers[index + 1]
          }
        }

        segment.spacersBefore = newSpacers
      } else {
        // Fallback: add to end
        segment.cardIds.push(cardId)
      }
    } else {
      // Add to end of segment
      segment.cardIds.push(cardId)
    }
    saveToStorage(segments.value)
  }

  function addSpacerBefore(segmentId: string, cardIndex: number): void {
    const segmentIndex = segments.value.findIndex(s => s.id === segmentId)
    if (segmentIndex === -1) return
    const segment = segments.value[segmentIndex]
    if (!segment || cardIndex < 0 || cardIndex >= segment.cardIds.length) return

    const current = segment.spacersBefore[cardIndex] ?? 0
    const updatedSegment = {
      ...segment,
      spacersBefore: { ...segment.spacersBefore, [cardIndex]: current + 1 }
    }
    segments.value = [
      ...segments.value.slice(0, segmentIndex),
      updatedSegment,
      ...segments.value.slice(segmentIndex + 1)
    ]
    saveToStorage(segments.value)
  }

  function removeSpacerBefore(segmentId: string, cardIndex: number): void {
    const segmentIndex = segments.value.findIndex(s => s.id === segmentId)
    if (segmentIndex === -1) return
    const segment = segments.value[segmentIndex]
    if (!segment || cardIndex < 0 || cardIndex >= segment.cardIds.length) return

    const current = segment.spacersBefore[cardIndex] ?? 0
    if (current <= 0) return

    let newSpacers: Record<number, number>
    if (current > 1) {
      newSpacers = { ...segment.spacersBefore, [cardIndex]: current - 1 }
    } else {
      newSpacers = { ...segment.spacersBefore }
      delete newSpacers[cardIndex]
    }

    const updatedSegment = { ...segment, spacersBefore: newSpacers }
    segments.value = [
      ...segments.value.slice(0, segmentIndex),
      updatedSegment,
      ...segments.value.slice(segmentIndex + 1)
    ]
    saveToStorage(segments.value)
  }

  function getSpacerCount(segmentId: string, cardIndex: number): number {
    const segment = segmentMap.value.get(segmentId)
    return segment?.spacersBefore[cardIndex] ?? 0
  }

  function getSegmentsInOrder(ids: string[]): Segment[] {
    return ids.map(id => segmentMap.value.get(id)).filter((s): s is Segment => s !== undefined)
  }

  return {
    segments,
    segmentMap,
    getSegment,
    getSegmentCardCount,
    addSegment,
    updateSegment,
    removeSegment,
    removeCardFromSegment,
    removeCardAtIndex,
    insertCardInSegment,
    addSpacerBefore,
    removeSpacerBefore,
    getSpacerCount,
    getSegmentsInOrder
  }
})
