<script setup lang="ts">
import { useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/composables/useTheme'
import { Search, Library, Layers, Sun, Moon } from 'lucide-vue-next'

const route = useRoute()
const { theme, toggleTheme } = useTheme()

const nav = [
  { to: '/', label: 'Collection', icon: Search, match: (p: string) => p === '/' },
  { to: '/sets', label: 'Sets', icon: Library, match: (p: string) => p.startsWith('/sets') },
  { to: '/decks', label: 'Decks', icon: Layers, match: (p: string) => p.startsWith('/decks') }
]

const isActive = (m: (p: string) => boolean) => m(route.path)
</script>

<template>
  <div class="min-h-dvh bg-background text-foreground">
    <!-- Top bar (sticky) -->
    <header
      class="sticky top-0 z-20 flex items-center justify-between h-16 px-4 sm:px-6 border-b border-line
             bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] backdrop-blur-md"
    >
      <RouterLink to="/" class="flex items-center gap-3" aria-label="Spellbinder home">
        <span
          class="relative grid place-items-center w-9 h-9 rounded-[10px] shrink-0"
          style="background: var(--spectrum); box-shadow: 0 0 16px var(--accent-glow)"
        >
          <span class="absolute inset-[2px] rounded-[8px] bg-surface"></span>
          <svg class="relative w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" style="stroke: var(--accent)" stroke-width="1.8" aria-hidden="true">
            <path d="M5 5.2C5 4.5 5.5 4 6.2 4H19v15.5H7A2 2 0 0 1 5 17.5Z" />
            <path d="M5 17.5A2 2 0 0 1 7 15.5h12" />
          </svg>
        </span>
        <span class="font-display text-lg font-extrabold tracking-tight">Spellbinder</span>
      </RouterLink>

      <div class="flex items-center gap-1">
        <!-- Desktop / tablet inline nav -->
        <nav class="hidden sm:flex items-center gap-1">
          <RouterLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            :aria-current="isActive(item.match) ? 'page' : undefined"
            class="relative px-3.5 py-2 rounded-[10px] text-sm font-semibold transition-colors"
            :class="isActive(item.match)
              ? 'text-foreground bg-surface-2'
              : 'text-ink-soft hover:text-foreground hover:bg-surface-2'"
          >
            {{ item.label }}
            <span
              v-if="isActive(item.match)"
              class="absolute left-3.5 right-3.5 bottom-1 h-0.5 rounded bg-brand"
              aria-hidden="true"
            ></span>
          </RouterLink>
        </nav>

        <Button
          variant="secondary"
          size="icon"
          class="ml-1"
          :aria-label="`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`"
          @click="toggleTheme"
        >
          <Sun v-if="theme === 'dark'" />
          <Moon v-else />
        </Button>
      </div>
    </header>

    <!-- Content (document scroll). Bottom padding clears the fixed mobile nav. -->
    <main class="pb-[calc(3.5rem+env(safe-area-inset-bottom))] sm:pb-0">
      <RouterView />
    </main>

    <!-- Mobile bottom tab nav (fixed) -->
    <nav
      class="sm:hidden fixed inset-x-0 bottom-0 z-20 flex items-stretch border-t border-line
             bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] backdrop-blur-md"
      style="padding-bottom: env(safe-area-inset-bottom)"
      aria-label="Primary"
    >
      <RouterLink
        v-for="item in nav"
        :key="item.to"
        :to="item.to"
        :aria-current="isActive(item.match) ? 'page' : undefined"
        class="relative flex-1 flex flex-col items-center justify-center gap-1 min-h-[56px] text-xs transition-colors"
        :class="isActive(item.match) ? 'text-brand font-bold' : 'text-ink-soft font-semibold'"
      >
        <span
          v-if="isActive(item.match)"
          class="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-0.5 rounded-b bg-brand"
          aria-hidden="true"
        ></span>
        <component :is="item.icon" :size="20" :stroke-width="isActive(item.match) ? 2.4 : 2" />
        {{ item.label }}
      </RouterLink>
    </nav>
  </div>
</template>
