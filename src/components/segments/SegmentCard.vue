<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
import type { Segment, Binder } from '@/types'
import { useCollectionStore, usePricesStore } from '@/stores'
import { isPhysicalBinder } from '@/stores/binders'
import { getCachedCards } from '@/api/scryfall'
import { ChevronRight, MoreVertical, ArrowUp, ArrowDown, Pencil, Trash2, Check, X, Copy, Plus, Coins } from 'lucide-vue-next'
import ProgressBar from '@/components/common/ProgressBar.vue'
import CardmarketExportDialog from './CardmarketExportDialog.vue'
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { formatEurAmount } from '@/utils/price'
import { emptyValue, addCardValue, coverageLabel, missingCoverageLabel } from '@/utils/value'

const props = defineProps<{
  segment: Segment
  binders: Binder[]
  selected?: boolean
}>()

const collectionStore = useCollectionStore()
const pricesStore = usePricesStore()

// Owned value + cost-to-complete for this segment, from marked finishes + prices.
const segmentValue = computed(() => {
  const summary = emptyValue()
  props.segment.cardIds.forEach((id, index) => {
    const key = `${props.segment.id}:${index}`
    addCardValue(
      summary,
      pricesStore.getPrice(id),
      collectionStore.isOwnedNonFoil(key),
      collectionStore.isOwnedFoil(key),
      collectionStore.isSkipped(key)
    )
  })
  return summary
})
const valueLabel = computed(() => (segmentValue.value.pricedCount > 0 ? formatEurAmount(segmentValue.value.value) : null))
const valueTitle = computed(() => coverageLabel(segmentValue.value))
const missingLabel = computed(() => (segmentValue.value.missingPricedCount > 0 ? formatEurAmount(segmentValue.value.missingValue) : null))
const missingTitle = computed(() => missingCoverageLabel(segmentValue.value))

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
  updateName: [segment: Segment, name: string]
  remove: [segment: Segment]
  updateOffset: [segment: Segment, offset: number]
  updatePageOffset: [segment: Segment, pageOffset: number]
  updateTargetBinder: [segment: Segment, binderId: string | undefined]
  navigate: [segment: Segment]
  moveUp: [segment: Segment]
  moveDown: [segment: Segment]
  addCard: [segment: Segment]
  addCards: [segment: Segment]
}>()

// Set-once layout controls + export actions live behind a disclosure to keep
// the resting card compact.
const showOptions = ref(false)

// Inline rename
const editingName = ref(false)
const draftName = ref('')
const nameInput = ref<HTMLInputElement | null>(null)
async function startRename() {
  draftName.value = props.segment.name
  editingName.value = true
  await nextTick()
  nameInput.value?.focus()
  nameInput.value?.select()
}
function commitRename() {
  const name = draftName.value.trim()
  if (name && name !== props.segment.name) emit('updateName', props.segment, name)
  editingName.value = false
}
function cancelRename() {
  editingName.value = false
}

// A segment may be pulled back by a negative offset, down to one full page of
// the binder it lands in. When pinned to a physical binder we use its page size;
// otherwise (auto-fill, or a box target) we allow the largest page among the
// plan's binders. The placement engine floors the resulting slot at 0.
const minOffset = computed(() => {
  const target = props.segment.targetBinderId
    ? props.binders.find(b => b.id === props.segment.targetBinderId)
    : undefined
  if (target) return target.type === 'binder' ? -target.slotsPerPage : 0
  const pageSizes = props.binders.filter(isPhysicalBinder).map(b => b.slotsPerPage)
  return pageSizes.length ? -Math.max(...pageSizes) : 0
})

function handleOffsetChange(event: Event) {
  const input = event.target as HTMLInputElement
  const offset = Math.max(minOffset.value, parseInt(input.value, 10) || 0)
  input.value = String(offset)
  emit('updateOffset', props.segment, offset)
}

function handlePageOffsetChange(event: Event) {
  const input = event.target as HTMLInputElement
  const pageOffset = Math.max(0, parseInt(input.value, 10) || 0)
  input.value = String(pageOffset)
  emit('updatePageOffset', props.segment, pageOffset)
}

