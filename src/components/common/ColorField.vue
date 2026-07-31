<script setup lang="ts">
/**
 * A compact color picker: a row of preset swatches, a custom-color swatch that
 * opens the native OS picker, and a "None" chip that clears back to the default
 * placeholder. Emits `undefined` when cleared so callers can treat unset as
 * "use the default chrome". Value is stored as a concrete lowercase hex.
 */
import { computed } from 'vue'
import { Ban } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    label: string
    helpText?: string
    presets?: string[]
  }>(),
  {
    // MTG mana tones + accent + a leather/dark neutral pair.
    presets: () => ['#e9d49a', '#4aa3e8', '#534a66', '#ef5a44', '#4fc172', '#6f48ff', '#b45309', '#1c1930']
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string | undefined]
}>()

const value = computed(() => props.modelValue?.toLowerCase())
const presetSet = computed(() => new Set(props.presets.map(p => p.toLowerCase())))
const isCustom = computed(() => !!value.value && !presetSet.value.has(value.value))

function onCustomInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
}

const swatch =
  'grid h-8 w-8 place-items-center rounded-md border border-line-strong outline-none transition-[box-shadow] focus-visible:ring-2 focus-visible:ring-ring'
const selected = 'ring-2 ring-brand ring-offset-2 ring-offset-surface'
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <span class="text-sm font-medium text-ink-soft">{{ label }}</span>
    <p v-if="helpText" class="text-xs text-ink-faint">{{ helpText }}</p>
    <div class="flex flex-wrap items-center gap-2">
      <!-- None: fall back to the default placeholder chrome -->
      <button
        type="button"
        :class="[swatch, 'bg-surface-2 text-ink-faint hover:text-foreground', !value && selected]"
        :aria-pressed="!value"
        title="No color (default)"
        @click="emit('update:modelValue', undefined)"
      >
        <Ban :size="15" />
      </button>

      <!-- Presets -->
      <button
        v-for="preset in presets"
        :key="preset"
        type="button"
        :class="[swatch, value === preset.toLowerCase() && selected]"
        :style="{ background: preset }"
        :aria-pressed="value === preset.toLowerCase()"
        :aria-label="`Color ${preset}`"
        @click="emit('update:modelValue', preset)"
      ></button>

      <!-- Custom: native OS color picker under an opacity-0 input -->
      <label
        :class="[swatch, 'relative cursor-pointer', isCustom && selected]"
        :style="isCustom ? { background: value } : {
          background: 'conic-gradient(from 90deg, #ef5a44, #e9d49a, #4fc172, #4aa3e8, #6f48ff, #ef5a44)'
        }"
        title="Custom color"
      >
        <input
          type="color"
          class="absolute inset-0 cursor-pointer opacity-0"
          :value="value ?? '#6f48ff'"
          aria-label="Custom color"
          @input="onCustomInput"
        />
      </label>
    </div>
  </div>
</template>
