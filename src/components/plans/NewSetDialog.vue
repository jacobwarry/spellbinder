<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useBindersStore, useSegmentsStore } from '@/stores'
import { fetchSets, fetchSetCards } from '@/api/scryfall'
import type { ScryfallSet, ContainerType } from '@/types'

const emit = defineEmits<{
  submit: [data: { name: string; binderId?: string; segmentId?: string }]
  cancel: []
}>()

const bindersStore = useBindersStore()
const segmentsStore = useSegmentsStore()

const setName = ref('')
const shouldCreateBinder = ref(false)
const binderName = ref('')
const binderContainerType = ref<ContainerType>('binder')
const binderPageCount = ref(40)
const binderSlotsPerPage = ref(9)
const shouldAddSegment = ref(false)
const selectedSet = ref<ScryfallSet | null>(null)
const isSubmitting = ref(false)

// Set search state
const allSets = ref<ScryfallSet[]>([])
const setsLoading = ref(true)
const setsError = ref<string | null>(null)
const setSearchQuery = ref('')

const isValid = computed(() => {
  if (!setName.value.trim()) return false
  if (shouldCreateBinder.value && !binderName.value.trim()) return false
  return true
})

const filteredSets = computed(() => {
  const query = setSearchQuery.value.toLowerCase().trim()
  if (!query) {
    return allSets.value
  }
  return allSets.value
    .filter(s =>
      s.name.toLowerCase().includes(query) ||
      s.code.toLowerCase().includes(query)
    )
})

// Clear selection when unchecking the "add segment" checkbox
watch(shouldAddSegment, (newValue) => {
  if (!newValue) {
    selectedSet.value = null
    setSearchQuery.value = ''
  }
})

function handleSetSelected(set: ScryfallSet) {
  selectedSet.value = set
}

onMounted(async () => {
  try {
    allSets.value = await fetchSets()
    allSets.value.sort((a, b) => {
      const dateA = new Date(a.released_at).getTime()
      const dateB = new Date(b.released_at).getTime()
      return dateB - dateA
    })
  } catch (e) {
    setsError.value = e instanceof Error ? e.message : 'Failed to load sets'
  } finally {
    setsLoading.value = false
  }
})

async function handleSubmit() {
  if (!isValid.value || isSubmitting.value) return

  isSubmitting.value = true

  try {
    let binderId: string | undefined
    let segmentId: string | undefined

    // Create binder or box if requested
    if (shouldCreateBinder.value && binderName.value.trim()) {
      const containerConfig = binderContainerType.value === 'binder'
        ? {
            type: 'binder' as const,
            pageCount: binderPageCount.value,
            slotsPerPage: binderSlotsPerPage.value
          }
        : { type: 'box' as const }

      const binder = await bindersStore.addBinder(
        binderName.value.trim(),
        containerConfig
      )
      binderId = binder.id
    }

    // Create segment if a set was selected
    if (shouldAddSegment.value && selectedSet.value) {
      // Fetch all cards from the selected set
      const cards = await fetchSetCards(selectedSet.value.code)
      const cardIds = cards.map(card => card.id)

      const segment = segmentsStore.addSegment(
        selectedSet.value.name,
        selectedSet.value.code,
        cardIds
      )
      segmentId = segment.id
    }

    emit('submit', {
      name: setName.value.trim(),
      binderId,
      segmentId
    })
  } finally {
    isSubmitting.value = false
  }
}

function handleCancel() {
  emit('cancel')
}
</script>