function handleTargetBinderChange(event: Event) {
  const select = event.target as HTMLSelectElement
  const binderId = select.value || undefined
  emit('updateTargetBinder', props.segment, binderId)
}

// Fetch prices for every card in this segment at once (chunked + throttled in the
// store), so you don't have to page a binder spread by spread.
function fetchPrices() {
  void pricesStore.fetchPricesFor(props.segment.cardIds)
}

function missingIds(): string[] {
  const ids: string[] = []
  props.segment.cardIds.forEach((id, index) => {
    const key = `${props.segment.id}:${index}`
    if (!collectionStore.isOwned(key) && !collectionStore.isSkipped(key)) ids.push(id)
  })
  return ids
}

const missingCount = computed(
  () => props.segment.cardIds.length - ownedCount.value - skippedCount.value
)

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

// Cardmarket export goes through a review dialog: Cardmarket's set catalogue doesn't map 1:1
// to Scryfall (Extras/Tokens/Commander splits + per-version suffixes), so the user can confirm
// or correct the resolved expansion names before copying. Snapshot the ids at open time.
const cardmarketDialogIds = ref<string[] | null>(null)
function openCardmarketExport() {
  const ids = missingIds()
  if (ids.length === 0) return
  cardmarketDialogIds.value = ids
}
</script>

