<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ScryfallCard } from '@/types'
import { searchCards, getCardImageUri } from '@/api/scryfall'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

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

// Open on mount; closing (esc / scrim / ✕) cancels the insert.
const open = ref(true)
watch(open, (isOpen) => {
  if (!isOpen) emit('cancel')
})

watch(searchQuery, (query) => {
  if (searchTimeout.value) clearTimeout(searchTimeout.value)
  searchError.value = null

  if (!query.trim()) {
    searchResults.value = []
    return
  }

  searchTimeout.value = window.setTimeout(async () => {
    isSearching.value = true
    try {
      const setFilter = props.setCode ? `set:${props.setCode} ` : ''
      searchResults.value = await searchCards(setFilter + query)
    } catch {
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
</script>

<template>
  <Dialog
    v-model:open="open"
    size="xl"
    title="Insert card"
    :description="`${segmentName} (${setCode.toUpperCase()})`"
  >
    <div class="flex flex-col gap-3">
      <Input v-model="searchQuery" autofocus :placeholder="`Search in ${setCode.toUpperCase()}…`" />
      <p v-if="isSearching" class="text-sm text-ink-soft">Searching…</p>
      <p v-if="searchError" class="text-sm text-skipped">{{ searchError }}</p>

      <div
        v-if="searchResults.length > 0"
        class="grid max-h-[55vh] gap-3 overflow-y-auto"
        style="grid-template-columns: repeat(auto-fill, minmax(140px, 1fr))"
      >
        <button
          v-for="card in searchResults"
          :key="card.id"
          type="button"
          :title="`${card.name} (${card.set.toUpperCase()}) #${card.collector_number}`"
          class="flex flex-col overflow-hidden rounded-md border-2 border-transparent text-left outline-none transition-colors hover:border-brand focus-visible:ring-2 focus-visible:ring-ring"
          @click="selectCard(card)"
        >
          <img :src="getCardImageUri(card, 'small') ?? ''" :alt="card.name" loading="lazy" class="aspect-63/88 w-full bg-surface-2 object-cover" />
          <div class="flex flex-col gap-0.5 bg-surface-2 p-2">
            <span class="truncate text-xs font-semibold">{{ card.name }}</span>
            <span class="text-[10px] tabular-nums text-ink-soft">{{ card.set.toUpperCase() }} #{{ card.collector_number }}</span>
          </div>
        </button>
      </div>

      <p v-else-if="searchQuery && !isSearching" class="py-8 text-center text-ink-soft">
        No cards found for "{{ searchQuery }}"
      </p>
      <p v-else class="py-8 text-center text-ink-faint">Type a card name to search</p>
    </div>
  </Dialog>
</template>
