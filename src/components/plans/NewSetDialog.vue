<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useBindersStore, useSegmentsStore } from '@/stores'
import { fetchSets, fetchSetCards } from '@/api/scryfall'
import type { ScryfallSet, ContainerType } from '@/types'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { X, RefreshCw } from 'lucide-vue-next'

const emit = defineEmits<{
  submit: [data: { name: string; binderId?: string; segmentId?: string }]
  cancel: []
}>()

const bindersStore = useBindersStore()
const segmentsStore = useSegmentsStore()

const setName = ref('')
const shouldCreateBinder = ref(false)
const binderName = ref('')
const binderContainerType = ref<ContainerType>('binder')
const binderPageCount = ref(40)
const binderSlotsPerPage = ref(9)
const shouldAddSegment = ref(false)
const selectedSet = ref<ScryfallSet | null>(null)
const isSubmitting = ref(false)

const allSets = ref<ScryfallSet[]>([])
const setsLoading = ref(true)
const setsRefreshing = ref(false)
const setsError = ref<string | null>(null)
const setSearchQuery = ref('')

// Open on mount; closing (esc / scrim / Cancel) cancels.
const open = ref(true)
watch(open, (isOpen) => {
  if (!isOpen) emit('cancel')
})

// A segment's cards can only be placed into storage, so picking a set requires
// adding storage too.
const segmentNeedsStorage = computed(() =>
  shouldAddSegment.value && !!selectedSet.value && !shouldCreateBinder.value
)

const isValid = computed(() => {
  if (!setName.value.trim()) return false
  if (shouldCreateBinder.value && !binderName.value.trim()) return false
  if (segmentNeedsStorage.value) return false
  return true
})

const filteredSets = computed(() => {
  const query = setSearchQuery.value.toLowerCase().trim()
  if (!query) return allSets.value
  return allSets.value.filter(s =>
    s.name.toLowerCase().includes(query) || s.code.toLowerCase().includes(query)
  )
})

watch(shouldAddSegment, (newValue) => {
  if (!newValue) {
    selectedSet.value = null
    setSearchQuery.value = ''
  }
})

function handleSetSelected(set: ScryfallSet) {
  selectedSet.value = set
}

async function loadSets(force = false) {
  setsError.value = null
  try {
    allSets.value = await fetchSets(force)
    allSets.value.sort((a, b) => {
      const dateA = new Date(a.released_at).getTime()
      const dateB = new Date(b.released_at).getTime()
      return dateB - dateA
    })
  } catch (e) {
    setsError.value = e instanceof Error ? e.message : 'Failed to load sets'
  }
}

onMounted(async () => {
  await loadSets()
  setsLoading.value = false
})

async function refreshSets() {
  if (setsRefreshing.value) return
  setsRefreshing.value = true
  await loadSets(true)
  setsRefreshing.value = false
}

