<script setup lang="ts">
import { computed } from 'vue'
import type { CardPlacement } from '@/types/placement'
import { useCollectionStore } from '@/stores/collection'
import { getPlacementOwnershipKey } from '@/types/placement'

interface Props {
  placements: CardPlacement[]
  zoom: number
}

const props = defineProps<Props>()
const collectionStore = useCollectionStore()

const zoomScale = computed(() => props.zoom / 100)

const gridColumnWidth = computed(() => {
  // Base width for a card slot (in pixels) at 100% zoom
  // Using aspect ratio 5:7 with base width of 180px
  const baseWidth = 180
  return `${baseWidth * zoomScale.value}px`
})

function toggleOwned(placement: CardPlacement) {
  const key = getPlacementOwnershipKey(placement)
  collectionStore.toggleOwned(key)
}

function isOwned(placement: CardPlacement): boolean {
  const key = getPlacementOwnershipKey(placement)
  return collectionStore.isOwned(key)
}

function isSkipped(placement: CardPlacement): boolean {
  const key = getPlacementOwnershipKey(placement)
  return collectionStore.isSkipped(key)
}
</script>

<template>
  <div class="box-card-container">
    <div class="box-card-grid" :style="{ '--grid-column-width': gridColumnWidth }">
      <div
        v-for="placement in placements"
        :key="`${placement.segmentId}:${placement.cardIndexInSegment}`"
        class="card-slot"
        @click="toggleOwned(placement)"
        :title="placement.card.name"
      >
        <img
          :src="placement.card.image_uris?.normal || placement.card.image_uris?.large"
          :alt="placement.card.name"
          class="card-image"
        />
        <div v-if="isOwned(placement)" class="owned-badge">✓</div>
        <div v-if="isSkipped(placement)" class="skipped-badge">⊘</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.box-card-container {
  height: calc(100vh - 14rem);
  overflow: auto;
}

.box-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, var(--grid-column-width, 180px));
  gap: 1rem;
  padding: 2rem;
  justify-content: center;
}

.card-slot {
  position: relative;
  width: 100%;
  aspect-ratio: 5 / 7;
  cursor: pointer;
  border-radius: 8px;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.card-slot:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.card-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 8px;
}

.owned-badge,
.skipped-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: bold;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.owned-badge {
  background-color: #28a745;
  color: white;
}

.skipped-badge {
  background-color: #dc3545;
  color: white;
}
</style>
