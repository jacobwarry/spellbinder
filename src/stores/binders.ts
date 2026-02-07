import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Binder } from '@/types'
import { processBinderImage, saveBinderImage, deleteBinderImage } from '@/utils/binderImages'

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

  async function addBinder(
    name: string,
    pageCount: number,
    slotsPerPage: number,
    coverImage?: File
  ): Promise<Binder> {
    const binder: Binder = {
      id: generateId(),
      name,
      pageCount,
      slotsPerPage,
      hasCoverImage: false
    }

    // Process and save cover image if provided
    if (coverImage) {
      try {
        const processedBlob = await processBinderImage(coverImage, slotsPerPage)
        await saveBinderImage(binder.id, processedBlob, slotsPerPage)
        binder.hasCoverImage = true
      } catch (error) {
        console.error('Failed to save cover image:', error)
      }
    }

    binders.value.push(binder)
    saveToStorage(binders.value)
    return binder
  }

  async function updateBinder(
    id: string,
    updates: Partial<Omit<Binder, 'id'>>,
    coverImage?: File | null
  ): Promise<void> {
    const index = binders.value.findIndex(b => b.id === id)
    if (index !== -1) {
      const existing = binders.value[index]
      if (existing) {
        const updatedBinder = { ...existing, ...updates }

        // Handle cover image updates
        if (coverImage === null) {
          // Remove cover image
          try {
            await deleteBinderImage(id)
            updatedBinder.hasCoverImage = false
          } catch (error) {
            console.error('Failed to delete cover image:', error)
          }
        } else if (coverImage instanceof File) {
          // Update with new cover image
          try {
            const processedBlob = await processBinderImage(coverImage, updatedBinder.slotsPerPage)
            await saveBinderImage(id, processedBlob, updatedBinder.slotsPerPage)
            updatedBinder.hasCoverImage = true
          } catch (error) {
            console.error('Failed to save cover image:', error)
          }
        }

        binders.value[index] = updatedBinder
        saveToStorage(binders.value)
      }
    }
  }

  async function removeBinder(id: string): Promise<void> {
    const index = binders.value.findIndex(b => b.id === id)
    if (index !== -1) {
      const binder = binders.value[index]

      // Delete cover image if it exists
      if (binder?.hasCoverImage) {
        try {
          await deleteBinderImage(id)
        } catch (error) {
          console.error('Failed to delete cover image:', error)
        }
      }

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
