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
import ManaChip from '@/components/common/ManaChip.vue'
import OwnershipBadge from '@/components/common/OwnershipBadge.vue'
import StatCard from '@/components/common/StatCard.vue'
import ColorIdentityBar from '@/components/common/ColorIdentityBar.vue'
import CardTile from '@/components/common/CardTile.vue'
import { useTheme } from '@/composables/useTheme'
import { Sun, Moon, Check, Search, Library, Layers } from 'lucide-vue-next'

const { theme, toggleTheme } = useTheme()

const surfaces = ['bg', 'surface', 'surface-2', 'surface-3'] as const
const inks = ['ink', 'ink-soft', 'ink-faint'] as const
const manaKeys = ['W', 'U', 'B', 'R', 'G', 'C'] as const

const searchDemo = ref('')
const mode = ref<'quick' | 'advanced'>('quick')
const selectedMana = ref<string[]>(['W', 'R'])
function toggleMana(c: string) {
  selectedMana.value = selectedMana.value.includes(c)
    ? selectedMana.value.filter((x) => x !== c)
    : [...selectedMana.value, c]
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
  <div class="min-h-dvh overflow-y-auto bg-background text-foreground p-6 md:p-10">
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
            :type="card.type"
            :status="card.status"
            :location="(card as { location?: string }).location"
          />
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
