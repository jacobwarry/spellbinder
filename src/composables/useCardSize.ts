import { ref, watch, type Ref } from 'vue'

/**
 * A persisted card-size preference (grid tile min-width, in px). Each section
 * passes its own storage key + default, so Search / Decks / Box remember their
 * sizing independently while sharing one CardSizeControl.
 */
export function useCardSize(key: string, fallback: number): Ref<number> {
  let initial = fallback
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw != null ? parseInt(raw, 10) : NaN
    if (Number.isFinite(parsed)) initial = parsed
  } catch {
    // localStorage unavailable — fall back to the default.
  }

  const size = ref(initial)

  watch(size, (value) => {
    try {
      localStorage.setItem(key, String(value))
    } catch {
      // ignore persistence failures (private mode, quota, etc.)
    }
  })

  return size
}
