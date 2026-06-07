<script setup lang="ts">
import { computed } from 'vue'
import type { Segment, Binder } from '@/types'
import { useCollectionStore } from '@/stores'
import { getCachedCards, fetchSets } from '@/api/scryfall'
import { ChevronUp, ChevronDown, Pencil, Trash2 } from 'lucide-vue-next'

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

function missingIds(): string[] {
  const ids: string[] = []
  props.segment.cardIds.forEach((id, index) => {
    const key = `${props.segment.id}:${index}`
    if (!collectionStore.isOwned(key) && !collectionStore.isSkipped(key)) ids.push(id)
  })
  return ids
}

async function copyForMtgprint() {
  const ids = missingIds()
  if (ids.length === 0) return

  const cardMap = await getCachedCards(ids)
  const lines = ids
    .map(id => cardMap.get(id))
    .filter((card): card is NonNullable<typeof card> => card !== undefined)
    .map(card => `${card.name} (${card.set.toUpperCase()}) ${card.collector_number}`)

  if (lines.length === 0) return

  await navigator.clipboard.writeText(lines.join('\n'))
}

async function copyForCardmarket() {
  const ids = missingIds()
  if (ids.length === 0) return

  const [cardMap, sets] = await Promise.all([
    getCachedCards(ids),
    fetchSets()
  ])

  const setNameMap = new Map(sets.map(s => [s.code, s.name]))
  const lines = ids
    .map(id => cardMap.get(id))
    .filter((card): card is NonNullable<typeof card> => card !== undefined)
    .map(card => `${card.name} (${card.set_name || setNameMap.get(card.set) || card.set.toUpperCase()}) ${card.collector_number}`)

  if (lines.length === 0) return

  await navigator.clipboard.writeText(lines.join('\n'))
}
</script>

<template>
  <div
    class="relative cursor-pointer rounded-lg border border-line bg-surface p-3 pr-14 transition-colors hover:border-line-strong"
    @click="$emit('navigate', segment)"
  >
    <h3 class="text-sm font-semibold">{{ segment.name }}</h3>
    <p class="mt-0.5 text-sm text-ink-soft tabular-nums">
      {{ segment.cardIds.length }} cards from {{ segment.scryfallSetCode.toUpperCase() }}
    </p>
    <p class="mt-0.5 text-xs text-ink-faint tabular-nums">
      <span class="font-medium" :class="ownedPercentage === 100 && 'text-owned'">{{ ownedCount }}</span> / {{ segment.cardIds.length }} owned
      <span :class="ownedPercentage === 100 && 'text-owned'">({{ ownedPercentage }}%)</span>
      <span v-if="skippedCount > 0" class="text-skipped">· {{ skippedCount }} skipped</span>
    </p>

    <div class="mt-2 flex items-center gap-2 text-xs text-ink-soft" @click.stop>
      <label class="font-medium" :for="`offset-${segment.id}`">Offset</label>
      <input
        :id="`offset-${segment.id}`"
        type="number"
        :value="segment.offset"
        min="0"
        max="9"
        title="Skip this many slots before placing cards (0-9)"
        class="h-7 w-14 rounded-md border border-input bg-surface-2 px-2 text-center text-foreground outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-(--accent-glow)"
        @change="handleOffsetChange"
      />
      <span class="text-ink-faint">slots</span>
    </div>

    <div class="mt-2 flex items-center gap-2 text-xs text-ink-soft" @click.stop>
      <label class="font-medium" :for="`target-${segment.id}`">Target</label>
      <select
        :id="`target-${segment.id}`"
        :value="segment.targetBinderId ?? ''"
        title="Target binder for this segment (auto-fill if not set)"
        class="h-7 min-w-24 rounded-md border border-input bg-surface-2 px-2 text-foreground outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-(--accent-glow)"
        @change="handleTargetBinderChange"
      >
        <option value="">Auto</option>
        <option v-for="binder in binders" :key="binder.id" :value="binder.id">{{ binder.name }}</option>
      </select>
    </div>

    <div class="mt-2 flex gap-2" @click.stop>
      <button class="rounded-md bg-brand px-2 py-1 text-[11px] font-semibold text-primary-foreground transition hover:brightness-110" @click="copyForMtgprint">MTGPRINT</button>
      <button class="rounded-md bg-brand px-2 py-1 text-[11px] font-semibold text-primary-foreground transition hover:brightness-110" @click="copyForCardmarket">CARDMARKET</button>
    </div>

    <div class="absolute right-3 top-3 flex gap-1">
      <button class="grid h-7 w-7 place-items-center rounded-md border border-line text-ink-soft outline-none transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" title="Move up" aria-label="Move up" @click.stop="$emit('moveUp', segment)"><ChevronUp :size="14" /></button>
      <button class="grid h-7 w-7 place-items-center rounded-md border border-line text-ink-soft outline-none transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" title="Move down" aria-label="Move down" @click.stop="$emit('moveDown', segment)"><ChevronDown :size="14" /></button>
      <button class="grid h-7 w-7 place-items-center rounded-md border border-line text-ink-soft outline-none transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" title="Edit" aria-label="Edit segment" @click.stop="$emit('edit', segment)"><Pencil :size="14" /></button>
      <button class="grid h-7 w-7 place-items-center rounded-md border border-line text-ink-soft outline-none transition-colors hover:bg-(--skipped-soft) hover:text-skipped focus-visible:ring-2 focus-visible:ring-ring" title="Remove" aria-label="Remove segment" @click.stop="$emit('remove', segment)"><Trash2 :size="14" /></button>
    </div>
  </div>
</template>
