<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import type { ScryfallCard, ScryfallSet } from '@/types'
import { fetchSetCards, getCardImageUri, sortByCollectorNumber } from '@/api/scryfall'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Check } from 'lucide-vue-next'

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
  <div class="flex h-full flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h3 class="font-display text-lg font-bold tracking-tight">{{ set.name }}</h3>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" @click="selectAll">Select all</Button>
        <Button variant="outline" size="sm" @click="selectNone">Select none</Button>
        <span class="text-sm tabular-nums text-ink-soft">{{ selectedIds.size }} selected</span>
      </div>
    </div>

    <Input v-model="searchQuery" placeholder="Search cards…" />

    <div v-if="loading" class="py-8 text-center text-ink-soft">Loading cards…</div>
    <div v-else-if="error" class="py-8 text-center text-skipped">{{ error }}</div>
    <div v-else class="min-h-0 flex-1 overflow-y-auto">
      <div class="grid gap-2" style="grid-template-columns: repeat(auto-fill, minmax(100px, 1fr))">
        <button
          v-for="card in filteredCards"
          :key="card.id"
          type="button"
          class="relative overflow-hidden rounded-md border-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
          :class="selectedIds.has(card.id) ? 'border-brand' : 'border-transparent hover:border-line-strong'"
          @click="toggleCard(card.id)"
        >
          <img :src="getCardImageUri(card, 'normal') ?? ''" :alt="card.name" loading="lazy" class="block w-full" />
          <span class="absolute bottom-1 right-1 rounded-xs bg-black/70 px-1 py-0.5 text-[10px] font-semibold tabular-nums text-white">#{{ card.collector_number }}</span>
          <span
            v-if="selectedIds.has(card.id)"
            class="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-brand text-primary-foreground"
          ><Check :size="12" :stroke-width="3" /></span>
        </button>
      </div>
    </div>

    <div class="flex justify-end gap-2 border-t border-line pt-3">
      <Button variant="ghost" @click="$emit('cancel')">Cancel</Button>
      <Button :disabled="selectedIds.size === 0" @click="confirm">Add {{ selectedIds.size }} cards</Button>
    </div>
  </div>
</template>
