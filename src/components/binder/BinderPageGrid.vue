<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { CardPlacement, ScryfallCard } from '@/types'
import { getPlacementOwnershipKey } from '@/types/placement'
import { getCardImageUri } from '@/api/scryfall'
import { useCollectionStore } from '@/stores'

const props = defineProps<{
  placements: CardPlacement[]
  slotsPerPage: number
  pageNumber: number
  getSpacerCount: (segmentId: string, cardIndex: number) => number
}>()

const emit = defineEmits<{
  removeCard: [segmentId: string, cardIndex: number]
  addSpacer: [segmentId: string, cardIndex: number]
  removeSpacer: [segmentId: string, cardIndex: number]
  insertCard: [pageNumber: number, slotOnPage: number]
}>()

const collectionStore = useCollectionStore()

const openMenuKey = ref<string | null>(null)

function getPlacementKey(placement: CardPlacement): string {
  return `${placement.card.id}-${placement.slotOnPage}`
}

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

function toggleMenu(placement: CardPlacement, event: Event) {
  event.stopPropagation()
  const key = getPlacementKey(placement)
  openMenuKey.value = openMenuKey.value === key ? null : key
}

function closeMenu() {
  openMenuKey.value = null
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.card-menu')) {
    closeMenu()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

// Menu actions
function menuToggleOwned(placement: CardPlacement) {
  const key = getPlacementOwnershipKey(placement)
  collectionStore.toggleOwned(key)
  closeMenu()
}

function menuToggleSkipped(placement: CardPlacement) {
  const key = getPlacementOwnershipKey(placement)
  collectionStore.toggleSkipped(key)
  closeMenu()
}

function menuOpenScryfall(card: ScryfallCard) {
  const url = `https://scryfall.com/card/${card.set}/${card.collector_number}`
  window.open(url, '_blank')
  closeMenu()
}

function menuRemoveCard(segmentId: string, cardIndex: number) {
  emit('removeCard', segmentId, cardIndex)
  closeMenu()
}

function menuAddSpacer(segmentId: string, cardIndex: number) {
  emit('addSpacer', segmentId, cardIndex)
  closeMenu()
}

function menuRemoveSpacer(segmentId: string, cardIndex: number) {
  emit('removeSpacer', segmentId, cardIndex)
  closeMenu()
}

function handleEmptySlotClick(slot: number) {
  emit('insertCard', props.pageNumber, slot)
}

const pagePlacementKeys = computed(() => props.placements.map(p => getPlacementOwnershipKey(p)))

const allOwned = computed(() =>
  pagePlacementKeys.value.length > 0 && pagePlacementKeys.value.every(key => collectionStore.isOwned(key))
)

function selectAllOnPage() {
  collectionStore.setMultipleOwned(pagePlacementKeys.value, true)
}

function selectNoneOnPage() {
  collectionStore.setMultipleOwned(pagePlacementKeys.value, false)
}

function formatRarity(rarity: string): string {
  return rarity.charAt(0).toUpperCase()
}

function formatCollectorNumber(num: string): string {
  return num.padStart(4, '0')
}
</script>

<template>
  <div class="page-container">
    <div class="page-actions">
      <button v-if="!allOwned" @click="selectAllOnPage" class="btn-page-action">
        Mark all owned
      </button>
      <button v-else @click="selectNoneOnPage" class="btn-page-action">
        Mark all unowned
      </button>
    </div>
    <div class="page-grid" :class="{ 'grid-9': slotsPerPage === 9, 'grid-12': slotsPerPage === 12 }">
    <div
      v-for="slot in slotsPerPage"
      :key="slot"
      class="card-slot"
    >
      <template v-for="placement in placements" :key="`${placement.card.id}-${placement.slotOnPage}`">
        <div
          v-if="placement.slotOnPage === slot"
          class="card-wrapper"
          :class="{
            owned: isOwned(placement),
            skipped: isSkipped(placement)
          }"
          @click="toggleOwned(placement)"
          :title="`${placement.card.name} (#${placement.card.collector_number}) - Click to toggle owned`"
        >
          <img
            :src="getCardImageUri(placement.card, 'normal') ?? ''"
            :alt="placement.card.name"
            class="card-image"
          />
          <div class="card-info-strip">
            {{ placement.card.set.toUpperCase() }} {{ formatRarity(placement.card.rarity) }} {{ formatCollectorNumber(placement.card.collector_number) }}
          </div>
          <div v-if="isOwned(placement)" class="owned-indicator">
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div v-if="isSkipped(placement)" class="skipped-indicator">
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </div>
          <div class="card-menu">
            <button
              class="menu-btn"
              @click="toggleMenu(placement, $event)"
              title="Card options"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="2"/>
                <circle cx="12" cy="12" r="2"/>
                <circle cx="12" cy="19" r="2"/>
              </svg>
            </button>
            <div v-if="openMenuKey === getPlacementKey(placement)" class="menu-dropdown" @click.stop>
              <button @click="menuToggleOwned(placement)">
                {{ isOwned(placement) ? 'Mark unowned' : 'Mark owned' }}
              </button>
              <button @click="menuToggleSkipped(placement)">
                {{ isSkipped(placement) ? 'Unskip card' : 'Skip card' }}
              </button>
              <div class="spacer-controls">
                <span class="spacer-label">Blanks before: {{ getSpacerCount(placement.segmentId, placement.cardIndexInSegment) }}</span>
                <div class="spacer-buttons">
                  <button @click="menuAddSpacer(placement.segmentId, placement.cardIndexInSegment)">+</button>
                  <button
                    @click="menuRemoveSpacer(placement.segmentId, placement.cardIndexInSegment)"
                    :disabled="getSpacerCount(placement.segmentId, placement.cardIndexInSegment) === 0"
                  >-</button>
                </div>
              </div>
              <hr />
              <button @click="menuOpenScryfall(placement.card)">Open on Scryfall</button>
              <hr />
              <button class="menu-danger" @click="menuRemoveCard(placement.segmentId, placement.cardIndexInSegment)">Remove from segment</button>
            </div>
          </div>
        </div>
      </template>
      <div
        v-if="!placements.some(p => p.slotOnPage === slot)"
        class="empty-slot"
        @click="handleEmptySlotClick(slot)"
        title="Click to insert a card"
      >
        <span class="slot-number">{{ slot }}</span>
        <span class="insert-hint">+</span>
      </div>
    </div>
    </div>
  </div>
