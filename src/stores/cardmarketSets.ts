import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CardmarketOverrides } from '@/utils/cardmarket'

const STORAGE_KEY = 'spellbinder-cardmarket-sets'

function loadFromStorage(): CardmarketOverrides {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored ? JSON.parse(stored) : {}
}

function saveToStorage(overrides: CardmarketOverrides): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
}

/**
 * User corrections to the derived Cardmarket expansion names, keyed by `${setCode}:${variant}`
 * (see `resolveCardmarketExpansion`). Cardmarket's catalogue doesn't map 1:1 to Scryfall and we
 * can't fetch their names (OAuth-only API, CORS-blocked), so the export starts from a heuristic
 * and the user pins the exact name once per set+variant. Persisted so it applies to every future
 * "Copy missing · Cardmarket".
 */
export const useCardmarketSetsStore = defineStore('cardmarketSets', () => {
  const overrides = ref<CardmarketOverrides>(loadFromStorage())

  function get(key: string): string | undefined {
    return overrides.value[key]
  }

  /** Pin an expansion name for a key, or clear it (empty/whitespace, or matching the heuristic). */
  function set(key: string, name: string, heuristic?: string): void {
    const trimmed = name.trim()
    const next = { ...overrides.value }
    if (!trimmed || trimmed === heuristic?.trim()) {
      delete next[key]
    } else {
      next[key] = trimmed
    }
    overrides.value = next
    saveToStorage(overrides.value)
  }

  function clear(key: string): void {
    if (!(key in overrides.value)) return
    const next = { ...overrides.value }
    delete next[key]
    overrides.value = next
    saveToStorage(overrides.value)
  }

  return { overrides, get, set, clear }
})
