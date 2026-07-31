<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useBindersStore, useSegmentsStore, useCollectionStore } from '@/stores'
import { fetchAndCacheCards } from '@/api/scryfall'
import { parseManaboxCsv, ManaboxParseError, type ManaboxParseResult } from '@/utils/manaboxImport'
import type { ContainerType } from '@/types'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Upload, FileCheck, AlertTriangle } from 'lucide-vue-next'

const emit = defineEmits<{
  submit: [data: { name: string; binderId?: string; segmentId?: string }]
  cancel: []
}>()

const bindersStore = useBindersStore()
const segmentsStore = useSegmentsStore()
const collectionStore = useCollectionStore()

const setName = ref('')
const storageName = ref('')
const storageNameEdited = ref(false)
const containerType = ref<ContainerType>('box')
const pageCount = ref(40)
const slotsPerPage = ref(9)
const markOwned = ref(true)

const fileName = ref('')
const parseResult = ref<ManaboxParseResult | null>(null)
const parseError = ref<string | null>(null)

const isSubmitting = ref(false)
const submitStatus = ref('')
const submitError = ref<string | null>(null)

// Open on mount; closing (esc / scrim / Cancel) cancels.
const open = ref(true)
watch(open, (isOpen) => {
  if (!isOpen) emit('cancel')
})

// Storage name mirrors the set name until the user types their own.
watch(setName, (value) => {
  if (!storageNameEdited.value) storageName.value = value
})

const isValid = computed(() => {
  if (!parseResult.value) return false
  if (!setName.value.trim()) return false
  if (!storageName.value.trim()) return false
  return true
})

function onStorageNameInput() {
  storageNameEdited.value = true
}

async function handleFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  parseError.value = null
  parseResult.value = null
  submitError.value = null
  fileName.value = file.name

  try {
    const text = await file.text()
    parseResult.value = parseManaboxCsv(text)
    // Prefill names from the file (strip the extension), unless the user set one.
    const base = file.name.replace(/\.csv$/i, '').trim()
    if (!setName.value.trim()) setName.value = base
  } catch (e) {
    parseError.value = e instanceof ManaboxParseError
      ? e.message
      : 'Could not read that file. Make sure it is a ManaBox CSV export.'
  }
}

async function handleSubmit() {
  if (!isValid.value || isSubmitting.value || !parseResult.value) return
  isSubmitting.value = true
  submitError.value = null

  try {
    // Storage first — a segment's cards need a container to land in.
    const containerConfig = containerType.value === 'binder'
      ? { type: 'binder' as const, pageCount: pageCount.value, slotsPerPage: slotsPerPage.value }
      : { type: 'box' as const }
    const binder = await bindersStore.addBinder(storageName.value.trim(), containerConfig)

    // Resolve every distinct printing by its Scryfall ID (read-through cached).
    submitStatus.value = 'Fetching card data…'
    const uniqueIds = [...new Set(parseResult.value.rows.map(r => r.scryfallId))]
    const cardMap = await fetchAndCacheCards(uniqueIds)

    // Expand rows into slots in file order, one slot per copy, keeping only cards
    // Scryfall could resolve. Track each slot's finish for ownership marking.
    const cardIds: string[] = []
    const nonFoilSlots: boolean[] = []
    let unresolved = 0
    for (const row of parseResult.value.rows) {
      if (!cardMap.has(row.scryfallId)) {
        unresolved += row.quantity
        continue
      }
      for (let i = 0; i < row.quantity; i++) {
        cardIds.push(row.scryfallId)
        nonFoilSlots.push(!row.foil)
      }
    }

    if (cardIds.length === 0) {
      // Nothing resolved — roll back the storage we just made so we don't leave a stray box.
      await bindersStore.removeBinder(binder.id)
      submitError.value = 'None of the cards could be found on Scryfall. Nothing was imported.'
      return
    }

    submitStatus.value = 'Building set…'
    const segment = segmentsStore.addImportedSegment(setName.value.trim(), cardIds)

    // Ownership is position-keyed (`segmentId:index`), so mark by slot index.
    if (markOwned.value) {
      const nonFoilKeys: string[] = []
      const foilKeys: string[] = []
      cardIds.forEach((_, index) => {
        const key = `${segment.id}:${index}`
        if (nonFoilSlots[index]) nonFoilKeys.push(key)
        else foilKeys.push(key)
      })
      if (nonFoilKeys.length) collectionStore.setMultipleOwned(nonFoilKeys, true)
      if (foilKeys.length) collectionStore.setMultipleFoilOwned(foilKeys, true)
    }

    if (unresolved > 0) {
      console.warn(`Import: ${unresolved} card(s) could not be resolved on Scryfall and were skipped.`)
    }

    emit('submit', { name: setName.value.trim(), binderId: binder.id, segmentId: segment.id })
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'Import failed. Please try again.'
  } finally {
    isSubmitting.value = false
    submitStatus.value = ''
  }
}
</script>

