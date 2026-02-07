<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import type { Binder } from '@/types'
import { getTargetDimensions, getBinderImage } from '@/utils/binderImages'

const props = defineProps<{
  binder?: Binder
}>()

const emit = defineEmits<{
  submit: [data: { name: string; pageCount: number; slotsPerPage: number; coverImage?: File | null }]
  cancel: []
}>()

const name = ref(props.binder?.name ?? '')
const pageCount = ref(props.binder?.pageCount ?? 40)
const slotsPerPage = ref(props.binder?.slotsPerPage ?? 9)
const coverImageFile = ref<File | null>(null)
const coverImagePreview = ref<string | null>(null)
const existingImageUrl = ref<string | null>(null)
const isLoadingImage = ref(false)
const shouldRemoveCoverImage = ref(false)

const targetDimensions = computed(() => getTargetDimensions(slotsPerPage.value))

async function loadExistingImage() {
  // Clean up previous URL
  if (existingImageUrl.value) {
    URL.revokeObjectURL(existingImageUrl.value)
    existingImageUrl.value = null
  }

  if (props.binder?.hasCoverImage && props.binder.id) {
    isLoadingImage.value = true
    try {
      const url = await getBinderImage(props.binder.id)
      existingImageUrl.value = url
    } catch (error) {
      console.error('Failed to load existing cover image:', error)
    } finally {
      isLoadingImage.value = false
    }
  }
}

watch(() => props.binder, async (newBinder) => {
  name.value = newBinder?.name ?? ''
  pageCount.value = newBinder?.pageCount ?? 40
  slotsPerPage.value = newBinder?.slotsPerPage ?? 9
  coverImageFile.value = null
  coverImagePreview.value = null
  shouldRemoveCoverImage.value = false
  await loadExistingImage()
})

onMounted(() => {
  loadExistingImage()
})

onUnmounted(() => {
  if (existingImageUrl.value) {
    URL.revokeObjectURL(existingImageUrl.value)
  }
})

// Clear preview when slots per page changes
watch(slotsPerPage, () => {
  if (coverImageFile.value) {
    // Regenerate preview with new dimensions
    handleImageSelected({ target: { files: [coverImageFile.value] } } as any)
  }
})

function handleImageSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (file) {
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    coverImageFile.value = file
    shouldRemoveCoverImage.value = false

    // Create preview
    const reader = new FileReader()
    reader.onload = (e) => {
      coverImagePreview.value = e.target?.result as string
    }
    reader.readAsDataURL(file)
  }
}

function removeCoverImage() {
  coverImageFile.value = null
  coverImagePreview.value = null
  shouldRemoveCoverImage.value = true

  // Clean up existing image URL
  if (existingImageUrl.value) {
    URL.revokeObjectURL(existingImageUrl.value)
    existingImageUrl.value = null
  }

  // Clear file input
  const input = document.getElementById('coverImage') as HTMLInputElement
  if (input) {
    input.value = ''
  }
}

function handleSubmit() {
  if (!name.value.trim()) return
  emit('submit', {
    name: name.value.trim(),
    pageCount: pageCount.value,
    slotsPerPage: slotsPerPage.value,
    coverImage: shouldRemoveCoverImage.value ? null : (coverImageFile.value ?? undefined)
  })
}
</script>

<template>
  <form @submit.prevent="handleSubmit" class="binder-form">
    <div class="form-group">
      <label for="name">Binder Name</label>
      <input id="name" v-model="name" type="text" placeholder="My Binder" required />
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="pageCount">Pages</label>
        <input id="pageCount" v-model.number="pageCount" type="number" min="1" max="100" />
      </div>

      <div class="form-group">
        <label for="slotsPerPage">Slots per Page</label>
        <select id="slotsPerPage" v-model.number="slotsPerPage">
          <option :value="9">9 (3×3)</option>
          <option :value="12">12 (4×3)</option>
        </select>
      </div>
    </div>

    <div class="form-info">
      Capacity: {{ pageCount * slotsPerPage }} cards
    </div>

    <div class="form-group">
      <label for="coverImage">Cover Image (optional)</label>
      <p class="form-hint">
        Recommended: {{ targetDimensions.width }}×{{ targetDimensions.height }}px
        ({{ slotsPerPage === 9 ? '3×3' : '4×3' }} layout)
      </p>

      <div v-if="coverImagePreview || existingImageUrl || isLoadingImage" class="image-preview-container">
        <div class="image-preview" :style="{ aspectRatio: `${targetDimensions.width}/${targetDimensions.height}` }">
          <img v-if="coverImagePreview" :src="coverImagePreview" alt="Cover preview" />
          <img v-else-if="existingImageUrl" :src="existingImageUrl" alt="Current cover" />
          <div v-else-if="isLoadingImage" class="loading-placeholder">
            Loading...
          </div>
        </div>
        <button type="button" @click="removeCoverImage" class="btn-remove-image">
          Remove Image
        </button>
      </div>

      <input
        id="coverImage"
        type="file"
        accept="image/*"
        @change="handleImageSelected"
        class="file-input"
      />
    </div>

    <div class="form-actions">
      <button type="button" @click="$emit('cancel')" class="btn btn-secondary">Cancel</button>
      <button type="submit" class="btn btn-primary">{{ binder ? 'Update' : 'Add' }} Binder</button>
    </div>
  </form>
</template>

<style scoped>
.binder-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.form-group label {
  font-weight: 500;
  font-size: 0.875rem;
}

.form-group input,
.form-group select {
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 1rem;
}

.form-row {
  display: flex;
  gap: 1rem;
}

.form-row .form-group {
  flex: 1;
}

.form-info {
  color: #666;
  font-size: 0.875rem;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
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

.form-hint {
  font-size: 0.75rem;
  color: #888;
  margin: 0.25rem 0 0.5rem 0;
}

.image-preview-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.image-preview {
  width: 100%;
  max-width: 400px;
  border: 2px dashed #ddd;
  border-radius: 8px;
  overflow: hidden;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.existing-image-placeholder {
  padding: 2rem;
  text-align: center;
  color: #666;
  font-size: 0.875rem;
}

.loading-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #999;
  font-size: 0.875rem;
  background: #f9f9f9;
}

.btn-remove-image {
  align-self: flex-start;
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.btn-remove-image:hover {
  background: #c82333;
}

.file-input {
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.875rem;
  cursor: pointer;
}

.file-input::-webkit-file-upload-button {
  padding: 0.5rem 1rem;
  background: #4a90d9;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  margin-right: 0.5rem;
}

.file-input::-webkit-file-upload-button:hover {
  background: #3a7bc8;
}
</style>
