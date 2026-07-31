<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { ScryfallCard } from '@/types'
import { getCachedCards, fetchSetCards } from '@/api/scryfall'
import { useCardmarketSetsStore } from '@/stores'
import { buildCardmarketExport } from '@/utils/cardmarket'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Copy, Check, RotateCcw } from 'lucide-vue-next'

const props = defineProps<{
  missingIds: string[]
  segmentName: string
}>()

const emit = defineEmits<{ close: [] }>()

const cardmarketSetsStore = useCardmarketSetsStore()

const open = ref(true)
watch(open, (isOpen) => {
  if (!isOpen) emit('close')
})

const loading = ref(true)
const cards = ref<ScryfallCard[]>([])
const setLists = ref<Map<string, ScryfallCard[]>>(new Map())

onMounted(async () => {
  const cardMap = await getCachedCards(props.missingIds)
  cards.value = props.missingIds
    .map((id) => cardMap.get(id))
    .filter((c): c is ScryfallCard => c !== undefined)

  // Full printing list per involved set (cache-first) so version indices are computed
  // against the whole sibling pool, not just the missing cards.
  const codes = [...new Set(cards.value.map((c) => c.set).filter(Boolean))]
  const entries = await Promise.all(
    codes.map(async (code) => [code, await fetchSetCards(code)] as const)
  )
  setLists.value = new Map(entries)
  loading.value = false
})

// Recomputes as the user edits names (store.overrides is reactive).
const result = computed(() =>
  buildCardmarketExport(cards.value, setLists.value, cardmarketSetsStore.overrides)
)
const buckets = computed(() => result.value.buckets)
const lines = computed(() => result.value.lines)

function onNameChange(key: string, event: Event, heuristic: string) {
  cardmarketSetsStore.set(key, (event.target as HTMLInputElement).value, heuristic)
}

const copied = ref(false)
async function copyLines() {
  if (lines.value.length === 0) return
  await navigator.clipboard.writeText(lines.value.join('\n'))
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <Dialog v-model:open="open" size="lg" title="Copy missing · Cardmarket">
    <div class="flex flex-col gap-5">
      <p class="text-sm text-ink-soft">
        Missing cards from <span class="font-medium text-foreground">{{ segmentName }}</span>.
        Cardmarket splits sets differently than Scryfall, so these expansion names are a best
        guess. Correct any that don't match Cardmarket and it'll remember them. Paste the list into
        a Cardmarket wants list (Add deck list).
      </p>

      <p v-if="loading" class="py-4 text-center text-sm text-ink-soft">Resolving Cardmarket sets…</p>

      <template v-else-if="cards.length === 0">
        <p class="py-4 text-center text-sm text-ink-soft">No missing cards to export.</p>
      </template>

      <template v-else>
        <!-- Expansion name overrides, one row per distinct Cardmarket expansion -->
        <div class="flex flex-col gap-2">
          <div class="flex items-baseline justify-between">
            <label class="text-sm font-medium text-ink-soft">Cardmarket expansions</label>
            <span class="text-xs tabular-nums text-ink-faint">{{ lines.length }} cards</span>
          </div>
          <div
            v-for="bucket in buckets"
            :key="bucket.key"
            class="flex items-center gap-2 rounded-md border border-line bg-surface-2 p-2"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <Input
                  :value="bucket.name"
                  class="h-8 flex-1"
                  :aria-label="`Cardmarket expansion for ${bucket.setName}`"
                  @change="onNameChange(bucket.key, $event, bucket.defaultName)"
                />
                <button
                  v-if="bucket.name !== bucket.defaultName"
                  type="button"
                  class="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-line text-ink-soft outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  title="Reset to detected name"
                  aria-label="Reset to detected name"
                  @click="cardmarketSetsStore.clear(bucket.key)"
                >
                  <RotateCcw :size="14" />
                </button>
              </div>
              <p class="mt-1 truncate text-xs tabular-nums text-ink-faint">
                {{ bucket.setName }} ({{ bucket.setCode.toUpperCase() }})
                <span v-if="bucket.variant === 'extras'" class="text-brand">· Extras</span>
                · {{ bucket.count }} {{ bucket.count === 1 ? 'card' : 'cards' }}
              </p>
            </div>
          </div>
        </div>

        <!-- Live preview of the exact lines that will be copied -->
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-ink-soft">Preview</label>
          <textarea
            :value="lines.join('\n')"
            readonly
            rows="8"
            class="w-full resize-none rounded-md border border-input bg-surface-2 p-2 font-mono text-xs text-foreground outline-none"
          />
        </div>
      </template>
    </div>

    <template #footer>
      <Button variant="ghost" @click="open = false">Close</Button>
      <Button :disabled="loading || lines.length === 0" @click="copyLines">
        <Check v-if="copied" :size="16" />
        <Copy v-else :size="16" />
        {{ copied ? 'Copied' : 'Copy to clipboard' }}
      </Button>
    </template>
  </Dialog>
</template>
