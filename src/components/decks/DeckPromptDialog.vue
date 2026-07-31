<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { ScryfallCard } from '@/types'
import {
  buildPool,
  buildDeckPrompt,
  cardIdentity,
  estimateTokens,
  isCommanderCandidate
} from '@/utils/deckPrompt'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { buildCollectionExport, downloadCollectionExport } from '@/utils/collectionExport'
import { Copy, Check, TriangleAlert, FileJson } from 'lucide-vue-next'

const props = defineProps<{
  /** Every card the collection reports as owned. The host resolves ownership. */
  ownedCards: ScryfallCard[]
}>()

const emit = defineEmits<{ close: [] }>()

const open = ref(true)
watch(open, (isOpen) => {
  if (!isOpen) emit('close')
})

// ---- Commander picker: owned legendary creatures, deduped across printings.
const commanders = computed(() => {
  const byIdentity = new Map<string, ScryfallCard>()
  for (const card of props.ownedCards) {
    if (!isCommanderCandidate(card)) continue
    const identity = cardIdentity(card)
    if (!byIdentity.has(identity)) byIdentity.set(identity, card)
  }
  return [...byIdentity.values()].sort((a, b) => a.name.localeCompare(b.name))
})

const selectedIdentity = ref<string>('')
const commander = computed(() =>
  commanders.value.find((c) => cardIdentity(c) === selectedIdentity.value)
)

const notes = ref('')
const stripReminderText = ref(true)

const pool = computed(() => {
  if (!commander.value) return []
  return buildPool(props.ownedCards, {
    colorIdentity: commander.value.color_identity ?? [],
    excludeIdentity: cardIdentity(commander.value)
  })
})

const prompt = computed(() => {
  if (!commander.value) return ''
  return buildDeckPrompt(commander.value, pool.value, {
    notes: notes.value,
    stripReminderText: stripReminderText.value
  })
})

const tokens = computed(() => estimateTokens(prompt.value))
// Comfortably inside a claude.ai conversation; past this the paste is worth trimming.
const isLarge = computed(() => tokens.value > 60_000)

/** Whole-collection snapshot for the local MCP server — independent of the commander picked. */
function exportForMcp() {
  downloadCollectionExport(buildCollectionExport(props.ownedCards))
}

const copied = ref(false)
async function copyPrompt() {
  if (!prompt.value) return
  await navigator.clipboard.writeText(prompt.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <Dialog v-model:open="open" size="lg" title="Build a deck with Claude">
    <div class="flex flex-col gap-5">
      <p class="text-sm text-ink-soft">
        Pick a commander and copy the prompt into a Claude conversation. It includes every owned
        card that's legal in that commander's colour identity, so Claude picks from what you
        actually have instead of recalling cards from memory.
      </p>

      <p v-if="commanders.length === 0" class="py-4 text-center text-sm text-ink-soft">
        No owned legendary creatures found. Mark some cards as owned first.
      </p>

      <template v-else>
        <!-- Labels wrap their control: Select renders a div wrapper, so `for`/`id`
             would bind to the wrapper rather than the underlying <select>. -->
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-ink-soft">Commander</span>
          <Select v-model="selectedIdentity">
            <option value="">Select a commander…</option>
            <option v-for="c in commanders" :key="cardIdentity(c)" :value="cardIdentity(c)">
              {{ c.name }}
            </option>
          </Select>
        </label>

        <template v-if="commander">
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-ink-soft">
              Notes <span class="font-normal text-ink-faint">(optional)</span>
            </span>
            <Input
              v-model="notes"
              placeholder="e.g. lean sacrifice, avoid infinite combos, budget-friendly"
            />
          </label>

          <label class="flex items-center gap-2 text-sm text-ink-soft">
            <input
              v-model="stripReminderText"
              type="checkbox"
              class="h-4 w-4 rounded border-input accent-(--accent)"
            />
            Strip reminder text (smaller paste, no loss of meaning)
          </label>

          <div class="flex items-center justify-between rounded-md border border-line bg-surface-2 p-3">
            <span class="text-sm text-ink-soft">
              <span class="font-medium text-foreground tabular-nums">{{ pool.length }}</span>
              legal cards in pool
            </span>
            <span class="text-xs tabular-nums text-ink-faint">~{{ tokens.toLocaleString() }} tokens</span>
          </div>

          <p v-if="isLarge" class="flex items-start gap-2 text-xs text-ink-soft">
            <TriangleAlert :size="14" class="mt-0.5 shrink-0 text-brand" />
            <span>
              That's a big paste. Claude will accept it as an attachment, but narrowing the
              collection first will give sharper results.
            </span>
          </p>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-ink-soft">Preview</span>
            <textarea
              :value="prompt"
              readonly
              rows="10"
              class="w-full resize-none rounded-md border border-input bg-surface-2 p-2 font-mono text-xs text-foreground outline-none"
            />
          </label>
        </template>
      </template>
    </div>

    <template #footer>
      <Button
        v-if="ownedCards.length > 0"
        variant="ghost"
        class="mr-auto"
        title="Snapshot the whole collection as JSON for the local MCP server"
        @click="exportForMcp"
      >
        <FileJson :size="16" /> Export JSON
      </Button>
      <Button variant="ghost" @click="open = false">Close</Button>
      <Button :disabled="!commander || pool.length === 0" @click="copyPrompt">
        <Check v-if="copied" :size="16" />
        <Copy v-else :size="16" />
        {{ copied ? 'Copied' : 'Copy prompt' }}
      </Button>
    </template>
  </Dialog>
</template>