<template>
  <div
    class="relative cursor-pointer rounded-lg border p-3 pr-10 transition-colors"
    :class="selected ? 'border-brand bg-(--accent-soft)' : 'border-line bg-surface hover:border-line-strong'"
    :aria-current="selected ? 'true' : undefined"
    @click="$emit('navigate', segment)"
  >
    <div v-if="editingName" class="flex items-center gap-1.5" @click.stop>
      <input
        ref="nameInput"
        v-model="draftName"
        class="h-7 min-w-0 flex-1 rounded-md border border-input bg-surface-2 px-2 text-sm font-semibold text-foreground outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-(--accent-glow)"
        @keyup.enter="commitRename"
        @keyup.esc="cancelRename"
      />
      <button class="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line text-owned outline-none hover:bg-(--owned-soft) focus-visible:ring-2 focus-visible:ring-ring" title="Save name" @click="commitRename"><Check :size="14" /></button>
      <button class="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line text-ink-soft outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring" title="Cancel" @click="cancelRename"><X :size="14" /></button>
    </div>
    <h3 v-else class="truncate text-sm font-semibold">{{ segment.name }}</h3>

    <p class="mt-0.5 text-xs text-ink-faint tabular-nums">
      {{ segment.isCustom ? 'Custom' : segment.scryfallSetCode.toUpperCase() }} · {{ segment.cardIds.length }} cards
      <span v-if="skippedCount > 0" class="text-skipped">· {{ skippedCount }} skipped</span>
    </p>

    <div class="mt-1.5 flex items-center gap-2">
      <ProgressBar :value="ownedPercentage" :complete="ownedPercentage === 100" class="flex-1" />
      <span class="shrink-0 text-xs tabular-nums" :class="ownedPercentage === 100 ? 'text-owned' : 'text-ink-soft'">
        {{ ownedCount }}/{{ segment.cardIds.length }} · {{ ownedPercentage }}%
      </span>
    </div>

    <!-- Owned value (brand) + muted cost-to-complete for the missing cards -->
    <p v-if="valueLabel || missingLabel" class="mt-1 text-xs font-semibold tabular-nums">
      <span v-if="valueLabel" class="text-brand" :title="valueTitle ?? undefined">{{ valueLabel }}</span>
      <span v-if="missingLabel" class="text-ink-faint" :class="valueLabel && 'ml-2'" :title="missingTitle ?? undefined">+{{ missingLabel }}</span>
    </p>

    <div class="mt-2" @click.stop>
      <button
        class="flex items-center gap-1 rounded text-xs font-medium text-ink-soft outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        :aria-expanded="showOptions"
        @click="showOptions = !showOptions"
      >
        <ChevronRight :size="14" class="transition-transform" :class="showOptions && 'rotate-90'" />
        Options
      </button>

      <div v-if="showOptions" class="mt-2 flex flex-col gap-2">
        <button
          v-if="segment.isCustom"
          class="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-line px-2 py-1.5 text-xs font-medium text-ink-soft outline-none transition-colors hover:border-line-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          @click="$emit('addCard', segment)"
        >
          <Plus :size="14" /> Add card
        </button>
        <div class="flex items-center gap-2 text-xs text-ink-soft">
          <label class="w-12 font-medium" :for="`page-offset-${segment.id}`">Pages</label>
          <input
            :id="`page-offset-${segment.id}`"
            type="number"
            :value="segment.pageOffset ?? 0"
            min="0"
            title="Skip this many whole pages before placing cards"
            class="h-7 w-16 rounded-md border border-input bg-surface-2 px-2 text-center text-foreground outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-(--accent-glow)"
            @change="handlePageOffsetChange"
          />
          <span class="text-ink-faint">pages</span>
        </div>

        <div class="flex items-center gap-2 text-xs text-ink-soft">
          <label class="w-12 font-medium" :for="`offset-${segment.id}`">Offset</label>
          <input
            :id="`offset-${segment.id}`"
            type="number"
            :value="segment.offset"
            :min="minOffset"
            title="Blank slots before placing cards. Negative pulls the segment back by up to one page."
            class="h-7 w-16 rounded-md border border-input bg-surface-2 px-2 text-center text-foreground outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-(--accent-glow)"
            @change="handleOffsetChange"
          />
          <span class="text-ink-faint">slots</span>
        </div>

        <div class="flex items-center gap-2 text-xs text-ink-soft">
          <label class="w-12 font-medium" :for="`target-${segment.id}`">Target</label>
          <select
            :id="`target-${segment.id}`"
            :value="segment.targetBinderId ?? ''"
            title="Target binder for this segment (auto-fill if not set)"
            class="h-7 min-w-24 flex-1 rounded-md border border-input bg-surface-2 px-2 text-foreground outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-(--accent-glow)"
            @change="handleTargetBinderChange"
          >
            <option value="">Auto</option>
            <option v-for="binder in binders" :key="binder.id" :value="binder.id">{{ binder.name }}</option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="!editingName" class="absolute right-2 top-2.5" @click.stop>
      <DropdownMenu>
        <template #trigger>
          <button
            class="grid h-7 w-7 place-items-center rounded-md text-ink-soft outline-none transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            title="Segment actions"
            aria-label="Segment actions"
          >
            <MoreVertical :size="16" />
          </button>
        </template>
        <DropdownMenuItem @select="startRename"><Pencil :size="15" /> Rename</DropdownMenuItem>
        <DropdownMenuItem @select="$emit('addCards', segment)"><Plus :size="15" /> Add cards</DropdownMenuItem>
        <DropdownMenuItem @select="$emit('moveUp', segment)"><ArrowUp :size="15" /> Move up</DropdownMenuItem>
        <DropdownMenuItem @select="$emit('moveDown', segment)"><ArrowDown :size="15" /> Move down</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem :disabled="pricesStore.isFetching" @select="fetchPrices"><Coins :size="15" /> {{ pricesStore.isFetching ? 'Fetching prices…' : 'Fetch prices' }}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem :disabled="missingCount === 0" @select="copyForMtgprint"><Copy :size="15" /> Copy missing · MTGPrint</DropdownMenuItem>
        <DropdownMenuItem :disabled="missingCount === 0" @select="openCardmarketExport"><Copy :size="15" /> Copy missing · Cardmarket</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive @select="$emit('remove', segment)"><Trash2 :size="15" /> Remove</DropdownMenuItem>
      </DropdownMenu>
    </div>

    <CardmarketExportDialog
      v-if="cardmarketDialogIds"
      :missing-ids="cardmarketDialogIds"
      :segment-name="segment.name"
      @close="cardmarketDialogIds = null"
    />
  </div>
</template>
