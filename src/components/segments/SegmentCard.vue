<script setup lang="ts">
import { computed } from 'vue'
import type { Segment, Binder } from '@/types'
import { useCollectionStore } from '@/stores'
import { getCachedCards, fetchSets } from '@/api/scryfall'

const props = defineProps<{
  segment: Segment
  binders: Binder[]
}>()

const collectionStore = useCollectionStore()

const ownedCount = computed(() =>
  props.segment.cardIds.filter((_, index) =>
    collectionStore.isOwned(`${props.segment.id}:${index}`)
  ).length
)

const skippedCount = computed(() =>
  props.segment.cardIds.filter((_, index) =>
    collectionStore.isSkipped(`${props.segment.id}:${index}`)
  ).length
)

const ownedPercentage = computed(() => {
  if (props.segment.cardIds.length === 0) return 0
  return Math.round((ownedCount.value / props.segment.cardIds.length) * 100)
})

const emit = defineEmits<{
  edit: [segment: Segment]
  remove: [segment: Segment]
  updateOffset: [segment: Segment, offset: number]
  updateTargetBinder: [segment: Segment, binderId: string | undefined]
  navigate: [segment: Segment]
  moveUp: [segment: Segment]
  moveDown: [segment: Segment]
}>()

function handleOffsetChange(event: Event) {
  const input = event.target as HTMLInputElement
  const offset = Math.min(9, Math.max(0, parseInt(input.value, 10) || 0))
  input.value = String(offset)
  emit('updateOffset', props.segment, offset)
}

function handleTargetBinderChange(event: Event) {
  const select = event.target as HTMLSelectElement
  const binderId = select.value || undefined
  emit('updateTargetBinder', props.segment, binderId)
}

async function copyForMtgprint() {
  const missingIndices: number[] = []
  props.segment.cardIds.forEach((_, index) => {
    const key = `${props.segment.id}:${index}`
    if (!collectionStore.isOwned(key) && !collectionStore.isSkipped(key)) {
      missingIndices.push(index)
    }
  })
  const missingIds = missingIndices.map(i => props.segment.cardIds[i]!)
  if (missingIds.length === 0) return

  const cardMap = await getCachedCards(missingIds)
  const lines = missingIds
    .map(id => cardMap.get(id))
    .filter((card): card is NonNullable<typeof card> => card !== undefined)
    .map(card => `${card.name} (${card.set.toUpperCase()}) ${card.collector_number}`)

  if (lines.length === 0) return

  await navigator.clipboard.writeText(lines.join('\n'))
}

async function copyForCardmarket() {
  const missingIndices: number[] = []
  props.segment.cardIds.forEach((_, index) => {
    const key = `${props.segment.id}:${index}`
    if (!collectionStore.isOwned(key) && !collectionStore.isSkipped(key)) {
      missingIndices.push(index)
    }
  })
  const missingIds = missingIndices.map(i => props.segment.cardIds[i]!)
  if (missingIds.length === 0) return

  const [cardMap, sets] = await Promise.all([
    getCachedCards(missingIds),
    fetchSets()
  ])

  const setNameMap = new Map(sets.map(s => [s.code, s.name]))
  const lines = missingIds
    .map(id => cardMap.get(id))
    .filter((card): card is NonNullable<typeof card> => card !== undefined)
    .map(card => `${card.name} (${card.set_name || setNameMap.get(card.set) || card.set.toUpperCase()}) ${card.collector_number}`)

  if (lines.length === 0) return

  await navigator.clipboard.writeText(lines.join('\n'))
}
</script>

<template>
  <div class="segment-card" @click="$emit('navigate', segment)">
    <div class="segment-info">
      <h3>{{ segment.name }}</h3>
      <p class="segment-stats">
        {{ segment.cardIds.length }} cards from {{ segment.scryfallSetCode.toUpperCase() }}
      </p>
      <p class="segment-owned">
        <span class="owned-count" :class="{ complete: ownedPercentage === 100 }">{{ ownedCount }}</span> / {{ segment.cardIds.length }} owned
        <span class="owned-percentage" :class="{ complete: ownedPercentage === 100 }">({{ ownedPercentage }}%)</span>
        <span v-if="skippedCount > 0" class="skipped-count">· {{ skippedCount }} skipped</span>
      </p>
      <div class="segment-offset">
        <label>Offset:</label>
        <input
          type="number"
          :value="segment.offset"
          @change="handleOffsetChange"
          min="0"
          max="9"
          class="offset-input"
          title="Skip this many slots before placing cards (0-9)"
        />
        <span class="offset-hint">slots</span>
      </div>
      <div class="segment-target">
        <label>Target:</label>
        <select
          :value="segment.targetBinderId ?? ''"
          @change="handleTargetBinderChange"
          class="target-select"
          title="Target binder for this segment (auto-fill if not set)"
        >
          <option value="">Auto</option>
          <option v-for="binder in binders" :key="binder.id" :value="binder.id">
            {{ binder.name }}
          </option>
        </select>
      </div>
      <div class="segment-copy">
        <button @click.stop="copyForMtgprint" class="btn-copy">MTGPRINT</button>
        <button @click.stop="copyForCardmarket" class="btn-copy">CARDMARKET</button>
      </div>
    </div>
    <div class="segment-actions">
      <button @click.stop="$emit('moveUp', segment)" class="btn-icon" title="Move up">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="18 15 12 9 6 15"/>
        </svg>
      </button>
      <button @click.stop="$emit('moveDown', segment)" class="btn-icon" title="Move down">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      <button @click.stop="$emit('edit', segment)" class="btn-icon" title="Edit">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button @click.stop="$emit('remove', segment)" class="btn-icon btn-icon-danger" title="Remove">
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
.segment-card {
  position: relative;
  padding: 1rem;
  padding-right: 4rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  transition: background 0.2s;
}

.segment-card:hover {
  background: #f9f9f9;
}

.segment-info h3 {
  margin: 0 0 0.375rem 0;
  font-size: 1rem;
}

.segment-stats {
  margin: 0;
  color: #666;
  font-size: 0.875rem;
}

.segment-owned {
  margin: 0.125rem 0 0 0;
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

.skipped-count {
  color: #dc3545;
  margin-left: 0.25rem;
}

.segment-offset {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: #888;
}

.segment-offset label {
  font-weight: 500;
}

.offset-input {
  width: 50px;
  padding: 0.125rem 0.25rem;
  border: 1px solid #ccc;
  border-radius: 3px;
  font-size: 0.75rem;
  text-align: center;
}

.offset-input::-webkit-inner-spin-button,
.offset-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.offset-input[type=number] {
  -moz-appearance: textfield;
}

.offset-hint {
  color: #999;
}

.segment-target {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: #888;
}

.segment-target label {
  font-weight: 500;
}

.target-select {
  padding: 0.125rem 0.25rem;
  border: 1px solid #ccc;
  border-radius: 3px;
  font-size: 0.75rem;
  min-width: 80px;
}

.segment-copy {
  display: flex;
  justify-content: flex-start;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.btn-copy {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  background: #4a90d9;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.btn-copy:hover {
  background: #3a7bc8;
}

.segment-actions {
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
