<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import type { ScryfallCard, ScryfallSet } from '@/types'
import { fetchSetCards, getCardImageUri, sortByCollectorNumber } from '@/api/scryfall'

const props = defineProps<{
  set: ScryfallSet
  initialSelection?: string[]
}>()

const emit = defineEmits<{
  confirm: [cardIds: string[]]
  cancel: []
}>()

const cards = ref<ScryfallCard[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const selectedIds = ref<Set<string>>(new Set(props.initialSelection ?? []))
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
  selectedIds.value = new Set(cards.value.map(c => c.id))
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
  <div class="card-picker">
    <div class="picker-header">
      <h3>{{ set.name }}</h3>
      <div class="picker-actions">
        <button @click="selectAll" class="btn-small">Select All</button>
        <button @click="selectNone" class="btn-small">Select None</button>
        <span class="selection-count">{{ selectedIds.size }} selected</span>
      </div>
    </div>

    <input
      v-model="searchQuery"
      type="text"
      placeholder="Search cards..."
      class="search-input"
    />

    <div v-if="loading" class="loading">Loading cards...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else class="card-grid">
      <button
        v-for="card in filteredCards"
        :key="card.id"
        @click="toggleCard(card.id)"
        class="card-item"
        :class="{ selected: selectedIds.has(card.id) }"
      >
        <img
          :src="getCardImageUri(card, 'normal') ?? ''"
          :alt="card.name"
          class="card-image"
        />
        <div class="card-number">#{{ card.collector_number }}</div>
      </button>
    </div>

    <div class="picker-footer">
      <button @click="$emit('cancel')" class="btn btn-secondary">Cancel</button>
      <button @click="confirm" class="btn btn-primary" :disabled="selectedIds.size === 0">
        Add {{ selectedIds.size }} Cards
      </button>
    </div>
  </div>
</template>

<style scoped>
.card-picker {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
}

.picker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.picker-header h3 {
  margin: 0;
}

.picker-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.selection-count {
  color: #666;
  font-size: 0.875rem;
}

.search-input {
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 1rem;
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
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 0.5rem;
  overflow-y: auto;
  max-height: calc(100vh - 250px);
  padding: 0.5rem;
}

.card-item {
  border: 2px solid transparent;
  border-radius: 4px;
  padding: 0;
  background: none;
  cursor: pointer;
  position: relative;
}

.card-item.selected {
  border-color: #4a90d9;
}

.card-image {
  width: 100%;
  border-radius: 4px;
  display: block;
}

.card-number {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  font-size: 0.625rem;
  padding: 2px 4px;
  border-radius: 2px;
}

.picker-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding-top: 1rem;
  border-top: 1px solid #eee;
}

.btn-small {
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #f5f5f5;
  cursor: pointer;
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
}

.btn-primary {
  background: #4a90d9;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #3a7bc8;
}

.btn-primary:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.btn-secondary {
  background: #e5e5e5;
  color: #333;
}

.btn-secondary:hover {
  background: #d5d5d5;
}
</style>