<template>
  <Dialog v-model:open="open" size="lg" title="Import collection">
    <div class="flex flex-col gap-5">
      <p class="text-sm text-ink-soft">
        Import a ManaBox CSV export as a new set. Cards are matched to the exact printings
        by their Scryfall ID — no need to pick anything.
      </p>

      <!-- file picker -->
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium text-ink-soft">CSV file <span class="text-skipped">*</span></label>
        <input
          type="file"
          accept=".csv,text/csv"
          class="rounded-md border border-input bg-surface-2 p-2 text-sm text-ink-soft outline-none file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary-foreground hover:file:brightness-110"
          @change="handleFileSelected"
        />

        <p v-if="parseError" class="flex items-start gap-1.5 text-xs text-skipped">
          <AlertTriangle :size="14" class="mt-px shrink-0" /> {{ parseError }}
        </p>

        <div
          v-else-if="parseResult"
          class="flex flex-col gap-1 rounded-md border border-owned bg-(--owned-soft) p-2.5 text-xs"
        >
          <span class="flex items-center gap-1.5 font-medium text-owned">
            <FileCheck :size="14" /> {{ fileName }}
          </span>
          <span class="tabular-nums text-ink-soft">
            {{ parseResult.rows.length }} rows · {{ parseResult.totalCards }} cards
            <template v-if="parseResult.skipped.length">
              · {{ parseResult.skipped.length }} skipped (no Scryfall ID)
            </template>
          </span>
        </div>
      </div>

      <template v-if="parseResult">
        <!-- set name -->
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-ink-soft">Set name <span class="text-skipped">*</span></label>
          <Input v-model="setName" placeholder="Enter set name…" />
        </div>

        <!-- storage -->
        <div class="flex flex-col gap-3 border-l-2 border-line pl-4">
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-ink-soft">Storage name <span class="text-skipped">*</span></label>
            <Input v-model="storageName" placeholder="Enter storage name…" @update:model-value="onStorageNameInput" />
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-ink-soft">Storage type</label>
            <Select v-model="containerType">
              <option value="box">Storage box (unlimited)</option>
              <option value="binder">Binder (pages & slots)</option>
            </Select>
          </div>

          <template v-if="containerType === 'binder'">
            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium text-ink-soft">Pages</label>
                <Input v-model.number="pageCount" type="number" min="1" max="100" />
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium text-ink-soft">Slots per page</label>
                <Select v-model="slotsPerPage">
                  <option :value="9">9 (3×3)</option>
                  <option :value="12">12 (4×3)</option>
                </Select>
              </div>
            </div>
            <p class="text-sm tabular-nums text-ink-soft">Capacity: {{ pageCount * slotsPerPage }} cards</p>
          </template>
          <p v-else class="text-sm italic text-ink-soft">
            Storage boxes have unlimited capacity for flexible card organization.
          </p>
        </div>

        <!-- mark owned -->
        <label class="flex cursor-pointer select-none items-center gap-2 text-sm font-medium">
          <input v-model="markOwned" type="checkbox" class="size-4 cursor-pointer accent-brand" />
          <span>Mark imported cards as owned</span>
        </label>

        <p v-if="submitError" class="flex items-start gap-1.5 text-xs text-skipped">
          <AlertTriangle :size="14" class="mt-px shrink-0" /> {{ submitError }}
        </p>
      </template>
    </div>

    <template #footer>
      <Button variant="ghost" :disabled="isSubmitting" @click="open = false">Cancel</Button>
      <Button :disabled="!isValid || isSubmitting" @click="handleSubmit">
        <Upload v-if="!isSubmitting" :size="16" />
        {{ isSubmitting ? (submitStatus || 'Importing…') : 'Import set' }}
      </Button>
    </template>
  </Dialog>
</template>
