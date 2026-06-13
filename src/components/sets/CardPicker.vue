<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import type { ScryfallCard, ScryfallSet } from '@/types'
import { fetchSetCards, getCardImageUri, sortByCollectorNumber } from '@/api/scryfall'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import CardSizeControl from '@/components/common/CardSizeControl.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import { useCardSize } from '@/composables/useCardSize'
import { Check } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  set: ScryfallSet
  initialSelection?: string[]
  cancelLabel?: string
}>(), {
  cancelLabel: 'Cancel'
})

const emit = defineEmits<{
  confirm: [cardIds: string[]]
  cancel: []
}>()

const cards = ref<ScryfallCard[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const selectedIds = ref<Set<string>>(new Set(props.initialSelection ?? []))
const searchQuery = ref('')

// User-adjustable card size (tile min-width, px), persisted across picker opens.
const cardSize = useCardSize('spellbinder-cardsize-picker', 150)

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
      <span class="text-sm tabular-nums text-ink-soft">{{ selectedIds.size }} selected</span>
    </div>

    <div class="flex flex-wrap items-center gap-2.5">
      <Input v-model="searchQuery" placeholder="Search cards…" class="min-w-56 flex-1" />
      <CardSizeControl v-model="cardSize" :min="100" :max="240" :step="10" class="hidden sm:flex" />
      <Button variant="outline" size="sm" @click="selectAll">Select all</Button>
      <Button variant="outline" size="sm" @click="selectNone">Select none</Button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <div v-if="loading" class="flex h-full items-center justify-center">
        <LoadingSpinner label="Loading cards…" />
      </div>
      <div v-else-if="error" class="flex h-full items-center justify-center px-4 text-center text-skipped">{{ error }}</div>
      <div v-else class="grid gap-3" :style="{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, 1fr))` }">
        <button
          v-for="card in filteredCards"
          :key="card.id"
          type="button"
          class="relative overflow-hidden rounded-md border-2 outline-none transition-[transform,box-shadow,border-color] duration-150 ease-out hover:z-10 hover:scale-[1.03] hover:shadow-(--shadow-2) focus-visible:ring-2 focus-visible:ring-ring"
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
      <Button variant="ghost" @click="$emit('cancel')">{{ props.cancelLabel }}</Button>
      <Button :disabled="selectedIds.size === 0" @click="confirm">Add {{ selectedIds.size }} cards</Button>
    </div>
  </div>
</template>
