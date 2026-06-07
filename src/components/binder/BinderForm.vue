<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import type { Binder, ContainerType } from '@/types'
import { getTargetDimensions, getBinderImage } from '@/utils/binderImages'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const props = defineProps<{
  binder?: Binder
}>()

const emit = defineEmits<{
  submit: [data:
    | { name: string; type: 'binder'; pageCount: number; slotsPerPage: number; coverImage?: File | null }
    | { name: string; type: 'box'; coverImage?: File | null }
  ]
  cancel: []
}>()

const name = ref(props.binder?.name ?? '')
const containerType = ref<ContainerType>(props.binder?.type ?? 'binder')
const pageCount = ref(props.binder?.type === 'binder' ? props.binder.pageCount : 40)
const slotsPerPage = ref(props.binder?.type === 'binder' ? props.binder.slotsPerPage : 9)
const coverImageFile = ref<File | null>(null)
const coverImagePreview = ref<string | null>(null)
const existingImageUrl = ref<string | null>(null)
const isLoadingImage = ref(false)
const shouldRemoveCoverImage = ref(false)

const targetDimensions = computed(() => {
  // For boxes, use 9 slots as default for image dimensions
  const slots = containerType.value === 'binder' ? slotsPerPage.value : 9
  return getTargetDimensions(slots)
})

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
  containerType.value = newBinder?.type ?? 'binder'
  if (newBinder?.type === 'binder') {
    pageCount.value = newBinder.pageCount
    slotsPerPage.value = newBinder.slotsPerPage
  } else {
    pageCount.value = 40
    slotsPerPage.value = 9
  }
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

  if (containerType.value === 'binder') {
    emit('submit', {
      name: name.value.trim(),
      type: 'binder' as const,
      pageCount: pageCount.value,
      slotsPerPage: slotsPerPage.value,
      coverImage: shouldRemoveCoverImage.value ? null : (coverImageFile.value ?? undefined)
    })
  } else {
    emit('submit', {
      name: name.value.trim(),
      type: 'box' as const,
      coverImage: shouldRemoveCoverImage.value ? null : (coverImageFile.value ?? undefined)
    })
  }
}

const selectClass =
  'h-11 w-full rounded-md border border-input bg-surface-2 px-3 text-base text-foreground outline-none focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-(--accent-glow)'
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="handleSubmit">
    <div class="flex flex-col gap-1.5">
      <label for="name" class="text-sm font-medium text-ink-soft">Name</label>
      <Input id="name" v-model="name" placeholder="My binder or box" required />
    </div>

    <div class="flex flex-col gap-1.5">
      <label for="containerType" class="text-sm font-medium text-ink-soft">Storage type</label>
      <select id="containerType" v-model="containerType" :class="selectClass">
        <option value="binder">Binder (pages &amp; slots)</option>
        <option value="box">Storage box (unlimited)</option>
      </select>
    </div>

    <div v-if="containerType === 'binder'" class="flex gap-4">
      <div class="flex flex-1 flex-col gap-1.5">
        <label for="pageCount" class="text-sm font-medium text-ink-soft">Pages</label>
        <input id="pageCount" v-model.number="pageCount" type="number" inputmode="numeric" min="1" max="100" :class="selectClass" />
      </div>
      <div class="flex flex-1 flex-col gap-1.5">
        <label for="slotsPerPage" class="text-sm font-medium text-ink-soft">Slots per page</label>
        <select id="slotsPerPage" v-model.number="slotsPerPage" :class="selectClass">
          <option :value="9">9 (3×3)</option>
          <option :value="12">12 (4×3)</option>
        </select>
      </div>
    </div>

    <p v-if="containerType === 'binder'" class="text-sm text-ink-soft tabular-nums">
      Capacity: {{ pageCount * slotsPerPage }} cards
    </p>
    <p v-else class="text-sm italic text-ink-soft">
      Storage boxes have unlimited capacity for flexible card organization.
    </p>

    <div class="flex flex-col gap-1.5">
      <label for="coverImage" class="text-sm font-medium text-ink-soft">Cover image (optional)</label>
      <p class="text-xs text-ink-faint">
        Recommended: {{ targetDimensions.width }}×{{ targetDimensions.height }}px
        ({{ slotsPerPage === 9 ? '3×3' : '4×3' }} layout)
      </p>

      <div v-if="coverImagePreview || existingImageUrl || isLoadingImage" class="mb-1 flex flex-col gap-2">
        <div
          class="flex w-full max-w-100 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-line bg-surface-2"
          :style="{ aspectRatio: `${targetDimensions.width}/${targetDimensions.height}` }"
        >
          <img v-if="coverImagePreview" :src="coverImagePreview" alt="Cover preview" class="h-full w-full object-cover" />
          <img v-else-if="existingImageUrl" :src="existingImageUrl" alt="Current cover" class="h-full w-full object-cover" />
          <div v-else-if="isLoadingImage" class="text-sm text-ink-faint">Loading…</div>
        </div>
        <Button type="button" variant="ghost" size="sm" class="self-start text-skipped" @click="removeCoverImage">Remove image</Button>
      </div>

      <input
        id="coverImage"
        type="file"
        accept="image/*"
        class="rounded-md border border-input bg-surface-2 p-2 text-sm text-ink-soft outline-none file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary-foreground hover:file:brightness-110"
        @change="handleImageSelected"
      />
    </div>

    <div class="flex justify-end gap-2">
      <Button type="button" variant="ghost" @click="$emit('cancel')">Cancel</Button>
      <Button type="submit">{{ binder ? 'Update' : 'Add' }} storage</Button>
    </div>
  </form>
</template>
