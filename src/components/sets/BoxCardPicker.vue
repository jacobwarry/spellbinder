<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import type { ScryfallCard, ScryfallSet } from '@/types'
import { fetchSetCards, sortByCollectorNumber } from '@/api/scryfall'

const props = defineProps<{
  set: ScryfallSet
}>()

const emit = defineEmits<{
  confirm: [cardIds: string[]]
  cancel: []
}>()

const cards = ref<ScryfallCard[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const selectedIds = ref<Set<string>>(new Set())
const searchQuery = ref('')

const filteredCards = computed(() => {
  const query = searchQuery.value.toLowerCase().trim()
  if (!query) return cards.value
  return cards.value.filter(c =>
    c.name.toLowerCase().includes(query) ||
    c.collector_number.toLowerCase().includes(query)
  )
})

onMounted(async () => {
  try {
    const rawCards = await fetchSetCards(props.set.code)
    cards.value = sortByCollectorNumber(rawCards)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load cards'
  } finally {
    loading.value = false
  }
})

function toggleCard(cardId: string) {
  if (selectedIds.value.has(cardId)) {
    selectedIds.value.delete(cardId)
  } else {
    selectedIds.value.add(cardId)
  }
  selectedIds.value = new Set(selectedIds.value)
}

function selectAll() {
  selectedIds.value = new Set(filteredCards.value.map(c => c.id))
}

function selectNone() {
  selectedIds.value = new Set()
}

function confirm() {
  const orderedIds = cards.value
    .filter(c => selectedIds.value.has(c.id))
    .map(c => c.id)
  emit('confirm', orderedIds)
}
</script>

<template>
  <div class="box-card-picker">
    <div class="picker-header">
      <div class="header-row">
        <h2>{{ set.name }}</h2>
        <div class="header-actions">
          <button @click="confirm" class="btn btn-primary" :disabled="selectedIds.size === 0">
            Add {{ selectedIds.size }} Selected Cards
          </button>
        </div>
      </div>
      <div class="controls-row">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search cards by name or number..."
          class="search-input"
        />
        <div class="picker-actions">
          <button @click="selectAll" class="btn-small">Select All</button>
          <button @click="selectNone" class="btn-small">Select None</button>
          <span class="selection-count">{{ selectedIds.size }} / {{ filteredCards.length }} selected</span>
        </div>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading cards...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else class="card-grid">
      <div
        v-for="card in filteredCards"
        :key="card.id"
        @click="toggleCard(card.id)"
        class="card-slot"
        :class="{ selected: selectedIds.has(card.id) }"
        :title="card.name"
      >
        <img
          :src="card.image_uris?.normal || card.image_uris?.large"
          :alt="card.name"
          class="card-image"
        />
        <div v-if="selectedIds.has(card.id)" class="selected-badge">✓</div>
        <div class="card-info">
          <div class="card-number">#{{ card.collector_number }}</div>
        </div>
      </div>
    </div>

    <div class="picker-footer">
      <button @click="$emit('cancel')" class="btn btn-secondary">Cancel</button>
      <button @click="confirm" class="btn btn-primary" :disabled="selectedIds.size === 0">
        Add {{ selectedIds.size }} Selected Cards
      </button>
    </div>
  </div>
</template>

<style scoped>
.box-card-picker {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 1rem;
  min-height: 0;
  overflow: hidden;
}

.picker-header {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-bottom: 1rem;
  border-bottom: 2px solid #eee;
  flex-shrink: 0;
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-row h2 {
  margin: 0;
  font-size: 1.5rem;
  color: #333;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
}

.controls-row {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.search-input {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 1rem;
}

.picker-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.selection-count {
  color: #666;
  font-size: 0.875rem;
  font-weight: 500;
  white-space: nowrap;
}

.loading,
.error {
  padding: 2rem;
  text-align: center;
  color: #666;
}

.error {
  color: #c00;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.75rem;
  padding: 0.5rem;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  justify-items: center;
}

.card-slot {
  position: relative;
  width: 100%;
  max-width: 280px;
  aspect-ratio: 5 / 7;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.15s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  border: 3px solid transparent;
  opacity: 0.8;
}

.card-slot:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.card-slot.selected {
  border-color: #4a90d9;
  box-shadow: 0 4px 16px rgba(74, 144, 217, 0.5);
  opacity: 1;
}

.card-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 5px;
}

.selected-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background-color: #4a90d9;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: bold;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.card-info {
  position: absolute;
  bottom: 8px;
  left: 8px;
  right: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-number {
  background: rgba(0, 0, 0, 0.8);
  color: white;
  font-size: 0.75rem;
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.picker-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding-top: 1rem;
  border-top: 1px solid #eee;
  flex-shrink: 0;
}

.btn-small {
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #f5f5f5;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-small:hover {
  background: #e5e5e5;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  transition: background 0.2s;
}

.btn-primary {
  background: #4a90d9;
  color: white;
  font-weight: 500;
}

.btn-primary:hover:not(:disabled) {
  background: #3a7bc8;
}

.btn-primary:disabled {
  background: #ccc;
  cursor: not-allowed;
  opacity: 0.6;
}

.btn-secondary {
  background: #e5e5e5;
  color: #333;
}

.btn-secondary:hover {
  background: #d5d5d5;
}
</style>
