<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { manaSymbolUri } from '@/utils/manaSymbols'

// One MTG symbol rendered as its official Scryfall SVG. `symbol` is the inner text
// of a `{…}` token — a mana colour ("W"), tap ("T"), generic ("2"), hybrid ("W/U"),
// Phyrexian ("W/P"), etc. If the SVG can't load, we fall back to a neutral text pip
// so an unrecognised symbol degrades to the old behaviour rather than a broken image.
const props = withDefaults(defineProps<{ symbol: string; size?: number }>(), { size: 22 })

const failed = ref(false)
watch(() => props.symbol, () => { failed.value = false })

const src = computed(() => manaSymbolUri(props.symbol))
</script>

<template>
  <img
    v-if="!failed"
    :src="src"
    :alt="`{${symbol}}`"
    :width="size"
    :height="size"
    loading="lazy"
    class="inline-block shrink-0 select-none align-middle"
    :style="{ width: size + 'px', height: size + 'px' }"
    @error="failed = true"
  />
  <span
    v-else
    class="mana-fallback"
    :style="{ minWidth: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.5) + 'px' }"
  >{{ symbol }}</span>
</template>

<style scoped>
/* Fallback pip when a symbol's SVG is unavailable — a neutral round token. */
.mana-fallback {
  display: inline-grid;
  place-items: center;
  padding: 0 0.28em;
  border-radius: 9999px;
  background: var(--mana-c);
  color: #3a2f12;
  font-weight: 700;
  line-height: 1;
  vertical-align: middle;
  user-select: none;
}
</style>
