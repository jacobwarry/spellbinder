import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Binder, Container, PhysicalBinder, StorageBox } from '@/types'
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

// Type guards for container discrimination
export function isPhysicalBinder(container: Container): container is PhysicalBinder {
  return container.type === 'binder'
}

export function isStorageBox(container: Container): container is StorageBox {
  return container.type === 'box'
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

  function getBinderCapacity(container: Container): number {
    if (container.type === 'box') {
      return Number.MAX_SAFE_INTEGER  // Effectively unlimited
    }
    return container.pageCount * container.slotsPerPage
  }

  async function addBinder(
    name: string,
    containerConfig:
      | { type: 'binder'; pageCount: number; slotsPerPage: number }
      | { type: 'box' },
    coverImage?: File
  ): Promise<Container> {
    let container: Container

    if (containerConfig.type === 'binder') {
      container = {
        id: generateId(),
        name,
        type: 'binder',
        pageCount: containerConfig.pageCount,
        slotsPerPage: containerConfig.slotsPerPage,
        hasCoverImage: false
      }
    } else {
      container = {
        id: generateId(),
        name,
        type: 'box',
        hasCoverImage: false
      }
    }

    // Process and save cover image if provided
    if (coverImage) {
      try {
        // For boxes, use default 9 slots for image processing
        const slotsForImage = container.type === 'binder' ? container.slotsPerPage : 9
        const processedBlob = await processBinderImage(coverImage, slotsForImage)
        await saveBinderImage(container.id, processedBlob, slotsForImage)
        container.hasCoverImage = true
      } catch (error) {
        console.error('Failed to save cover image:', error)
      }
    }

    binders.value.push(container)
    saveToStorage(binders.value)
    return container
  }

  async function updateBinder(
    id: string,
    updates: Partial<Omit<Container, 'id' | 'type'>>,
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
            // For boxes, use default 9 slots for image processing
            const slotsForImage = updatedBinder.type === 'binder' ? updatedBinder.slotsPerPage : 9
            const processedBlob = await processBinderImage(coverImage, slotsForImage)
            await saveBinderImage(id, processedBlob, slotsForImage)
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
