<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { ScryfallSet } from '@/types'
import { fetchSets } from '@/api/scryfall'
import { Input } from '@/components/ui/input'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'

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
  <div class="flex flex-col gap-2">
    <Input v-model="searchQuery" placeholder="Search sets…" />

    <div v-if="loading" class="flex justify-center py-10"><LoadingSpinner label="Loading sets…" /></div>
    <div v-else-if="error" class="py-4 text-center text-skipped">{{ error }}</div>
    <div v-else class="flex max-h-100 flex-col gap-1 overflow-y-auto">
      <button
        v-for="set in filteredSets"
        :key="set.code"
        class="flex items-center gap-2.5 rounded-md border border-line bg-surface p-2 text-left outline-none transition-colors hover:border-line-strong hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
        @click="emit('select', set)"
      >
        <img :src="set.icon_svg_uri" :alt="set.name" class="h-6 w-6 dark:invert" />
        <div class="flex min-w-0 flex-col">
          <span class="truncate text-sm font-medium">{{ set.name }}</span>
          <span class="text-xs text-ink-faint tabular-nums">{{ set.code.toUpperCase() }} · {{ set.card_count }} cards</span>
        </div>
      </button>
    </div>
  </div>
</template>
