<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import type { Binder } from '@/types'
import { getBinderImage } from '@/utils/binderImages'

const props = withDefaults(defineProps<{
  binder: Binder
  plannedCards?: number
  ownedCards?: number
  selected?: boolean
  showActions?: boolean
}>(), {
  showActions: true
})

defineEmits<{
  edit: [binder: Binder]
  remove: [binder: Binder]
}>()

const capacity = computed(() => props.binder.pageCount * props.binder.slotsPerPage)

const fillStatus = computed(() => {
  if (props.plannedCards === undefined) return null
  if (props.plannedCards > capacity.value) return 'overflow'
  if (props.plannedCards === capacity.value) return 'full'
  return 'partial'
})

const ownedPercentage = computed(() => {
  if (props.plannedCards === undefined || props.plannedCards === 0) return 0
  return Math.round(((props.ownedCards ?? 0) / props.plannedCards) * 100)
})

// Cover image handling
const coverImageUrl = ref<string | null>(null)

async function loadCoverImage() {
  if (props.binder.hasCoverImage) {
    try {
      const url = await getBinderImage(props.binder.id)
      coverImageUrl.value = url
    } catch (error) {
      console.error('Failed to load binder cover image:', error)
    }
  }
}

watch(() => props.binder.hasCoverImage, () => {
  if (props.binder.hasCoverImage) {
    loadCoverImage()
  } else {
    if (coverImageUrl.value) {
      URL.revokeObjectURL(coverImageUrl.value)
    }
    coverImageUrl.value = null
  }
}, { immediate: true })

onMounted(() => {
  loadCoverImage()
})

onUnmounted(() => {
  if (coverImageUrl.value) {
    URL.revokeObjectURL(coverImageUrl.value)
  }
})
</script>

<template>
  <div class="binder-card" :class="[fillStatus, { selected, 'has-cover': coverImageUrl }]">
    <div v-if="coverImageUrl" class="binder-cover-thumbnail">
      <img :src="coverImageUrl" :alt="`${binder.name} cover`" />
    </div>
    <div class="binder-info">
      <h3 class="binder-title">{{ binder.name }}</h3>
      <p class="binder-stats">
        <template v-if="plannedCards !== undefined">
          <span class="planned-count" :class="fillStatus">{{ plannedCards }}</span> / {{ capacity }} cards
        </template>
        <template v-else>
          {{ capacity }} cards
        </template>
      </p>
      <p v-if="plannedCards !== undefined && plannedCards > 0" class="binder-owned">
        <span class="owned-count" :class="{ complete: ownedPercentage === 100 }">{{ ownedCards ?? 0 }}</span> / {{ plannedCards }} owned
      </p>
    </div>
    <div v-if="showActions" class="binder-actions">
      <button @click.stop="$emit('edit', binder)" class="btn-icon" title="Edit">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button @click.stop="$emit('remove', binder)" class="btn-icon btn-icon-danger" title="Remove">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          <line x1="10" y1="11" x2="10" y2="17"/>
          <line x1="14" y1="11" x2="14" y2="17"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.binder-card {
  position: relative;
  display: flex;
  gap: 1rem;
  padding: 1rem;
  padding-right: 4rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}

.binder-cover-thumbnail {
  flex-shrink: 0;
  width: 60px;
  height: 84px;
  border-radius: 4px;
  overflow: hidden;
  background: #f0f0f0;
  border: 1px solid #ddd;
}

.binder-cover-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.binder-card:hover {
  border-color: #4a90d9;
}

.binder-card.selected {
  border-color: #4a90d9;
  background: #f0f7ff;
  box-shadow: 0 0 0 1px #4a90d9;
}

.binder-title {
  margin: 0 0 0.25rem 0;
  font-size: 1rem;
}

.binder-format {
  margin: 0 0 0.5rem 0;
  font-size: 0.75rem;
  color: #888;
  font-weight: normal;
}

.binder-stats {
  margin: 0;
  color: #666;
  font-size: 0.875rem;
}

.binder-owned {
  margin: 0.25rem 0 0 0;
  color: #888;
  font-size: 0.75rem;
}

.owned-count {
  font-weight: 500;
}

.owned-count.complete {
  color: #28a745;
}

.owned-percentage {
  color: #999;
}

.owned-percentage.complete {
  color: #28a745;
}

.planned-count {
  font-weight: 600;
}

.planned-count.partial {
  color: #333;
}

.planned-count.full {
  color: #28a745;
}

.planned-count.overflow {
  color: #dc3545;
}

.binder-actions {
  position: absolute;
  top: 1rem;
  right: 1rem;
  display: flex;
  gap: 0.25rem;
}

.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #f5f5f5;
  color: #666;
  cursor: pointer;
}

.btn-icon:hover {
  background: #e5e5e5;
  color: #333;
}

.btn-icon-danger {
  color: #c00;
  border-color: #c00;
}

.btn-icon-danger:hover {
  background: #fee;
  color: #a00;
}
</style>
