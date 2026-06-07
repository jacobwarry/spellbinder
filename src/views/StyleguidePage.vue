<script setup lang="ts">
/**
 * Dev-only design-system gallery (P0). Lets a reviewer audit tokens + primitives
 * in both themes in isolation. Not shipped to production (route is DEV-gated).
 */
import { Button } from '@/components/ui/button'
import { useTheme } from '@/composables/useTheme'
import { Sun, Moon, Check, X } from 'lucide-vue-next'

const { theme, toggleTheme } = useTheme()

const surfaces = ['bg', 'surface', 'surface-2', 'surface-3'] as const
const inks = ['ink', 'ink-soft', 'ink-faint'] as const
const mana = [
  { k: 'W', c: 'var(--mana-w)' },
  { k: 'U', c: 'var(--mana-u)' },
  { k: 'B', c: 'var(--mana-b)' },
  { k: 'R', c: 'var(--mana-r)' },
  { k: 'G', c: 'var(--mana-g)' },
  { k: 'C', c: 'var(--mana-c)' }
]
</script>

<template>
  <div class="min-h-dvh bg-background text-foreground p-6 md:p-10">
    <div class="max-w-5xl mx-auto flex flex-col gap-12">
      <!-- header -->
      <header class="flex items-center justify-between">
        <div>
          <h1 class="font-display text-3xl font-extrabold tracking-tight">Spellbinder Styleguide</h1>
          <p class="text-ink-soft mt-1">P0 foundation — tokens &amp; primitives in <strong>{{ theme }}</strong> mode</p>
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
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button>Default</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" aria-label="Confirm"><Check /></Button>
        </div>
      </section>

      <!-- surfaces -->
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

      <!-- accent + status -->
      <section class="flex flex-col gap-4">
        <h2 class="font-display text-xl font-bold">Accent &amp; status</h2>
        <div class="flex flex-wrap gap-3 items-center">
          <span class="rounded-md px-3 py-2 text-sm font-semibold bg-primary text-primary-foreground">accent / on-accent</span>
          <span class="rounded-full px-3 py-1 text-xs font-semibold inline-flex items-center gap-1.5" style="color:var(--owned);background:var(--owned-soft)"><Check :size="13" />Owned</span>
          <span class="rounded-full px-3 py-1 text-xs font-semibold inline-flex items-center gap-1.5" style="color:var(--skipped);background:var(--skipped-soft)"><X :size="13" />Skipped</span>
          <span class="rounded-full px-3 py-1 text-xs font-semibold bg-surface-2 text-missing">Missing</span>
        </div>
      </section>

      <!-- mana + spectrum -->
      <section class="flex flex-col gap-4">
        <h2 class="font-display text-xl font-bold">Mana &amp; spectrum (data signature)</h2>
        <div class="flex gap-2">
          <span
            v-for="m in mana"
            :key="m.k"
            class="w-9 h-9 rounded-full grid place-items-center text-xs font-bold"
            :style="{ background: m.c, color: m.k === 'W' || m.k === 'C' ? '#3a2f12' : '#fff' }"
          >{{ m.k }}</span>
        </div>
        <div class="h-3 rounded-full" style="background:var(--spectrum)" aria-hidden="true"></div>
        <p class="text-ink-faint text-sm">The spectrum is reserved for true W/U/B/R/G data — never buttons or ambient decoration.</p>
      </section>

      <!-- elevation -->
      <section class="flex flex-col gap-4">
        <h2 class="font-display text-xl font-bold">Elevation</h2>
        <div class="flex flex-wrap gap-6">
          <div class="rounded-lg bg-surface p-6 text-sm text-ink-soft" style="box-shadow:var(--shadow-1)">shadow-1</div>
          <div class="rounded-lg bg-surface p-6 text-sm text-ink-soft" style="box-shadow:var(--shadow-2)">shadow-2</div>
        </div>
      </section>
    </div>
  </div>
</template>
