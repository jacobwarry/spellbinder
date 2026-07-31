<script setup lang="ts">
import { computed } from 'vue'
import { Library, Check, Star } from 'lucide-vue-next'
import OwnershipBadge from './OwnershipBadge.vue'
import { formatEur } from '@/utils/price'
import type { Mana, Ownership } from './types'

const props = defineProps<{
  name: string
  set: string
  number: string
  color: Mana
  status: Ownership
  rarity?: string
  location?: string
  /** Real card art (Scryfall). When absent, falls back to the colour gradient. */
  image?: string
  /** Latest EUR prices (Scryfall strings); • normal, ★ foil. Shown when present. */
  eur?: string | null
  eurFoil?: string | null
  /** Owned finishes — decide which price is emphasized vs muted (a card can own both). */
  ownsNonFoil?: boolean
  ownsFoil?: boolean
  /** Owned-foil (or an inherently-foil printing) → iridescent frame, like the binder/dashboard. */
  foil?: boolean
  /** Special finish treatment (Surge, Etched, …) shown after the set·№ line. */
  finishLabel?: string | null
}>()

// Prices: • normal, ★ foil, showing whichever value(s) exist.
const eurLabel = computed(() => formatEur(props.eur))
const eurFoilLabel = computed(() => formatEur(props.eurFoil))
const hasPrice = computed(() => !!eurLabel.value || !!eurFoilLabel.value)

// Colour-identity gradient — the loading / missing-art fallback when no image.
const ART: Record<Mana, string> = {
  R: 'radial-gradient(circle at 50% 30%,#ff6a52,#a32417)',
  U: 'radial-gradient(circle at 50% 30%,#54b0f0,#1c5996)',
  G: 'radial-gradient(circle at 50% 30%,#54cf80,#1f7a40)',
  B: 'radial-gradient(circle at 50% 30%,#6a5f80,#211a2e)',
  W: 'radial-gradient(circle at 50% 30%,#f6ecc4,#cdb478)',
  C: 'radial-gradient(circle at 50% 30%,#c3bdd2,#797295)'
}
</script>

<template>
  <div class="group @container relative overflow-hidden rounded-md border border-line bg-surface shadow-(--shadow-1) transition duration-200 hover:-translate-y-1 hover:shadow-(--shadow-2)">
    <div class="relative aspect-63/88 overflow-hidden rounded-b-md" :class="status !== 'owned' && 'grayscale brightness-90'">
      <img
        v-if="image"
        :src="image"
        :alt="name"
        loading="lazy"
        class="absolute inset-0 h-full w-full object-cover"
      />
      <div v-else class="absolute inset-0" :style="{ background: ART[color] }"></div>
    </div>
    <div class="p-3">
      <div class="line-clamp-2 min-h-10 text-sm font-semibold leading-tight">{{ name }}</div>
      <div class="mt-1 text-[11px] font-medium text-ink-faint tabular-nums">
        {{ set }} · {{ number.padStart(4, '0') }}<span v-if="rarity"> · {{ rarity }}</span><template v-if="finishLabel"> · <span class="font-semibold text-brand">{{ finishLabel.toUpperCase() }}</span></template>
      </div>
      <!-- single line always (truncate) so a long location never adds a row and skews tile height -->
      <div v-if="location" class="mt-1.5 flex items-center gap-1.5 text-xs text-brand tabular-nums">
        <Library :size="13" class="shrink-0" /><span class="min-w-0 truncate">{{ location }}</span>
      </div>
      <!-- ownership: a chip per owned finish (a card can own both), so owning the regular
           and the foil printing is visible at a glance; missing/skipped keep the badge.
           Never wraps; on narrow (small-zoom) tiles the chips collapse to icon-only so both
           finishes stay on one line and every tile keeps the same height. -->
      <div v-if="status === 'owned'" class="mt-2.5 flex items-center gap-1.5">
        <span
          v-if="ownsNonFoil"
          class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold @max-[199px]:px-1.5"
          style="color:var(--owned);background:var(--owned-soft)"
        >
          <Check :size="13" /><span class="@max-[199px]:hidden">Non-foil</span>
        </span>
        <span
          v-if="ownsFoil"
          class="foil-chip inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold @max-[199px]:px-1.5"
        >
          <Star :size="12" /><span class="@max-[199px]:hidden">Foil</span>
        </span>
      </div>
      <OwnershipBadge v-else :status="status" class="mt-2.5" />

      <!-- latest prices bottom-right, off the art so they never hide P/T (• normal, ★ foil).
           Always rendered — a priceless/missing card shows a €-,- placeholder so every
           tile keeps the same height. -->
      <div class="mt-2 flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-xs font-semibold tabular-nums text-foreground">
        <template v-if="hasPrice">
          <span v-if="eurLabel"><span class="text-ink-soft">•</span> {{ eurLabel }}</span>
          <span v-if="eurFoilLabel"><span class="text-ink-soft">★</span> {{ eurFoilLabel }}</span>
        </template>
        <span v-else class="text-ink-faint">€ -,-</span>
      </div>
    </div>
    <!-- owned-foil (or an inherently-foil printing) → iridescent frame around the whole tile -->
    <div v-if="foil" class="foil-frame rounded-md" aria-hidden="true"></div>
  </div>
</template>

<style scoped>
/* Owned-foil ownership chip — an iridescent pill (dark text) that reads as "foil" at a
   glance, pairing with the green Non-foil chip when both finishes are owned. */
.foil-chip {
  color: #1a1024;
  background: linear-gradient(
    95deg,
    hsl(330 95% 76%), hsl(280 90% 78%), hsl(200 92% 74%),
    hsl(150 82% 72%), hsl(48 96% 76%)
  );
}

/* Iridescent frame denoting an owned foil — a gradient ring drawn via mask so it
   hugs the tile's corners (matches the binder/dashboard foil treatment). The
   `rounded-md` utility on the element supplies the radius. */
.foil-frame {
  position: absolute;
  inset: 0;
  padding: 2px;
  pointer-events: none;
  background: conic-gradient(
    from 0deg,
    hsl(330 95% 62%), hsl(280 95% 66%), hsl(200 95% 60%),
    hsl(150 85% 58%), hsl(48 98% 62%), hsl(330 95% 62%)
  );
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}
</style>
