<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ValuePoint } from '@/utils/value'
import { formatEurAmount } from '@/utils/price'

// Minimal, self-contained SVG line chart of collection value over time (no external lib,
// CSP-clean). The path is drawn in a normalized 100×100 viewBox stretched to fit, with a
// non-scaling stroke so it stays crisp. Because that viewBox is stretched
// (preserveAspectRatio="none"), an SVG <circle> would render as an ellipse — so each data
// point is an HTML dot (pip) overlaid by percentage, hoverable for a value/date tooltip.
// Matches CardPriceChart's interaction. Fills its container height (the dashboard sizes it).
const props = defineProps<{ series: ValuePoint[] }>()

const hasEnough = computed(() => props.series.length >= 2)

const bounds = computed(() => {
  const vals = props.series.map(p => p.value)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  return { min, max, span: max - min || 1 }
})

const PAD = 8 // vertical breathing room, in normalized units
function xFor(i: number): number {
  const n = props.series.length
  return n < 2 ? 0 : (i / (n - 1)) * 100
}
function yFor(value: number): number {
  const { min, span } = bounds.value
  return 100 - PAD - ((value - min) / span) * (100 - 2 * PAD)
}

const linePath = computed(() => {
  const s = props.series
  if (s.length < 2) return ''
  return s.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(2)},${yFor(p.value).toFixed(2)}`).join(' ')
})
const areaPath = computed(() => (linePath.value ? `${linePath.value} L100,100 L0,100 Z` : ''))

// Local calendar day "YYYY-MM-DD" → a readable label ("12 Jul 2026").
function formatDate(d: string): string {
  const dt = new Date(`${d}T00:00:00`)
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

interface Dot {
  key: string
  xPct: number
  yPct: number
  valueLabel: string
  dateLabel: string
  /** Change vs the previous recorded day; null for the first point. */
  change: number | null
  tipAlign: 'left' | 'center' | 'right'
  tipBelow: boolean
}
const dots = computed<Dot[]>(() => {
  if (props.series.length < 2) return []
  return props.series.map((p, i) => {
    const xPct = xFor(i)
    const yPct = yFor(p.value)
    const prev = i > 0 ? props.series[i - 1] : null
    return {
      key: p.date,
      xPct,
      yPct,
      valueLabel: formatEurAmount(p.value),
      dateLabel: formatDate(p.date),
      change: prev ? p.value - prev.value : null,
      // Keep the tooltip on-canvas near the edges / top.
      tipAlign: xPct < 18 ? 'left' : xPct > 82 ? 'right' : 'center',
      tipBelow: yPct < 24
    }
  })
})

// The dot currently hovered or focused; drives the tooltip.
const active = ref<Dot | null>(null)
const tipStyle = computed(() => {
  const a = active.value
  if (!a) return {}
  const tx = a.tipAlign === 'left' ? '0' : a.tipAlign === 'right' ? '-100%' : '-50%'
  const ty = a.tipBelow ? '12px' : 'calc(-100% - 12px)'
  return { left: `${a.xPct}%`, top: `${a.yPct}%`, transform: `translate(${tx}, ${ty})` }
})

// Change vs the previous day, as a display descriptor. Sub-cent counts as unchanged.
const activeDelta = computed(() => {
  const c = active.value?.change
  if (c == null) return null
  const dir = c > 0.005 ? 'up' : c < -0.005 ? 'down' : 'flat'
  return {
    symbol: dir === 'up' ? '▲' : dir === 'down' ? '▼' : '—',
    cls: dir === 'up' ? 'text-owned' : dir === 'down' ? 'text-skipped' : 'text-ink-faint',
    label: formatEurAmount(Math.abs(c))
  }
})

const firstDate = computed(() => formatDate(props.series[0]?.date ?? ''))
const lastDate = computed(() => formatDate(props.series[props.series.length - 1]?.date ?? ''))
</script>

<template>
  <div v-if="hasEnough" class="flex h-full w-full flex-col">
    <div class="relative min-h-0 w-full flex-1">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="absolute inset-0 h-full w-full text-brand" aria-hidden="true">
        <path :d="areaPath" fill="currentColor" opacity="0.08" />
        <path
          :d="linePath"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          vector-effect="non-scaling-stroke"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </svg>

      <!-- Interactive pips: one per recorded day. Hover/focus reveals the value tooltip. -->
      <div class="pointer-events-none absolute inset-0">
        <button
          v-for="dot in dots"
          :key="dot.key"
          type="button"
          class="pointer-events-auto absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-brand shadow-sm outline-none transition-transform hover:scale-150 focus-visible:scale-150 focus-visible:ring-2 focus-visible:ring-ring"
          :style="{ left: `${dot.xPct}%`, top: `${dot.yPct}%` }"
          :aria-label="`${dot.valueLabel} on ${dot.dateLabel}`"
          @mouseenter="active = dot"
          @mouseleave="active = null"
          @focus="active = dot"
          @blur="active = null"
        />
      </div>

      <!-- Tooltip for the active dot. -->
      <div
        v-if="active"
        class="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs shadow-(--shadow-2)"
        :style="tipStyle"
      >
        <div class="flex items-baseline gap-2">
          <span class="font-semibold tabular-nums">{{ active.valueLabel }}</span>
          <span v-if="activeDelta" class="text-[11px] font-semibold tabular-nums" :class="activeDelta.cls">
            {{ activeDelta.symbol }} {{ activeDelta.label }}
          </span>
        </div>
        <div class="text-ink-faint tabular-nums">{{ active.dateLabel }}</div>
      </div>
    </div>

    <div class="mt-1 flex shrink-0 justify-between text-[11px] text-ink-faint tabular-nums">
      <span>{{ firstDate }}</span>
      <span>{{ lastDate }}</span>
    </div>
  </div>

  <div
    v-else
    class="flex h-full min-h-24 items-center justify-center rounded-lg border border-dashed border-line px-6 text-center text-sm text-ink-faint"
  >
    Not enough history yet — fetch prices across a few days and the trend will fill in here.
  </div>
</template>
