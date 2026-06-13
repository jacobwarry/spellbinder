<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ScryfallSet } from '@/types'
import { Dialog } from '@/components/ui/dialog'
import SetSelector from './SetSelector.vue'
import CardPicker from './CardPicker.vue'

const emit = defineEmits<{
  confirm: [payload: { set: ScryfallSet; cardIds: string[] }]
  cancel: []
}>()

// Open on mount; closing (esc / scrim / X) cancels the whole flow.
const open = ref(true)
const selectedSet = ref<ScryfallSet | null>(null)

watch(open, (isOpen) => {
  if (!isOpen) emit('cancel')
})

function onConfirm(cardIds: string[]) {
  if (selectedSet.value) emit('confirm', { set: selectedSet.value, cardIds })
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
        cancel-label="Back"
        @confirm="onConfirm"
        @cancel="selectedSet = null"
      />
    </div>
  </Dialog>
</template>
