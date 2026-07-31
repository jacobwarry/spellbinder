<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { ScryfallCard } from '@/types'
import { searchCards, getCardImageUri } from '@/api/scryfall'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { FileText } from 'lucide-vue-next'

const props = defineProps<{
  setCode: string
  segmentName: string
  title?: string
}>()

// An empty setCode means a set-less (custom) section: search across every set.
const hasSetFilter = computed(() => props.setCode.trim().length > 0)
const searchPlaceholder = computed(() =>
  hasSetFilter.value ? `Search in ${props.setCode.toUpperCase()}…` : 'Search all sets…'
)
const dialogDescription = computed(() =>
  hasSetFilter.value ? `${props.segmentName} (${props.setCode.toUpperCase()})` : props.segmentName
)

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
    :title="title ?? 'Insert card'"
    :description="dialogDescription"
  >
    <div class="flex flex-col gap-3">
      <Input v-model="searchQuery" autofocus :placeholder="searchPlaceholder" />
      <p v-if="isSearching" class="text-sm text-ink-soft">Searching…</p>
      <p v-if="searchError" class="text-sm text-skipped">{{ searchError }}</p>

      <div
        v-if="searchResults.length > 0"
        class="grid max-h-[55vh] gap-3 overflow-y-auto"
        style="grid-template-columns: repeat(auto-fill, minmax(140px, 1fr))"
      >
        <div v-for="card in searchResults" :key="card.id" class="group relative">
          <button
            type="button"
            :title="`${card.name} (${card.set.toUpperCase()}) #${card.collector_number}`"
            class="flex w-full flex-col overflow-hidden rounded-md border-2 border-transparent text-left outline-none transition-colors hover:border-brand focus-visible:ring-2 focus-visible:ring-ring"
            @click="selectCard(card)"
          >
            <img :src="getCardImageUri(card, 'small') ?? ''" :alt="card.name" loading="lazy" class="aspect-63/88 w-full bg-surface-2 object-cover" />
            <div class="flex flex-col gap-0.5 bg-surface-2 p-2">
              <span class="truncate text-xs font-semibold">{{ card.name }}</span>
              <span class="text-[10px] tabular-nums text-ink-soft">{{ card.set.toUpperCase() }} #{{ card.collector_number }}</span>
            </div>
          </button>
          <!-- Details opens in a new tab so it doesn't discard the in-progress insert. -->
          <RouterLink
            :to="`/card/${card.id}`"
            target="_blank"
            :title="`View details for ${card.name}`"
            class="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md bg-[rgba(0,0,0,.65)] text-white opacity-0 outline-none transition-opacity hover:bg-[rgba(0,0,0,.8)] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
            @click.stop
          >
            <FileText :size="14" />
          </RouterLink>
        </div>
      </div>

      <p v-else-if="searchQuery && !isSearching" class="py-8 text-center text-ink-soft">
        No cards found for "{{ searchQuery }}"
      </p>
      <p v-else class="py-8 text-center text-ink-faint">Type a card name to search</p>
    </div>
  </Dialog>
</template>
