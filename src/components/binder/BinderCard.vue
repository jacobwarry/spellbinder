<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import type { Binder } from '@/types'
import { getBinderImage } from '@/utils/binderImages'
import { Pencil, Trash2 } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  binder: Binder
  plannedCards?: number
  ownedCards?: number
  selected?: boolean
  showActions?: boolean
}>(), {
  showActions: true
})

defineEmits<{
  edit: [binder: Binder]
  remove: [binder: Binder]
}>()

const capacity = computed(() => {
  if (props.binder.type === 'box') {
    return '∞'  // Infinity symbol
  }
  return props.binder.pageCount * props.binder.slotsPerPage
})

const fillStatus = computed(() => {
  if (props.plannedCards === undefined) return null
  // Boxes never overflow
  if (props.binder.type === 'box') return 'partial'

  const cap = capacity.value as number
  if (props.plannedCards > cap) return 'overflow'
  if (props.plannedCards === cap) return 'full'
  return 'partial'
})

const ownedPercentage = computed(() => {
  if (props.plannedCards === undefined || props.plannedCards === 0) return 0
  return Math.round(((props.ownedCards ?? 0) / props.plannedCards) * 100)
})

// Cover image handling
const coverImageUrl = ref<string | null>(null)

async function loadCoverImage() {
  if (props.binder.hasCoverImage) {
    try {
      const url = await getBinderImage(props.binder.id)
      coverImageUrl.value = url
    } catch (error) {
      console.error('Failed to load binder cover image:', error)
    }
  }
}

watch(() => props.binder.hasCoverImage, () => {
  if (props.binder.hasCoverImage) {
    loadCoverImage()
  } else {
    if (coverImageUrl.value) {
      URL.revokeObjectURL(coverImageUrl.value)
    }
    coverImageUrl.value = null
  }
}, { immediate: true })

onMounted(() => {
  loadCoverImage()
})

onUnmounted(() => {
  if (coverImageUrl.value) {
    URL.revokeObjectURL(coverImageUrl.value)
  }
})
</script>

<template>
  <div
    class="relative flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors"
    :class="selected ? 'border-brand bg-(--accent-soft)' : 'border-line bg-surface hover:border-line-strong'"
  >
    <div v-if="coverImageUrl" class="h-21 w-15 shrink-0 overflow-hidden rounded border border-line bg-surface-2">
      <img :src="coverImageUrl" :alt="`${binder.name} cover`" class="h-full w-full object-cover" />
    </div>
    <div class="min-w-0 flex-1" :class="showActions && 'pr-14'">
      <h3 class="flex items-center gap-2 text-sm font-semibold">
        <span class="truncate">{{ binder.name }}</span>
        <span class="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-soft">{{ binder.type === 'box' ? 'Box' : 'Binder' }}</span>
      </h3>
      <p class="mt-0.5 text-sm text-ink-soft tabular-nums">
        <template v-if="plannedCards !== undefined">
          <span
            class="font-semibold"
            :class="fillStatus === 'overflow' ? 'text-skipped' : fillStatus === 'full' ? 'text-owned' : 'text-foreground'"
          >{{ plannedCards }}</span>
          <template v-if="binder.type === 'binder'"> / {{ capacity }} cards ({{ binder.pageCount }} pages)</template>
          <template v-else> cards</template>
        </template>
        <template v-else>
          <template v-if="binder.type === 'binder'">{{ capacity }} cards ({{ binder.pageCount }} pages)</template>
          <template v-else>Unlimited capacity</template>
        </template>
      </p>
      <p v-if="plannedCards !== undefined && plannedCards > 0" class="mt-1 text-xs text-ink-faint tabular-nums">
        <span class="font-medium" :class="ownedPercentage === 100 && 'text-owned'">{{ ownedCards ?? 0 }}</span> / {{ plannedCards }} owned
      </p>
    </div>
    <div v-if="showActions" class="absolute right-3 top-3 flex gap-1">
      <button
        class="grid h-7 w-7 place-items-center rounded-md border border-line text-ink-soft outline-none transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        title="Edit"
        aria-label="Edit storage"
        @click.stop="$emit('edit', binder)"
      >
        <Pencil :size="14" />
      </button>
      <button
        class="grid h-7 w-7 place-items-center rounded-md border border-line text-ink-soft outline-none transition-colors hover:bg-(--skipped-soft) hover:text-skipped focus-visible:ring-2 focus-visible:ring-ring"
        title="Remove"
        aria-label="Remove storage"
        @click.stop="$emit('remove', binder)"
      >
        <Trash2 :size="14" />
      </button>
    </div>
  </div>
</template>
