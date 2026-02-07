<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Binder } from '@/types'

const props = defineProps<{
  binder?: Binder
}>()

const emit = defineEmits<{
  submit: [data: { name: string; pageCount: number; slotsPerPage: number }]
  cancel: []
}>()

const name = ref(props.binder?.name ?? '')
const pageCount = ref(props.binder?.pageCount ?? 40)
const slotsPerPage = ref(props.binder?.slotsPerPage ?? 9)

watch(() => props.binder, (newBinder) => {
  name.value = newBinder?.name ?? ''
  pageCount.value = newBinder?.pageCount ?? 40
  slotsPerPage.value = newBinder?.slotsPerPage ?? 9
})

function handleSubmit() {
  if (!name.value.trim()) return
  emit('submit', {
    name: name.value.trim(),
    pageCount: pageCount.value,
    slotsPerPage: slotsPerPage.value
  })
}
</script>

<template>
  <form @submit.prevent="handleSubmit" class="binder-form">
    <div class="form-group">
      <label for="name">Binder Name</label>
      <input id="name" v-model="name" type="text" placeholder="My Binder" required />
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="pageCount">Pages</label>
        <input id="pageCount" v-model.number="pageCount" type="number" min="1" max="100" />
      </div>

      <div class="form-group">
        <label for="slotsPerPage">Slots per Page</label>
        <select id="slotsPerPage" v-model.number="slotsPerPage">
          <option :value="9">9 (3×3)</option>
          <option :value="12">12 (3×4)</option>
        </select>
      </div>
    </div>

    <div class="form-info">
      Capacity: {{ pageCount * slotsPerPage }} cards
    </div>

    <div class="form-actions">
      <button type="button" @click="$emit('cancel')" class="btn btn-secondary">Cancel</button>
      <button type="submit" class="btn btn-primary">{{ binder ? 'Update' : 'Add' }} Binder</button>
    </div>
  </form>
</template>

<style scoped>
.binder-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.form-group label {
  font-weight: 500;
  font-size: 0.875rem;
}

.form-group input,
.form-group select {
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 1rem;
}

.form-row {
  display: flex;
  gap: 1rem;
}

.form-row .form-group {
  flex: 1;
}

.form-info {
  color: #666;
  font-size: 0.875rem;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
}

.btn-primary {
  background: #4a90d9;
  color: white;
}

.btn-primary:hover {
  background: #3a7bc8;
}

.btn-secondary {
  background: #e5e5e5;
  color: #333;
}

.btn-secondary:hover {
  background: #d5d5d5;
}
</style>
