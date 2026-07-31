<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ScryfallSet } from '@/types'
import { Dialog } from '@/components/ui/dialog'
import SetSelector from './SetSelector.vue'
import CardPicker from './CardPicker.vue'

const props = defineProps<{
  // When set, skip the set-selector step and pick cards straight from this set
  // (used when appending to an existing, set-backed segment).
  initialSet?: ScryfallSet
}>()

const emit = defineEmits<{
  confirm: [payload: { set: ScryfallSet; cardIds: string[] }]
  cancel: []
}>()

// Open on mount; closing (esc / scrim / X) cancels the whole flow.
const open = ref(true)
const selectedSet = ref<ScryfallSet | null>(props.initialSet ?? null)

watch(open, (isOpen) => {
  if (!isOpen) emit('cancel')
})

function onConfirm(cardIds: string[]) {
  if (selectedSet.value) emit('confirm', { set: selectedSet.value, cardIds })
}

// With a locked set there's no selector to go back to, so "Back" cancels.
function onPickerCancel() {
  if (props.initialSet) open.value = false
  else selectedSet.value = null
}
</script>

<template>
  <Dialog v-model:open="open" :size="selectedSet ? 'full' : 'lg'" :title="selectedSet ? 'Select cards' : 'Select set'">
    <div class="flex flex-col" :class="selectedSet ? 'h-[80dvh]' : 'h-[60dvh]'">
      <SetSelector v-if="!selectedSet" @select="selectedSet = $event" />
      <CardPicker
        v-else
        class="min-h-0 flex-1"
        :set="selectedSet"
        :cancel-label="initialSet ? 'Cancel' : 'Back'"
        @confirm="onConfirm"
        @cancel="onPickerCancel"
      />
    </div>
  </Dialog>
</template>
