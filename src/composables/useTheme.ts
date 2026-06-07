import { ref, watch } from 'vue'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'spellbinder-theme'

// Shared singleton state so every caller reads/writes the same theme.
const theme = ref<Theme>('dark')
let initialized = false

function apply(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark')
}

/**
 * Resolve and apply the initial theme, then keep <html>.dark + localStorage in
 * sync. Call once at app startup (main.ts) before mount. Idempotent.
 */
export function initTheme() {
  if (initialized) return
  initialized = true

  const saved = localStorage.getItem(STORAGE_KEY)
  theme.value =
    saved === 'light' || saved === 'dark'
      ? saved
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'

  apply(theme.value)
  watch(theme, (t) => {
    localStorage.setItem(STORAGE_KEY, t)
    apply(t)
  })
}

export function useTheme() {
  function setTheme(t: Theme) {
    theme.value = t
  }
  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }
  return { theme, setTheme, toggleTheme }
}
