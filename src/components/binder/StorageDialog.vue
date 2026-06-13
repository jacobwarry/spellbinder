<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Binder } from '@/types'
import { Dialog } from '@/components/ui/dialog'
import BinderForm from './BinderForm.vue'

const props = defineProps<{
  binder?: Binder | null
}>()

const emit = defineEmits<{
  submit: [data:
    | { name: string; type: 'binder'; pageCount: number; slotsPerPage: number; coverImage?: File | null }
    | { name: string; type: 'box'; coverImage?: File | null }
  ]
  cancel: []
}>()

// Open on mount; closing (esc / scrim / X) cancels.
const open = ref(true)
watch(open, (isOpen) => {
  if (!isOpen) emit('cancel')
})
</script>

<template>
  <Dialog v-model:open="open" size="lg" :title="props.binder ? 'Edit storage' : 'Add storage'">
    <BinderForm
      :binder="props.binder ?? undefined"
      @submit="emit('submit', $event)"
      @cancel="open = false"
    />
  </Dialog>
</template>
