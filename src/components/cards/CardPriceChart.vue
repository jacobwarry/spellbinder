<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PricePoint } from '@/api/priceHistory'
import { formatEur } from '@/utils/price'

// Self-contained SVG price-history chart for a single printing (no external lib,
// CSP-clean). Draws up to two series — non-foil and foil EUR — over a shared normalized
// 100×100 viewBox with non-scaling strokes so they stay crisp. Because that viewBox is
// stretched (preserveAspectRatio="none"), an SVG <circle> would render as an ellipse, so
// each data point is instead an HTML dot overlaid by percentage — round, and hoverable
// for a date + price tooltip.
const props = defineProps<{ points: PricePoint[] }>()

interface Series {
  key: 'nonfoil' | 'foil'
  data: { date: string; value: number }[]
}

// One numeric series per finish, dropping days that had no price for that finish.
const series = computed<Series[]>(() => {
  const nonfoil: Series['data'] = []
  const foil: Series['data'] = []
  for (const p of props.points) {
    if (p.eur != null) nonfoil.push({ date: p.date, value: parseFloat(p.eur) })
    if (p.eurFoil != null) foil.push({ date: p.date, value: parseFloat(p.eurFoil) })
  }
  const out: Series[] = []
  if (nonfoil.length) out.push({ key: 'nonfoil', data: nonfoil })
  if (foil.length) out.push({ key: 'foil', data: foil })
  return out
})

// Enough to plot if any series has at least two points.
const hasEnough = computed(() => series.value.some(s => s.data.length >= 2))

// Shared value + date axes across both series, so the two lines are comparable.
const bounds = computed(() => {
  const values = series.value.flatMap(s => s.data.map(d => d.value))
  const dates = [...new Set(props.points.map(p => p.date))].sort()
  const min = Math.min(...values)
  const max = Math.max(...values)
  return { min, max, span: max - min || 1, dates }
})

const PAD = 8 // vertical breathing room, in normalized units

// Normalized (0–100) x for a date and y for a value, shared by the paths and the dots.
function xFor(date: string): number {
  const { dates } = bounds.value
  return dates.length < 2 ? 0 : (dates.indexOf(date) / (dates.length - 1)) * 100
}
function yFor(value: number): number {
  const { min, span } = bounds.value
  return 100 - PAD - ((value - min) / span) * (100 - 2 * PAD)
}

