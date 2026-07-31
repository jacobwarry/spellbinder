import { defineStore } from 'pinia'
import { ref } from 'vue'

const STORAGE_KEY = 'spellbinder-collection'          // non-foil owned
const FOIL_STORAGE_KEY = 'spellbinder-collection-foil' // foil owned
const SKIPPED_STORAGE_KEY = 'spellbinder-skipped'

function loadFromStorage(key: string): Set<string> {
  const stored = localStorage.getItem(key)
  return stored ? new Set(JSON.parse(stored)) : new Set()
}

function saveToStorage(key: string, cardIds: Set<string>): void {
  localStorage.setItem(key, JSON.stringify([...cardIds]))
}

// ---- Pure re-keying helpers, shared across every position-keyed set so the
// non-foil / foil / skipped sets always shift in lockstep (the ownership index
// invariant). `prefix` is `${segmentId}:`.
function withoutSegment(set: Set<string>, prefix: string): Set<string> {
  const next = new Set<string>()
  for (const key of set) if (!key.startsWith(prefix)) next.add(key)
  return next
}
function shiftInsert(set: Set<string>, prefix: string, insertIndex: number): Set<string> {
  const next = new Set<string>()
  for (const key of set) {
    if (key.startsWith(prefix)) {
      const idx = parseInt(key.slice(prefix.length), 10)
      next.add(idx >= insertIndex ? `${prefix}${idx + 1}` : key)
    } else {
      next.add(key)
    }
  }
  return next
}
function shiftRemove(set: Set<string>, prefix: string, removeIndex: number): Set<string> {
  const next = new Set<string>()
  for (const key of set) {
    if (key.startsWith(prefix)) {
      const idx = parseInt(key.slice(prefix.length), 10)
      if (idx === removeIndex) continue // this key is being removed
      next.add(idx > removeIndex ? `${prefix}${idx - 1}` : key)
    } else {
      next.add(key)
    }
  }
  return next
}

