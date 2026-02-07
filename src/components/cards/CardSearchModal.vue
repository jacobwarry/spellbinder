<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import type { ScryfallCard } from '@/types'
import { searchCards, getCardImageUri } from '@/api/scryfall'

const props = defineProps<{
  setCode: string
  segmentName: string
}>()

const emit = defineEmits<{
  select: [card: ScryfallCard]
  cancel: []
}>()

const searchQuery = ref('')
const searchResults = ref<ScryfallCard[]>([])
const isSearching = ref(false)
const searchError = ref<string | null>(null)
const searchTimeout = ref<number | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)

onMounted(() => {
  searchInput.value?.focus()
})

watch(searchQuery, (query) => {
  // Clear previous timeout
  if (searchTimeout.value) {
    clearTimeout(searchTimeout.value)
  }

  // Reset state
  searchError.value = null

  if (!query.trim()) {
    searchResults.value = []
    return
  }

  // Debounce search
  searchTimeout.value = window.setTimeout(async () => {
    isSearching.value = true
    try {
      // Filter by set code
      const setFilter = props.setCode ? `set:${props.setCode} ` : ''
      searchResults.value = await searchCards(setFilter + query)
    } catch (e) {
      searchError.value = 'Search failed. Please try again.'
      searchResults.value = []
    } finally {
      isSearching.value = false
    }
  }, 300)
})

function selectCard(card: ScryfallCard) {
  emit('select', card)
}

function cancel() {
  emit('cancel')
}
</script>

<template>
  <div class="modal-overlay" @click.self="cancel">
    <div class="modal-content">
      <div class="modal-header">
        <h2>Insert Card</h2>
        <p class="slot-info">
          {{ segmentName }} ({{ setCode.toUpperCase() }})
        </p>
        <button class="close-btn" @click="cancel" title="Close">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="search-box">
        <input
          ref="searchInput"
          v-model="searchQuery"
          type="text"
          :placeholder="`Search in ${setCode.toUpperCase()}...`"
          class="search-input"
        />
        <span v-if="isSearching" class="search-spinner">Searching...</span>
      </div>

      <div v-if="searchError" class="search-error">
        {{ searchError }}
      </div>

      <div v-if="searchResults.length > 0" class="results-grid">
        <button
          v-for="card in searchResults"
          :key="card.id"
          type="button"
          class="card-result"
          @click="selectCard(card)"
          :title="`${card.name} (${card.set.toUpperCase()}) #${card.collector_number}`"
        >
          <img
            :src="getCardImageUri(card, 'small') ?? ''"
            :alt="card.name"
            class="card-image"
          />
          <div class="card-info">
            <span class="card-name">{{ card.name }}</span>
            <span class="card-set">{{ card.set.toUpperCase() }} #{{ card.collector_number }}</span>
          </div>
        </button>
      </div>

      <div v-else-if="searchQuery && !isSearching" class="no-results">
        No cards found for "{{ searchQuery }}"
      </div>

      <div v-else class="search-hint">
        Type a card name to search
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border-bottom: 1px solid #eee;
}

.modal-header h2 {
  margin: 0;
  flex: 1;
}

.slot-info {
  margin: 0;
  color: #666;
  font-size: 0.875rem;
}

.close-btn {
  padding: 0.25rem;
  border: none;
  background: none;
  cursor: pointer;
  color: #666;
  border-radius: 4px;
}

.close-btn:hover {
  background: #f0f0f0;
  color: #333;
}

.search-box {
  padding: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.search-input {
  flex: 1;
  padding: 0.75rem;
  font-size: 1rem;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.search-input:focus {
  outline: none;
  border-color: #4a90d9;
  box-shadow: 0 0 0 2px rgba(74, 144, 217, 0.2);
}

.search-spinner {
  color: #666;
  font-size: 0.875rem;
}

.search-error {
  padding: 0 1rem 1rem;
  color: #dc3545;
  font-size: 0.875rem;
}

.results-grid {
  flex: 1;
  overflow-y: auto;
  padding: 0 1rem 1rem;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 0.75rem;
}

.card-result {
  display: flex;
  flex-direction: column;
  cursor: pointer;
  border-radius: 4px;
  overflow: hidden;
  border: 2px solid transparent;
  transition: border-color 0.15s, transform 0.15s;
  padding: 0;
  background: none;
  text-align: left;
  font: inherit;
}

.card-result:hover {
  border-color: #4a90d9;
  transform: translateY(-2px);
}

.card-image {
  width: 100%;
  aspect-ratio: 63/88;
  object-fit: cover;
  background: #f0f0f0;
}

.card-info {
  padding: 0.5rem;
  background: #f8f8f8;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.card-name {
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-set {
  font-size: 0.625rem;
  color: #666;
}

.no-results,
.search-hint {
  padding: 2rem;
  text-align: center;
  color: #666;
}
</style>