<template>
  <div class="modal-overlay">
    <div class="modal">
      <h2>Create New Set</h2>

      <div class="form-section">
        <label class="form-label required">
          Set Name
        </label>
        <input
          v-model="setName"
          type="text"
          placeholder="Enter set name..."
          class="form-input"
          autofocus
          @keyup.enter="isValid && handleSubmit()"
        />
      </div>

      <div class="form-section">
        <label class="checkbox-label">
          <input type="checkbox" v-model="shouldCreateBinder" />
          <span>Add storage</span>
        </label>

        <div v-if="shouldCreateBinder" class="nested-form">
          <div class="form-group">
            <label class="form-label required">Storage Name</label>
            <input
              v-model="binderName"
              type="text"
              placeholder="Enter storage name..."
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Storage Type</label>
            <select v-model="binderContainerType" class="form-input">
              <option value="binder">Binder (Pages & Slots)</option>
              <option value="box">Storage Box (Unlimited)</option>
            </select>
          </div>

          <template v-if="binderContainerType === 'binder'">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Pages</label>
                <input
                  v-model.number="binderPageCount"
                  type="number"
                  min="1"
                  max="100"
                  class="form-input"
                />
              </div>

              <div class="form-group">
                <label class="form-label">Slots per Page</label>
                <select v-model.number="binderSlotsPerPage" class="form-input">
                  <option :value="9">9 (3×3)</option>
                  <option :value="12">12 (4×3)</option>
                </select>
              </div>
            </div>
            <div class="capacity-info">
              Capacity: {{ binderPageCount * binderSlotsPerPage }} cards
            </div>
          </template>

          <p v-else class="box-info">
            Storage boxes have unlimited capacity for flexible card organization.
          </p>
        </div>
      </div>

      <div v-if="!shouldCreateBinder || binderContainerType !== 'box'" class="form-section">
        <label class="checkbox-label">
          <input type="checkbox" v-model="shouldAddSegment" />
          <span>Select and add a set</span>
        </label>

        <div v-if="shouldAddSegment" class="nested-form">
          <input
            v-model="setSearchQuery"
            type="text"
            placeholder="Search for a set..."
            class="form-input"
          />

          <div v-if="setsLoading" class="loading-text">Loading sets...</div>
          <div v-else-if="setsError" class="error-text">{{ setsError }}</div>
          <div v-else-if="selectedSet" class="selected-set">
            <div class="selected-set-info">
              <img :src="selectedSet.icon_svg_uri" :alt="selectedSet.name" class="set-icon-small" />
              <div>
                <div class="set-name-text">{{ selectedSet.name }}</div>
                <div class="set-meta-text">{{ selectedSet.code.toUpperCase() }} • {{ selectedSet.card_count }} cards</div>
              </div>
            </div>
            <button @click="selectedSet = null" class="btn-clear" type="button">×</button>
          </div>
          <div v-else-if="filteredSets.length > 0" class="set-results">
            <button
              v-for="set in filteredSets"
              :key="set.code"
              @click="handleSetSelected(set)"
              class="set-result-item"
              type="button"
            >
              <img :src="set.icon_svg_uri" :alt="set.name" class="set-icon-small" />
              <div class="set-result-info">
                <div class="set-name-text">{{ set.name }}</div>
                <div class="set-meta-text">{{ set.code.toUpperCase() }} • {{ set.card_count }} cards</div>
              </div>
            </button>
          </div>
          <div v-else class="no-results-text">No sets found</div>
        </div>
      </div>

      <div class="modal-actions">
        <button @click="handleCancel" class="btn btn-secondary" :disabled="isSubmitting">Cancel</button>
        <button
          @click="handleSubmit"
          class="btn btn-primary"
          :disabled="!isValid || isSubmitting"
        >
          {{ isSubmitting ? 'Loading cards...' : 'Create Set' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: #fff;
  padding: 2rem;
  border-radius: 8px;
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.modal h2 {
  margin: 0 0 1.5rem 0;
  font-size: 1.5rem;
  color: #333;
}

.form-section {
  margin-bottom: 1.5rem;
}

.form-section:last-of-type {
  margin-bottom: 2rem;
}

.form-label {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #333;
}

.form-label.required::after {
  content: ' *';
  color: #dc3545;
}

.form-input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

.form-input:focus {
  outline: none;
  border-color: #4a90d9;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.95rem;
  color: #333;
  cursor: pointer;
  user-select: none;
}

.checkbox-label input[type="checkbox"] {
  cursor: pointer;
  width: 18px;
  height: 18px;
}

.checkbox-label span {
  font-weight: 500;
}

.nested-form {
  margin-top: 1rem;
  padding-left: 1.5rem;
  border-left: 3px solid #e0e0e0;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.capacity-info {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: #666;
}

.box-info {
  margin-top: 0.5rem;
  margin-bottom: 0;
  font-size: 0.875rem;
  color: #666;
  font-style: italic;
}

.loading-text,
.error-text,
.no-results-text {
  padding: 0.75rem;
  font-size: 0.875rem;
  color: #666;
  text-align: center;
}

.error-text {
  color: #dc3545;
}

.set-results {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-top: 0.5rem;
  max-height: 220px;
  overflow-y: auto;
  padding-left: 0.5rem;
}

.set-result-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem;
  background: #f8f8f8;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.set-result-item:hover {
  background: #e8f4ff;
  border-color: #4a90d9;
}

.set-icon-small {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
}

.set-result-info {
  flex: 1;
  min-width: 0;
}

.set-name-text {
  font-size: 0.85rem;
  font-weight: 500;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}

.set-meta-text {
  font-size: 0.7rem;
  color: #666;
  margin-top: 0.1rem;
  line-height: 1.2;
}

.selected-set {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem;
  background: #e8f4ff;
  border: 1px solid #4a90d9;
  border-radius: 4px;
  margin-top: 0.5rem;
}

.selected-set-info {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  flex: 1;
}

.btn-clear {
  background: none;
  border: none;
  color: #666;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  transition: color 0.2s;
}

.btn-clear:hover {
  color: #dc3545;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding-top: 1rem;
  border-top: 1px solid #eee;
}

.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 4px;
  font-size: 0.95rem;
  cursor: pointer;
  transition: background 0.2s;
  font-weight: 500;
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
  opacity: 0.6;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background: #5a6268;
}

.btn-full {
  width: 100%;
  text-align: center;
}
</style>