async function handleSubmit() {
  if (!isValid.value || isSubmitting.value) return
  isSubmitting.value = true

  try {
    let binderId: string | undefined
    let segmentId: string | undefined

    if (shouldCreateBinder.value && binderName.value.trim()) {
      const containerConfig = binderContainerType.value === 'binder'
        ? { type: 'binder' as const, pageCount: binderPageCount.value, slotsPerPage: binderSlotsPerPage.value }
        : { type: 'box' as const }

      const binder = await bindersStore.addBinder(binderName.value.trim(), containerConfig)
      binderId = binder.id
    }

    if (shouldAddSegment.value && selectedSet.value) {
      const cards = await fetchSetCards(selectedSet.value.code)
      const cardIds = cards.map(card => card.id)
      const segment = segmentsStore.addSegment(selectedSet.value.name, selectedSet.value.code, cardIds)
      segmentId = segment.id
    }

    emit('submit', { name: setName.value.trim(), binderId, segmentId })
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open" size="lg" title="Create new set">
    <div class="flex flex-col gap-5">
      <!-- set name -->
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium text-ink-soft">Set name <span class="text-skipped">*</span></label>
        <Input v-model="setName" autofocus placeholder="Enter set name…" @keyup.enter="isValid && handleSubmit()" />
      </div>

      <!-- add storage -->
      <div class="flex flex-col gap-2">
        <label class="flex cursor-pointer select-none items-center gap-2 text-sm font-medium">
          <input v-model="shouldCreateBinder" type="checkbox" class="size-4 cursor-pointer accent-brand" />
          <span>Add storage</span>
        </label>

        <div v-if="shouldCreateBinder" class="ml-1 flex flex-col gap-3 border-l-2 border-line pl-4">
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-ink-soft">Storage name <span class="text-skipped">*</span></label>
            <Input v-model="binderName" placeholder="Enter storage name…" />
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-ink-soft">Storage type</label>
            <Select v-model="binderContainerType">
              <option value="binder">Binder (pages & slots)</option>
              <option value="box">Storage box (unlimited)</option>
            </Select>
          </div>

          <template v-if="binderContainerType === 'binder'">
            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium text-ink-soft">Pages</label>
                <Input v-model.number="binderPageCount" type="number" min="1" max="100" />
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium text-ink-soft">Slots per page</label>
                <Select v-model="binderSlotsPerPage">
                  <option :value="9">9 (3×3)</option>
                  <option :value="12">12 (4×3)</option>
                </Select>
              </div>
            </div>
            <p class="text-sm tabular-nums text-ink-soft">Capacity: {{ binderPageCount * binderSlotsPerPage }} cards</p>
          </template>

          <p v-else class="text-sm italic text-ink-soft">
            Storage boxes have unlimited capacity for flexible card organization.
          </p>
        </div>
      </div>

      <!-- add segment -->
      <div v-if="!shouldCreateBinder || binderContainerType !== 'box'" class="flex flex-col gap-2">
        <label class="flex cursor-pointer select-none items-center gap-2 text-sm font-medium">
          <input v-model="shouldAddSegment" type="checkbox" class="size-4 cursor-pointer accent-brand" />
          <span>Select and add a set</span>
        </label>

        <div v-if="shouldAddSegment" class="ml-1 flex flex-col gap-2 border-l-2 border-line pl-4">
          <div class="flex items-center gap-2">
            <Input v-model="setSearchQuery" placeholder="Search for a set…" class="flex-1" />
            <Button
              variant="outline"
              size="icon"
              :disabled="setsRefreshing"
              aria-label="Refresh set list"
              title="Refresh set list"
              @click="refreshSets"
            >
              <RefreshCw :size="16" :class="{ 'animate-spin': setsRefreshing }" />
            </Button>
          </div>

          <p v-if="setsLoading" class="py-2 text-center text-sm text-ink-soft">Loading sets…</p>
          <p v-else-if="setsError" class="py-2 text-center text-sm text-skipped">{{ setsError }}</p>

          <div
            v-else-if="selectedSet"
            class="flex items-center justify-between gap-2 rounded-md border border-brand bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] p-2"
          >
            <div class="flex min-w-0 items-center gap-2.5">
              <img :src="selectedSet.icon_svg_uri" :alt="selectedSet.name" class="h-7 w-7 shrink-0 dark:invert" />
              <div class="min-w-0">
                <div class="truncate text-sm font-medium">{{ selectedSet.name }}</div>
                <div class="text-xs tabular-nums text-ink-soft">{{ selectedSet.code.toUpperCase() }} • {{ selectedSet.card_count }} cards</div>
              </div>
            </div>
            <button type="button" class="grid h-7 w-7 shrink-0 place-items-center rounded text-ink-soft hover:text-skipped" aria-label="Clear selected set" @click="selectedSet = null">
              <X :size="16" />
            </button>
          </div>

          <div v-else-if="filteredSets.length > 0" class="flex max-h-55 flex-col gap-1.5 overflow-y-auto">
            <button
              v-for="set in filteredSets"
              :key="set.code"
              type="button"
              class="flex items-center gap-2.5 rounded-md border border-line bg-surface-2 p-2 text-left transition-colors hover:border-brand hover:bg-surface-3"
              @click="handleSetSelected(set)"
            >
              <img :src="set.icon_svg_uri" :alt="set.name" class="h-7 w-7 shrink-0 dark:invert" />
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium">{{ set.name }}</div>
                <div class="text-xs tabular-nums text-ink-soft">{{ set.code.toUpperCase() }} • {{ set.card_count }} cards</div>
              </div>
            </button>
          </div>

          <p v-else class="py-2 text-center text-sm text-ink-soft">No sets found</p>

          <p v-if="segmentNeedsStorage" class="text-xs text-skipped">
            Enable "Add storage" above. A set needs a binder or box to place its cards.
          </p>
        </div>
      </div>
    </div>

    <template #footer>
      <Button variant="ghost" :disabled="isSubmitting" @click="open = false">Cancel</Button>
      <Button :disabled="!isValid || isSubmitting" @click="handleSubmit">
        {{ isSubmitting ? 'Loading cards…' : 'Create set' }}
      </Button>
    </template>
  </Dialog>
</template>