function pathFor(s: Series): string {
  if (bounds.value.dates.length < 2 || s.data.length < 2) return ''
  return s.data
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${xFor(d.date).toFixed(2)},${yFor(d.value).toFixed(2)}`)
    .join(' ')
}

const nonfoilPath = computed(() => {
  const s = series.value.find(x => x.key === 'nonfoil')
  return s ? pathFor(s) : ''
})
const foilPath = computed(() => {
  const s = series.value.find(x => x.key === 'foil')
  return s ? pathFor(s) : ''
})

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
  finish: 'nonfoil' | 'foil'
  finishLabel: string
  valueLabel: string
  dateLabel: string
  /** Change vs the previous recorded point on this same line; null for the first point. */
  change: number | null
  tipAlign: 'left' | 'center' | 'right'
  tipBelow: boolean
}

// One overlay dot per recorded point, per finish.
const dots = computed<Dot[]>(() => {
  if (bounds.value.dates.length < 2) return []
  const out: Dot[] = []
  for (const s of series.value) {
    s.data.forEach((d, i) => {
      const xPct = xFor(d.date)
      const yPct = yFor(d.value)
      const prev = i > 0 ? s.data[i - 1] : null
      out.push({
        key: `${s.key}-${d.date}`,
        xPct,
        yPct,
        finish: s.key,
        finishLabel: s.key === 'foil' ? 'Foil' : 'Non-foil',
        valueLabel: formatEur(d.value) ?? '',
        dateLabel: formatDate(d.date),
        change: prev ? d.value - prev.value : null,
        // Keep the tooltip on-canvas near the edges / top.
        tipAlign: xPct < 18 ? 'left' : xPct > 82 ? 'right' : 'center',
        tipBelow: yPct < 24
      })
    })
  }
  return out
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

// Change vs the previous point on the active dot's line, as a display descriptor.
// A sub-cent difference counts as unchanged (prices are 2-decimal), so a flat line
// shows a neutral em-dash rather than a misleading green/red arrow.
const activeDelta = computed(() => {
  const c = active.value?.change
  if (c == null) return null
  const dir = c > 0.005 ? 'up' : c < -0.005 ? 'down' : 'flat'
  return {
    symbol: dir === 'up' ? '▲' : dir === 'down' ? '▼' : '—',
    cls: dir === 'up' ? 'text-owned' : dir === 'down' ? 'text-skipped' : 'text-ink-faint',
    label: formatEur(Math.abs(c))
  }
})

function latest(key: Series['key']): { value: number; change: number } | null {
  const s = series.value.find(x => x.key === key)
  if (!s || s.data.length === 0) return null
  const last = s.data[s.data.length - 1]!
  const first = s.data[0]!
  return { value: last.value, change: last.value - first.value }
}
const latestNonFoil = computed(() => latest('nonfoil'))
const latestFoil = computed(() => latest('foil'))

const firstDate = computed(() => formatDate(bounds.value.dates[0] ?? ''))
const lastDate = computed(() => formatDate(bounds.value.dates[bounds.value.dates.length - 1] ?? ''))
</script>

<template>
  <div v-if="hasEnough" class="w-full">
    <div class="relative h-40 w-full">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="absolute inset-0 h-full w-full" aria-hidden="true">
        <path
          v-if="nonfoilPath"
          :d="nonfoilPath"
          fill="none"
          class="text-brand"
          stroke="currentColor"
          stroke-width="2"
          vector-effect="non-scaling-stroke"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
        <path
          v-if="foilPath"
          :d="foilPath"
          fill="none"
          stroke="var(--mana-u)"
          stroke-width="2"
          vector-effect="non-scaling-stroke"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </svg>

      <!-- Interactive dots: one per recorded point. Hover/focus reveals the tooltip. -->
      <div class="pointer-events-none absolute inset-0">
        <button
          v-for="dot in dots"
          :key="dot.key"
          type="button"
          class="pointer-events-auto absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface shadow-sm outline-none transition-transform hover:scale-150 focus-visible:scale-150 focus-visible:ring-2 focus-visible:ring-ring"
          :class="dot.finish === 'nonfoil' ? 'bg-brand' : ''"
          :style="dot.finish === 'foil'
            ? { left: `${dot.xPct}%`, top: `${dot.yPct}%`, background: 'var(--mana-u)' }
            : { left: `${dot.xPct}%`, top: `${dot.yPct}%` }"
          :aria-label="`${dot.finishLabel} ${dot.valueLabel} on ${dot.dateLabel}`"
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
          <span
            v-if="activeDelta"
            class="text-[11px] font-semibold tabular-nums"
            :class="activeDelta.cls"
          >
            {{ activeDelta.symbol }} {{ activeDelta.label }}
          </span>
        </div>
        <div class="text-ink-faint tabular-nums">{{ active.finishLabel }} · {{ active.dateLabel }}</div>
      </div>
    </div>

    <div class="mt-1 flex justify-between text-[11px] text-ink-faint tabular-nums">
      <span>{{ firstDate }}</span>
      <span>{{ lastDate }}</span>
    </div>

    <div class="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs tabular-nums">
      <span v-if="latestNonFoil" class="flex items-center gap-1.5">
        <span class="h-2 w-2 rounded-full bg-brand"></span>
        <span class="text-ink-soft">Non-foil</span>
        <span class="font-semibold">{{ formatEur(latestNonFoil.value) }}</span>
        <span :class="latestNonFoil.change >= 0 ? 'text-owned' : 'text-skipped'">
          {{ latestNonFoil.change >= 0 ? '▲' : '▼' }} {{ formatEur(Math.abs(latestNonFoil.change)) }}
        </span>
      </span>
      <span v-if="latestFoil" class="flex items-center gap-1.5">
        <span class="h-2 w-2 rounded-full" style="background: var(--mana-u)"></span>
        <span class="text-ink-soft">Foil</span>
        <span class="font-semibold">{{ formatEur(latestFoil.value) }}</span>
        <span :class="latestFoil.change >= 0 ? 'text-owned' : 'text-skipped'">
          {{ latestFoil.change >= 0 ? '▲' : '▼' }} {{ formatEur(Math.abs(latestFoil.change)) }}
        </span>
      </span>
    </div>
  </div>

  <div
    v-else
    class="flex h-40 items-center justify-center rounded-lg border border-dashed border-line px-6 text-center text-sm text-ink-faint"
  >
    Not enough price history yet — fetch this card's price across a few days and the trend will fill in here.
  </div>
</template>
