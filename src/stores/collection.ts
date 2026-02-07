import { defineStore } from 'pinia'
import { ref } from 'vue'

const STORAGE_KEY = 'spellbinder-collection'
const SKIPPED_STORAGE_KEY = 'spellbinder-skipped'

function loadFromStorage(key: string): Set<string> {
  const stored = localStorage.getItem(key)
  return stored ? new Set(JSON.parse(stored)) : new Set()
}

function saveToStorage(key: string, cardIds: Set<string>): void {
  localStorage.setItem(key, JSON.stringify([...cardIds]))
}

export const useCollectionStore = defineStore('collection', () => {
  const ownedCardIds = ref<Set<string>>(loadFromStorage(STORAGE_KEY))
  const skippedCardIds = ref<Set<string>>(loadFromStorage(SKIPPED_STORAGE_KEY))

  function isOwned(cardId: string): boolean {
    return ownedCardIds.value.has(cardId)
  }

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

  // Shift indices when a card is inserted (indices >= insertIndex move up by 1)
  function shiftIndicesForInsert(segmentId: string, insertIndex: number): void {
    const prefix = `${segmentId}:`
    const newOwned = new Set<string>()
    const newSkipped = new Set<string>()

    for (const key of ownedCardIds.value) {
      if (key.startsWith(prefix)) {
        const idx = parseInt(key.slice(prefix.length), 10)
        if (idx >= insertIndex) {
          newOwned.add(`${segmentId}:${idx + 1}`)
        } else {
          newOwned.add(key)
        }
      } else {
        newOwned.add(key)
      }
    }

    for (const key of skippedCardIds.value) {
      if (key.startsWith(prefix)) {
        const idx = parseInt(key.slice(prefix.length), 10)
        if (idx >= insertIndex) {
          newSkipped.add(`${segmentId}:${idx + 1}`)
        } else {
          newSkipped.add(key)
        }
      } else {
        newSkipped.add(key)
      }
    }

    ownedCardIds.value = newOwned
    skippedCardIds.value = newSkipped
    saveToStorage(STORAGE_KEY, ownedCardIds.value)
    saveToStorage(SKIPPED_STORAGE_KEY, skippedCardIds.value)
  }

  // Shift indices when a card is removed (remove the key at removeIndex, indices > removeIndex move down by 1)
  function shiftIndicesForRemove(segmentId: string, removeIndex: number): void {
    const prefix = `${segmentId}:`
    const newOwned = new Set<string>()
    const newSkipped = new Set<string>()

    for (const key of ownedCardIds.value) {
      if (key.startsWith(prefix)) {
        const idx = parseInt(key.slice(prefix.length), 10)
        if (idx === removeIndex) {
          // Skip - this key is being removed
        } else if (idx > removeIndex) {
          newOwned.add(`${segmentId}:${idx - 1}`)
        } else {
          newOwned.add(key)
        }
      } else {
        newOwned.add(key)
      }
    }

    for (const key of skippedCardIds.value) {
      if (key.startsWith(prefix)) {
        const idx = parseInt(key.slice(prefix.length), 10)
        if (idx === removeIndex) {
          // Skip - this key is being removed
        } else if (idx > removeIndex) {
          newSkipped.add(`${segmentId}:${idx - 1}`)
        } else {
          newSkipped.add(key)
        }
      } else {
        newSkipped.add(key)
      }
    }

    ownedCardIds.value = newOwned
    skippedCardIds.value = newSkipped
    saveToStorage(STORAGE_KEY, ownedCardIds.value)
    saveToStorage(SKIPPED_STORAGE_KEY, skippedCardIds.value)
  }

  return {
    ownedCardIds,
    skippedCardIds,
    isOwned,
    toggleOwned,
    setOwned,
    setMultipleOwned,
    isSkipped,
    toggleSkipped,
    setSkipped,
    shiftIndicesForInsert,
    shiftIndicesForRemove
  }
})