</template>

<style scoped>
.page-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.page-actions {
  display: flex;
  justify-content: flex-end;
}

.btn-page-action {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #f5f5f5;
  cursor: pointer;
}

.btn-page-action:hover {
  background: #e5e5e5;
}

.page-grid {
  display: grid;
  gap: 4px;
  padding: 8px;
  background: #f0f0f0;
  border-radius: 4px;
}

.grid-9 {
  grid-template-columns: repeat(3, 1fr);
}

.grid-12 {
  grid-template-columns: repeat(3, 1fr);
}

.card-slot {
  aspect-ratio: 63/95;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.card-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  cursor: pointer;
  display: flex;
  flex-direction: column;
}

.card-wrapper:not(.owned) .card-image {
  filter: grayscale(100%);
  opacity: 0.5;
}

.card-wrapper:hover .card-image {
  transform: scale(1.02);
}

.card-image {
  width: 100%;
  flex: 1;
  object-fit: cover;
  min-height: 0;
}

.owned-indicator {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  background: #28a745;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.card-info-strip {
  background: #000;
  color: #fff;
  font-size: 0.5rem;
  font-family: monospace;
  text-align: center;
  padding: 1px 2px;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}

.empty-slot {
  color: #ccc;
  font-size: 0.75rem;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  transition: background-color 0.15s, color 0.15s;
}

.empty-slot:hover {
  background: #e8f4ff;
  color: #4a90d9;
}

.slot-number {
  font-size: 0.75rem;
}

.insert-hint {
  font-size: 1.25rem;
  font-weight: bold;
  opacity: 0;
  transition: opacity 0.15s;
}

.empty-slot:hover .insert-hint {
  opacity: 1;
}

.card-wrapper.skipped .card-image {
  filter: grayscale(100%) sepia(100%) hue-rotate(-50deg) saturate(200%);
  opacity: 0.4;
}

.skipped-indicator {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  background: #dc3545;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.card-menu {
  position: absolute;
  top: 3px;
  right: 3px;
  z-index: 10;
}

.menu-btn {
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
}

.card-wrapper:hover .menu-btn {
  opacity: 1;
}

.menu-btn:hover {
  background: rgba(0, 0, 0, 0.8);
}

.menu-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 2px;
  min-width: 140px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.menu-dropdown button {
  display: block;
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: none;
  background: none;
  text-align: left;
  font-size: 0.75rem;
  cursor: pointer;
  white-space: nowrap;
}

.menu-dropdown button:hover {
  background: #f5f5f5;
}

.menu-dropdown button.menu-danger {
  color: #dc3545;
}

.menu-dropdown button.menu-danger:hover {
  background: #fee;
}

.menu-dropdown hr {
  margin: 0;
  border: none;
  border-top: 1px solid #eee;
}

.spacer-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  gap: 0.5rem;
}

.spacer-label {
  font-size: 0.75rem;
}

.spacer-buttons {
  display: flex;
  gap: 0.25rem;
}

.spacer-buttons button {
  width: 24px;
  height: 24px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  font-weight: bold;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #f5f5f5;
  cursor: pointer;
}

.spacer-buttons button:hover:not(:disabled) {
  background: #e5e5e5;
}

.spacer-buttons button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
</style>
