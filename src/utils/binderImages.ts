const DB_NAME = 'spellbinder-cache'
const DB_VERSION = 2 // Increment version to add new store

interface BinderImageData {
  binderId: string
  imageBlob: Blob
  width: number
  height: number
  uploadedAt: number
}

// Get target dimensions based on binder layout
// MTG cards are 63mm × 88mm (~0.716 aspect ratio)
export function getTargetDimensions(slotsPerPage: number): { width: number; height: number } {
  const cardAspect = 63 / 88
  const targetHeight = 840 // Fixed height for consistency

  if (slotsPerPage === 9) {
    // 3×3 layout
    const targetWidth = Math.round(targetHeight * (3 * cardAspect) / 3)
    return { width: targetWidth, height: targetHeight }
  } else {
    // 4×3 layout (slotsPerPage === 12)
    const targetWidth = Math.round(targetHeight * (4 * cardAspect) / 3)
    return { width: targetWidth, height: targetHeight }
  }
}

// Open IndexedDB with version upgrade to add binderImages store
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // Create existing stores if they don't exist (for migration from v1)
      if (!db.objectStoreNames.contains('sets')) {
        db.createObjectStore('sets', { keyPath: 'code' })
      }
      if (!db.objectStoreNames.contains('cards')) {
        db.createObjectStore('cards', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('setCards')) {
        db.createObjectStore('setCards', { keyPath: 'setCode' })
      }

      // Create new binderImages store
      if (!db.objectStoreNames.contains('binderImages')) {
        db.createObjectStore('binderImages', { keyPath: 'binderId' })
      }
    }
  })
}

// Resize and compress image to target dimensions
export async function processBinderImage(
  file: File,
  slotsPerPage: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const reader = new FileReader()

    reader.onload = (e) => {
      img.src = e.target?.result as string
    }

    reader.onerror = () => reject(new Error('Failed to read file'))

    img.onload = () => {
      const { width, height } = getTargetDimensions(slotsPerPage)

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Failed to get canvas context'))
        return
      }

      // Calculate scaling to cover the target dimensions (crop if needed)
      const imgAspect = img.width / img.height
      const targetAspect = width / height

      let drawWidth = width
      let drawHeight = height
      let offsetX = 0
      let offsetY = 0

      if (imgAspect > targetAspect) {
        // Image is wider - crop sides
        drawWidth = height * imgAspect
        offsetX = (width - drawWidth) / 2
      } else {
        // Image is taller - crop top/bottom
        drawHeight = width / imgAspect
        offsetY = (height - drawHeight) / 2
      }

      ctx.fillStyle = '#f0f0f0'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight)

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Failed to create blob'))
          }
        },
        'image/jpeg',
        0.85 // Quality
      )
    }

    img.onerror = () => reject(new Error('Failed to load image'))

    reader.readAsDataURL(file)
  })
}

// Save binder image to IndexedDB
export async function saveBinderImage(
  binderId: string,
  imageBlob: Blob,
  slotsPerPage: number
): Promise<void> {
  const db = await openDatabase()
  const { width, height } = getTargetDimensions(slotsPerPage)

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('binderImages', 'readwrite')
    const store = transaction.objectStore('binderImages')

    const data: BinderImageData = {
      binderId,
      imageBlob,
      width,
      height,
      uploadedAt: Date.now()
    }

    store.put(data)

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

// Get binder image from IndexedDB
export async function getBinderImage(binderId: string): Promise<string | null> {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('binderImages', 'readonly')
    const store = transaction.objectStore('binderImages')
    const request = store.get(binderId)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const data = request.result as BinderImageData | undefined
      if (data?.imageBlob) {
        // Convert Blob to Object URL
        const url = URL.createObjectURL(data.imageBlob)
        resolve(url)
      } else {
        resolve(null)
      }
    }
  })
}

// Delete binder image from IndexedDB
export async function deleteBinderImage(binderId: string): Promise<void> {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('binderImages', 'readwrite')
    const store = transaction.objectStore('binderImages')
    store.delete(binderId)

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}
