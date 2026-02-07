import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Binder } from '@/types'

const STORAGE_KEY = 'spellbinder-binders'

function generateId(): string {
  return crypto.randomUUID()
}

function loadFromStorage(): Binder[] {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored ? JSON.parse(stored) : []
}

function saveToStorage(binders: Binder[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(binders))
}

export const useBindersStore = defineStore('binders', () => {
  const binders = ref<Binder[]>(loadFromStorage())

  const binderMap = computed(() => {
    const map = new Map<string, Binder>()
    for (const binder of binders.value) {
      map.set(binder.id, binder)
    }
    return map
  })

  function getBinder(id: string): Binder | undefined {
    return binderMap.value.get(id)
  }

  function getBinderCapacity(binder: Binder): number {
    return binder.pageCount * binder.slotsPerPage
  }

  function addBinder(name: string, pageCount: number, slotsPerPage: number): Binder {
    const binder: Binder = {
      id: generateId(),
      name,
      pageCount,
      slotsPerPage
    }
    binders.value.push(binder)
    saveToStorage(binders.value)
    return binder
  }

  function updateBinder(id: string, updates: Partial<Omit<Binder, 'id'>>): void {
    const index = binders.value.findIndex(b => b.id === id)
    if (index !== -1) {
      const existing = binders.value[index]
      if (existing) {
        binders.value[index] = { ...existing, ...updates }
        saveToStorage(binders.value)
      }
    }
  }

  function removeBinder(id: string): void {
    const index = binders.value.findIndex(b => b.id === id)
    if (index !== -1) {
      binders.value.splice(index, 1)
      saveToStorage(binders.value)
    }
  }

  function getBindersInOrder(ids: string[]): Binder[] {
    return ids.map(id => binderMap.value.get(id)).filter((b): b is Binder => b !== undefined)
  }

  return {
    binders,
    binderMap,
    getBinder,
    getBinderCapacity,
    addBinder,
    updateBinder,
    removeBinder,
    getBindersInOrder
  }
})
