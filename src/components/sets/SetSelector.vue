<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { ScryfallSet } from '@/types'
import { fetchSets } from '@/api/scryfall'

const emit = defineEmits<{
  select: [set: ScryfallSet]
}>()

const sets = ref<ScryfallSet[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const searchQuery = ref('')

const filteredSets = computed(() => {
  const query = searchQuery.value.toLowerCase().trim()
  if (!query) {
    return sets.value.slice(0, 50)
  }
  return sets.value
    .filter(s =>
      s.name.toLowerCase().includes(query) ||
      s.code.toLowerCase().includes(query)
    )
    .slice(0, 50)
})

onMounted(async () => {
  try {
    sets.value = await fetchSets()
    sets.value.sort((a, b) => {
      const dateA = new Date(a.released_at).getTime()
      const dateB = new Date(b.released_at).getTime()
      return dateB - dateA
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load sets'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="set-selector">
    <input
      v-model="searchQuery"
      type="text"
      placeholder="Search sets..."
      class="search-input"
    />

    <div v-if="loading" class="loading">Loading sets...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else class="set-list">
      <button
        v-for="set in filteredSets"
        :key="set.code"
        @click="emit('select', set)"
        class="set-item"
      >
        <img :src="set.icon_svg_uri" :alt="set.name" class="set-icon" />
        <div class="set-info">
          <span class="set-name">{{ set.name }}</span>
          <span class="set-meta">{{ set.code.toUpperCase() }} · {{ set.card_count }} cards</span>
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.set-selector {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.search-input {
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 1rem;
}

.loading,
.error {
  padding: 1rem;
  text-align: center;
  color: #666;
}

.error {
  color: #c00;
}

.set-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 400px;
  overflow-y: auto;
}

.set-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border: 1px solid #eee;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  text-align: left;
}

.set-item:hover {
  background: #f5f5f5;
}

.set-icon {
  width: 24px;
  height: 24px;
}

.set-info {
  display: flex;
  flex-direction: column;
}

.set-name {
  font-weight: 500;
}

.set-meta {
  font-size: 0.75rem;
  color: #666;
}
</style>
