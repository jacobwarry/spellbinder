<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import type { ScryfallCard, ScryfallSet } from '@/types'
import { fetchSetCards, getCardImageUri, sortByCollectorNumber } from '@/api/scryfall'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Check } from 'lucide-vue-next'

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
  <div class="flex h-full min-h-0 flex-col gap-4">
    <div class="flex shrink-0 flex-col gap-3 border-b border-line pb-4">
      <div class="flex items-center justify-between gap-3">
        <h2 class="font-display text-xl font-bold tracking-tight">{{ set.name }}</h2>
        <Button :disabled="selectedIds.size === 0" @click="confirm">Add {{ selectedIds.size }} cards</Button>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <Input v-model="searchQuery" placeholder="Search cards by name or number…" class="min-w-60 flex-1" />
        <Button variant="outline" size="sm" @click="selectAll">Select all</Button>
        <Button variant="outline" size="sm" @click="selectNone">Select none</Button>
        <span class="whitespace-nowrap text-sm font-medium tabular-nums text-ink-soft">{{ selectedIds.size }} / {{ filteredCards.length }} selected</span>
      </div>
    </div>

    <div v-if="loading" class="py-8 text-center text-ink-soft">Loading cards…</div>
    <div v-else-if="error" class="py-8 text-center text-skipped">{{ error }}</div>
    <div v-else class="min-h-0 flex-1 overflow-y-auto">
      <div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(160px, 1fr))">
        <button
          v-for="card in filteredCards"
          :key="card.id"
          type="button"
          :title="card.name"
          class="group relative aspect-63/88 overflow-hidden rounded-md border-2 outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring"
          :class="selectedIds.has(card.id) ? 'border-brand' : 'border-transparent opacity-85 hover:opacity-100'"
          @click="toggleCard(card.id)"
        >
          <img :src="getCardImageUri(card, 'normal') ?? ''" :alt="card.name" loading="lazy" class="absolute inset-0 h-full w-full object-cover" />
          <span
            v-if="selectedIds.has(card.id)"
            class="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-brand text-primary-foreground"
          ><Check :size="12" :stroke-width="3" /></span>
          <span class="absolute bottom-1.5 left-1.5 rounded-xs bg-black/75 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">#{{ card.collector_number }}</span>
        </button>
      </div>
    </div>

    <div class="flex shrink-0 justify-end gap-2 border-t border-line pt-3">
      <Button variant="ghost" @click="$emit('cancel')">Cancel</Button>
      <Button :disabled="selectedIds.size === 0" @click="confirm">Add {{ selectedIds.size }} cards</Button>
    </div>
  </div>
</template>
