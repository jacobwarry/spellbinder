<script setup lang="ts">
/**
 * Dev-only design-system gallery. Audits tokens + primitives + Spellbinder
 * atoms in both themes in isolation. Not shipped to production (DEV-gated route).
 */
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { SegmentedControl } from '@/components/ui/segmented'
import { Dialog } from '@/components/ui/dialog'
import CardActionSheet from '@/components/binder/CardActionSheet.vue'
import BinderSlot from '@/components/binder/BinderSlot.vue'
import BinderSpread from '@/components/binder/BinderSpread.vue'
import type { BinderSlotCard } from '@/components/common/types'
import ManaChip from '@/components/common/ManaChip.vue'
import OwnershipBadge from '@/components/common/OwnershipBadge.vue'
import StatCard from '@/components/common/StatCard.vue'
import ColorIdentityBar from '@/components/common/ColorIdentityBar.vue'
import CardTile from '@/components/common/CardTile.vue'
import CardSizeControl from '@/components/common/CardSizeControl.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import { useTheme } from '@/composables/useTheme'
import { Sun, Moon, Check, Search, Library, Layers } from 'lucide-vue-next'

const { theme, toggleTheme } = useTheme()

const surfaces = ['bg', 'surface', 'surface-2', 'surface-3'] as const
const inks = ['ink', 'ink-soft', 'ink-faint'] as const
const manaKeys = ['W', 'U', 'B', 'R', 'G', 'C'] as const

const searchDemo = ref('')
const cardSizeDemo = ref(160)
const dialogOpen = ref(false)
const actionSheetOpen = ref(false)
const demoSpacer = ref(1)
const mode = ref<'quick' | 'advanced'>('quick')
const selectedMana = ref<string[]>(['W', 'R'])
function toggleMana(c: string) {
  selectedMana.value = selectedMana.value.includes(c)
    ? selectedMana.value.filter((x) => x !== c)
    : [...selectedMana.value, c]
}

const demoColors = ['R', 'U', 'G', 'B', 'W', 'C'] as const
const demoStatuses = ['owned', 'missing', 'skipped'] as const
const demoNames = ['Lightning Bolt', 'Counterspell', 'Llanowar Elves', 'Sol Ring', 'Wrath of God', 'Demonic Tutor']
const demoSets = ['LEA', 'MH2', 'C21', 'STA', 'M19', 'LEB']
const binderPages: (BinderSlotCard | null)[][] = Array.from({ length: 6 }, (_, p) =>
  Array.from({ length: 9 }, (_, s) => {
    const i = p * 9 + s
    if (i % 7 === 3) return null
    return {
      name: demoNames[i % 6]!,
      set: demoSets[i % 6]!,
      number: String(((i * 13) % 320) + 1).padStart(4, '0'),
      color: demoColors[i % 6]!,
      status: demoStatuses[i % 3]!,
      rarity: ['C', 'U', 'R', 'M'][i % 4]!
    }
  })
)
const binderSelectMsg = ref('')
function onBinderSelect(page: number, slot: number) {
  binderSelectMsg.value = `Selected page ${page}, slot ${slot + 1}`
  actionSheetOpen.value = true
}

const counts = { w: 377, u: 592, b: 511, r: 458, g: 484, c: 269 }
const sampleCards = [
  { name: 'Lightning Bolt', set: 'LEA', number: '161', color: 'R', rarity: 'C', type: 'Instant', status: 'owned', location: 'Binder A · P3 · S2' },
  { name: 'Counterspell', set: 'MH2', number: '267', color: 'U', rarity: 'C', type: 'Instant', status: 'missing' },
  { name: 'Swords to Plowshares', set: 'STA', number: '011', color: 'W', rarity: 'U', type: 'Instant', status: 'skipped' },
  { name: 'Sol Ring', set: 'C21', number: '044', color: 'C', rarity: 'U', type: 'Artifact', status: 'owned', location: 'Box · Artifacts' }
] as const
</script>