export const useCollectionStore = defineStore('collection', () => {
  // Two owned sets by finish. "Owned" (for status/stats) means present in either.
  // Pre-existing data lives in the non-foil set, so everything already owned reads
  // as non-foil owned by default.
  const ownedCardIds = ref<Set<string>>(loadFromStorage(STORAGE_KEY))
  const ownedFoilCardIds = ref<Set<string>>(loadFromStorage(FOIL_STORAGE_KEY))
  const skippedCardIds = ref<Set<string>>(loadFromStorage(SKIPPED_STORAGE_KEY))

  function isOwned(cardId: string): boolean {
    return ownedCardIds.value.has(cardId) || ownedFoilCardIds.value.has(cardId)
  }
  function isOwnedNonFoil(cardId: string): boolean {
    return ownedCardIds.value.has(cardId)
  }
  function isOwnedFoil(cardId: string): boolean {
    return ownedFoilCardIds.value.has(cardId)
  }

  // ---- Non-foil ownership (the default finish; drives quick-own + bulk) ----
  function toggleOwned(cardId: string): void {
    if (ownedCardIds.value.has(cardId)) {
      ownedCardIds.value.delete(cardId)
    } else {
      ownedCardIds.value.add(cardId)
    }
    ownedCardIds.value = new Set(ownedCardIds.value)
    saveToStorage(STORAGE_KEY, ownedCardIds.value)
  }

  function setOwned(cardId: string, owned: boolean): void {
    if (owned) {
      ownedCardIds.value.add(cardId)
    } else {
      ownedCardIds.value.delete(cardId)
    }
    ownedCardIds.value = new Set(ownedCardIds.value)
    saveToStorage(STORAGE_KEY, ownedCardIds.value)
  }

  function setMultipleOwned(cardIds: string[], owned: boolean): void {
    for (const cardId of cardIds) {
      if (owned) {
        ownedCardIds.value.add(cardId)
      } else {
        ownedCardIds.value.delete(cardId)
      }
    }
    ownedCardIds.value = new Set(ownedCardIds.value)
    saveToStorage(STORAGE_KEY, ownedCardIds.value)
  }

  // ---- Foil ownership ----
  function setFoilOwned(cardId: string, owned: boolean): void {
    if (owned) {
      ownedFoilCardIds.value.add(cardId)
    } else {
      ownedFoilCardIds.value.delete(cardId)
    }
    ownedFoilCardIds.value = new Set(ownedFoilCardIds.value)
    saveToStorage(FOIL_STORAGE_KEY, ownedFoilCardIds.value)
  }

  function setMultipleFoilOwned(cardIds: string[], owned: boolean): void {
    for (const cardId of cardIds) {
      if (owned) {
        ownedFoilCardIds.value.add(cardId)
      } else {
        ownedFoilCardIds.value.delete(cardId)
      }
    }
    ownedFoilCardIds.value = new Set(ownedFoilCardIds.value)
    saveToStorage(FOIL_STORAGE_KEY, ownedFoilCardIds.value)
  }

  function toggleFoil(cardId: string): void {
    if (ownedFoilCardIds.value.has(cardId)) {
      ownedFoilCardIds.value.delete(cardId)
    } else {
      ownedFoilCardIds.value.add(cardId)
    }
    ownedFoilCardIds.value = new Set(ownedFoilCardIds.value)
    saveToStorage(FOIL_STORAGE_KEY, ownedFoilCardIds.value)
  }

  function isSkipped(cardId: string): boolean {
    return skippedCardIds.value.has(cardId)
  }

  function toggleSkipped(cardId: string): void {
    if (skippedCardIds.value.has(cardId)) {
      skippedCardIds.value.delete(cardId)
    } else {
      skippedCardIds.value.add(cardId)
    }
    skippedCardIds.value = new Set(skippedCardIds.value)
    saveToStorage(SKIPPED_STORAGE_KEY, skippedCardIds.value)
  }

  function setSkipped(cardId: string, skipped: boolean): void {
    if (skipped) {
      skippedCardIds.value.add(cardId)
    } else {
      skippedCardIds.value.delete(cardId)
    }
    skippedCardIds.value = new Set(skippedCardIds.value)
    saveToStorage(SKIPPED_STORAGE_KEY, skippedCardIds.value)
  }

  // Drop every owned/foil/skipped key belonging to a segment. Called when a segment
  // is deleted so its position-keyed ownership data doesn't linger as orphaned state.
  function clearSegment(segmentId: string): void {
    const prefix = `${segmentId}:`
    ownedCardIds.value = withoutSegment(ownedCardIds.value, prefix)
    ownedFoilCardIds.value = withoutSegment(ownedFoilCardIds.value, prefix)
    skippedCardIds.value = withoutSegment(skippedCardIds.value, prefix)
    saveToStorage(STORAGE_KEY, ownedCardIds.value)
    saveToStorage(FOIL_STORAGE_KEY, ownedFoilCardIds.value)
    saveToStorage(SKIPPED_STORAGE_KEY, skippedCardIds.value)
  }

  // Shift indices when a card is inserted (indices >= insertIndex move up by 1).
  function shiftIndicesForInsert(segmentId: string, insertIndex: number): void {
    const prefix = `${segmentId}:`
    ownedCardIds.value = shiftInsert(ownedCardIds.value, prefix, insertIndex)
    ownedFoilCardIds.value = shiftInsert(ownedFoilCardIds.value, prefix, insertIndex)
    skippedCardIds.value = shiftInsert(skippedCardIds.value, prefix, insertIndex)
    saveToStorage(STORAGE_KEY, ownedCardIds.value)
    saveToStorage(FOIL_STORAGE_KEY, ownedFoilCardIds.value)
    saveToStorage(SKIPPED_STORAGE_KEY, skippedCardIds.value)
  }

  // Shift indices when a card is removed (drop removeIndex, indices > it move down by 1).
  function shiftIndicesForRemove(segmentId: string, removeIndex: number): void {
    const prefix = `${segmentId}:`
    ownedCardIds.value = shiftRemove(ownedCardIds.value, prefix, removeIndex)
    ownedFoilCardIds.value = shiftRemove(ownedFoilCardIds.value, prefix, removeIndex)
    skippedCardIds.value = shiftRemove(skippedCardIds.value, prefix, removeIndex)
    saveToStorage(STORAGE_KEY, ownedCardIds.value)
    saveToStorage(FOIL_STORAGE_KEY, ownedFoilCardIds.value)
    saveToStorage(SKIPPED_STORAGE_KEY, skippedCardIds.value)
  }

  return {
    ownedCardIds,
    ownedFoilCardIds,
    skippedCardIds,
    isOwned,
    isOwnedNonFoil,
    isOwnedFoil,
    toggleOwned,
    toggleFoil,
    setFoilOwned,
    setMultipleFoilOwned,
    setOwned,
    setMultipleOwned,
    isSkipped,
    toggleSkipped,
    setSkipped,
    clearSegment,
    shiftIndicesForInsert,
    shiftIndicesForRemove
  }
})
