<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { ChevronDown } from 'lucide-vue-next'

interface Option {
  label: string
  value: string
}

interface OptionGroup {
  label: string
  options: Option[]
}

const props = defineProps<{
  modelValue: string[]
  groups: OptionGroup[]
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const isOpen = ref(false)
const searchQuery = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const root = ref<HTMLElement | null>(null)

const selectedText = computed(() => {
  if (props.modelValue.length === 0) {
    return props.placeholder || 'Select types...'
  }
  if (props.modelValue.length <= 3) {
    return props.modelValue.join(', ')
  }
  return `${props.modelValue.slice(0, 3).join(', ')} +${props.modelValue.length - 3} more`
})

const filteredGroups = computed(() => {
  if (!searchQuery.value.trim()) {
    return props.groups
  }
  const query = searchQuery.value.toLowerCase()
  return props.groups
    .map(group => ({
      ...group,
      options: group.options.filter(option => option.label.toLowerCase().includes(query))
    }))
    .filter(group => group.options.length > 0)
})

async function toggleDropdown() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    searchQuery.value = ''
    await nextTick()
    searchInput.value?.focus()
  }
}

function toggleOption(value: string) {
  const index = props.modelValue.indexOf(value)
  const newValue = [...props.modelValue]
  if (index > -1) newValue.splice(index, 1)
  else newValue.push(value)
  emit('update:modelValue', newValue)
}

function isSelected(value: string) {
  return props.modelValue.includes(value)
}

function handleClickOutside(event: MouseEvent) {
  if (root.value && !root.value.contains(event.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))
</script>

<template>
  <div ref="root" class="relative w-full">
    <button
      type="button"
      class="flex h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-surface px-3.5 text-left text-sm outline-none transition-colors hover:border-line-strong focus-visible:ring-2 focus-visible:ring-ring"
      @click="toggleDropdown"
    >
      <span class="flex-1 truncate" :class="modelValue.length ? 'text-foreground' : 'text-ink-faint'">{{ selectedText }}</span>
      <ChevronDown :size="16" class="shrink-0 text-ink-soft transition-transform" :class="isOpen && 'rotate-180'" />
    </button>

    <div
      v-if="isOpen"
      class="absolute inset-x-0 top-full z-20 mt-1 max-h-100 overflow-y-auto rounded-md border border-line bg-surface shadow-(--shadow-2)"
    >
      <div class="sticky top-0 z-10 border-b border-line bg-surface p-2">
        <input
          ref="searchInput"
          v-model="searchQuery"
          type="text"
          placeholder="Search types…"
          class="w-full rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          @click.stop
        />
      </div>
      <div v-for="group in filteredGroups" :key="group.label" class="border-b border-line py-1 last:border-b-0">
        <div class="bg-surface-2 px-3 py-1.5 text-sm font-bold text-ink-soft">{{ group.label }}</div>
        <label
          v-for="option in group.options"
          :key="option.value"
          class="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-surface-2"
        >
          <input
            type="checkbox"
            class="size-4 cursor-pointer accent-brand"
            :checked="isSelected(option.value)"
            @change="toggleOption(option.value)"
          />
          <span class="flex-1">{{ option.label }}</span>
        </label>
      </div>
    </div>
  </div>
</template>