<template>
  <div class="bg-background text-foreground p-6 md:p-10">
    <div class="max-w-5xl mx-auto flex flex-col gap-12">
      <!-- header -->
      <header class="flex items-center justify-between">
        <div>
          <h1 class="font-display text-3xl font-extrabold tracking-tight">Spellbinder Styleguide</h1>
          <p class="text-ink-soft mt-1">Tokens, primitives &amp; atoms in <strong>{{ theme }}</strong> mode</p>
        </div>
        <Button variant="secondary" size="icon" :aria-label="`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`" @click="toggleTheme">
          <Sun v-if="theme === 'dark'" />
          <Moon v-else />
        </Button>
      </header>

      <!-- typography -->
      <section class="flex flex-col gap-3">
        <h2 class="font-display text-xl font-bold">Typography</h2>
        <p class="font-display text-4xl font-extrabold tracking-tight">Sora display 800</p>
        <p class="text-base">Inter body — the quick brown fox jumps over the lazy dog. 0123456789</p>
        <p class="text-ink-soft text-sm tabular-nums">Tabular numerals · LEA 161 · Binder A · P3 · S2</p>
      </section>

      <!-- buttons -->
      <section class="flex flex-col gap-4">
        <h2 class="font-display text-xl font-bold">Buttons</h2>
        <div class="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
          <Button disabled>Disabled</Button>
          <Button size="icon" aria-label="Confirm"><Check /></Button>
        </div>
      </section>

      <!-- inputs + segmented -->
      <section class="flex flex-col gap-4">
        <h2 class="font-display text-xl font-bold">Inputs &amp; controls</h2>
        <div class="flex flex-col gap-3 max-w-md">
          <label class="text-sm font-medium text-ink-soft" for="sg-search">Search by card name</label>
          <Input id="sg-search" v-model="searchDemo" placeholder="Lightning Bolt…" />
          <SegmentedControl
            v-model="mode"
            :options="[{ value: 'quick', label: 'Quick Search' }, { value: 'advanced', label: 'Advanced Search' }]"
          />
        </div>
      </section>

      <!-- card-size control -->
      <section class="flex flex-col gap-4">
        <h2 class="font-display text-xl font-bold">Card size control <span class="text-ink-faint text-sm font-normal">— drag to resize grid cards</span></h2>
        <div class="flex flex-wrap items-center gap-6">
          <CardSizeControl v-model="cardSizeDemo" :min="110" :max="240" :step="10" />
          <span class="text-sm tabular-nums text-ink-soft">{{ cardSizeDemo }}px</span>
        </div>
        <div class="grid gap-3 rounded-xl border border-line bg-surface p-4" :style="{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardSizeDemo}px, 1fr))` }">
          <div
            v-for="i in 6"
            :key="i"
            class="aspect-63/88 rounded-[6px] border border-line bg-surface-2"
          ></div>
        </div>
      </section>

      <!-- mana chips (filters) -->
      <section class="flex flex-col gap-4">
        <h2 class="font-display text-xl font-bold">Mana chips (filters)</h2>
        <div class="flex gap-2">
          <button
            v-for="c in manaKeys"
            :key="c"
            type="button"
            :aria-pressed="selectedMana.includes(c)"
            class="rounded-full transition-transform hover:-translate-y-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            @click="toggleMana(c)"
          >
            <ManaChip :color="c" :selected="selectedMana.includes(c)" />
          </button>
        </div>
      </section>

      <!-- badges / ownership -->
      <section class="flex flex-col gap-4">
        <h2 class="font-display text-xl font-bold">Badges &amp; ownership</h2>
        <div class="flex flex-wrap items-center gap-3">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <span class="w-px h-5 bg-line mx-1"></span>
          <OwnershipBadge status="owned" />
          <OwnershipBadge status="missing" />
          <OwnershipBadge status="skipped" />
        </div>
      </section>

      <!-- stat cards -->
      <section class="flex flex-col gap-4">
        <h2 class="font-display text-xl font-bold">Stat cards</h2>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Cards tracked" :value="3418" :icon="Search" />
          <StatCard label="Owned" :value="2691" sub="78%" :icon="Check" />
          <StatCard label="Binders" :value="7" :icon="Library" />
          <StatCard label="Decks linked" :value="12" :icon="Layers" />
        </div>
      </section>

      <!-- color identity bar (earned spectrum) -->
      <section class="flex flex-col gap-4">
        <h2 class="font-display text-xl font-bold">Color identity bar <span class="text-ink-faint text-sm font-normal">— the earned spectrum</span></h2>
        <ColorIdentityBar :counts="counts" />
      </section>

      <!-- card tiles -->
      <section class="flex flex-col gap-4">
        <h2 class="font-display text-xl font-bold">Card tiles</h2>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <CardTile
            v-for="card in sampleCards"
            :key="card.name"
            :name="card.name"
            :set="card.set"
            :number="card.number"
            :color="card.color"
            :rarity="card.rarity"
            :status="card.status"
            :location="(card as { location?: string }).location"
          />
        </div>
      </section>

      <!-- loading spinner -->
      <section class="flex flex-col gap-4">
        <h2 class="font-display text-xl font-bold">Loading spinner <span class="text-ink-faint text-sm font-normal">— planeswalker mark, winds up each rotation</span></h2>
        <div class="flex flex-wrap items-center gap-10 rounded-xl border border-line bg-surface p-6">
          <LoadingSpinner :size="32" label="Small" />
          <LoadingSpinner label="Loading cards…" />
          <LoadingSpinner :size="72" label="Large" />
        </div>
      </section>

      <!-- skeleton -->
      <section class="flex flex-col gap-4">
        <h2 class="font-display text-xl font-bold">Skeletons</h2>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div v-for="n in 4" :key="n" class="rounded-md border border-line bg-surface overflow-hidden">
            <Skeleton class="aspect-63/88 rounded-none" />
            <div class="p-3 flex flex-col gap-2">
              <Skeleton class="h-3 w-2/3" />
              <Skeleton class="h-3 w-1/3" />
            </div>
          </div>
        </div>
      </section>

      <!-- binder slot + action sheet -->
      <section class="flex flex-col gap-4">
        <h2 class="font-display text-xl font-bold">Binder slot + action sheet</h2>
        <div class="grid max-w-md grid-cols-6 gap-3">
          <BinderSlot :slot-number="1" :card="{ name: 'Lightning Bolt', set: 'LEA', number: '161', color: 'R', status: 'owned', rarity: 'C' }" @select="actionSheetOpen = true" />
          <BinderSlot :slot-number="2" :card="{ name: 'Counterspell', set: 'MH2', number: '267', color: 'U', status: 'missing' }" />
          <BinderSlot :slot-number="3" :card="{ name: 'Swords to Plowshares', set: 'STA', number: '011', color: 'W', status: 'skipped' }" />
          <BinderSlot :slot-number="4" />
          <BinderSlot :slot-number="5" :card="{ name: 'Dark Ritual', set: 'LEB', number: '119', color: 'B', status: 'owned' }" />
          <BinderSlot :slot-number="6" :card="{ name: 'Sol Ring', set: 'C21', number: '044', color: 'C', status: 'owned' }" />
        </div>
        <Button variant="secondary" class="self-start" @click="actionSheetOpen = true">Open card action sheet</Button>
        <CardActionSheet
          v-model:open="actionSheetOpen"
          name="Lightning Bolt"
          set="LEA"
          number="161"
          rarity="Common"
          color="R"
          status="owned"
          location="Binder A · P3 · S2"
          :spacer-count="demoSpacer"
          @add-spacer="demoSpacer++"
          @remove-spacer="demoSpacer = Math.max(0, demoSpacer - 1)"
        />
      </section>

      <!-- binder spread -->
      <section class="flex flex-col gap-4">
        <h2 class="font-display text-xl font-bold">Binder spread <span class="text-ink-faint text-sm font-normal">— resize the window to feel spread ↔ single</span></h2>
        <p v-if="binderSelectMsg" class="text-sm text-ink-soft">{{ binderSelectMsg }}</p>
        <div class="h-150 overflow-hidden rounded-lg border border-line">
          <BinderSpread
            name="Binder A — Mythics"
            :page-count="6"
            :slots-per-page="9"
            :pages="binderPages"
            :paused="actionSheetOpen"
            @select="onBinderSelect"
          />
        </div>
      </section>

      <!-- dialog -->
      <section class="flex flex-col gap-4">
        <h2 class="font-display text-xl font-bold">Dialog</h2>
        <div>
          <Button variant="secondary" @click="dialogOpen = true">Open dialog</Button>
          <Dialog v-model:open="dialogOpen" title="Import deck from Archidekt" description="Paste an Archidekt deck URL or deck ID.">
            <Input placeholder="https://archidekt.com/decks/123456/my-deck" />
            <template #footer>
              <Button variant="ghost" @click="dialogOpen = false">Cancel</Button>
              <Button @click="dialogOpen = false">Import</Button>
            </template>
          </Dialog>
        </div>
      </section>

      <!-- surfaces / text -->
      <section class="flex flex-col gap-4">
        <h2 class="font-display text-xl font-bold">Surfaces &amp; text</h2>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div v-for="s in surfaces" :key="s" class="rounded-md border border-line p-4" :style="{ background: `var(--${s})` }">
            <span class="text-xs text-ink-faint">--{{ s }}</span>
          </div>
        </div>
        <div class="flex flex-wrap gap-4">
          <span v-for="i in inks" :key="i" :class="`text-${i}`">text-{{ i }}</span>
        </div>
      </section>

      <!-- elevation -->
      <section class="flex flex-col gap-4 pb-10">
        <h2 class="font-display text-xl font-bold">Elevation</h2>
        <div class="flex flex-wrap gap-6">
          <div class="rounded-lg bg-surface p-6 text-sm text-ink-soft" style="box-shadow:var(--shadow-1)">shadow-1</div>
          <div class="rounded-lg bg-surface p-6 text-sm text-ink-soft" style="box-shadow:var(--shadow-2)">shadow-2</div>
        </div>
      </section>
    </div>
  </div>
</template>
