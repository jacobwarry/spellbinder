<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'

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
      options: group.options.filter(option =>
        option.label.toLowerCase().includes(query)
      )
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

  if (index > -1) {
    newValue.splice(index, 1)
  } else {
    newValue.push(value)
  }

  emit('update:modelValue', newValue)
}

function isSelected(value: string) {
  return props.modelValue.includes(value)
}

// Close dropdown when clicking outside
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  const dropdown = document.querySelector('.multiselect-dropdown')
  if (dropdown && !dropdown.contains(target)) {
    isOpen.value = false
  }
}

// Add/remove event listener when component mounts/unmounts
import { onMounted, onUnmounted } from 'vue'

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="multiselect-dropdown">
    <button type="button" class="dropdown-toggle" @click="toggleDropdown">
      <span class="selected-text">{{ selectedText }}</span>
      <svg class="dropdown-arrow" :class="{ open: isOpen }" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </button>

    <div v-if="isOpen" class="dropdown-menu">
      <div class="search-box">
        <input
          ref="searchInput"
          v-model="searchQuery"
          type="text"
          placeholder="Search types..."
          class="search-input"
          @click.stop
        />
      </div>
      <div v-for="group in filteredGroups" :key="group.label" class="option-group">
        <div class="group-label">{{ group.label }}</div>
        <label v-for="option in group.options" :key="option.value" class="option-item">
          <input
            type="checkbox"
            :checked="isSelected(option.value)"
            @change="toggleOption(option.value)"
          />
          <span>{{ option.label }}</span>
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.multiselect-dropdown {
  position: relative;
  width: 100%;
}

.dropdown-toggle {
  width: 100%;
  padding: 0.5rem;
  padding-right: 2rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  text-align: left;
  cursor: pointer;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dropdown-toggle:hover {
  border-color: #bbb;
}

.dropdown-toggle:focus {
  outline: none;
  border-color: #4a90d9;
}

.selected-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #333;
}

.dropdown-arrow {
  transition: transform 0.2s;
  flex-shrink: 0;
}

.dropdown-arrow.open {
  transform: rotate(180deg);
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 0.25rem;
  max-height: 400px;
  overflow-y: auto;
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  z-index: 1000;
}

.search-box {
  position: sticky;
  top: 0;
  background: white;
  padding: 0.5rem;
  border-bottom: 1px solid #eee;
  z-index: 10;
}

.search-input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.875rem;
}

.search-input:focus {
  outline: none;
  border-color: #4a90d9;
}

.option-group {
  padding: 0.5rem 0;
}

.option-group:not(:last-child) {
  border-bottom: 1px solid #eee;
}

.group-label {
  padding: 0.5rem 0.75rem;
  font-weight: bold;
  font-size: 0.875rem;
  color: #333;
  background: #f9f9f9;
}

.option-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  font-size: 0.875rem;
  color: #666;
}

.option-item:hover {
  background: #f0f7ff;
}

.option-item input[type="checkbox"] {
  cursor: pointer;
}

.option-item span {
  flex: 1;
}
</style>
