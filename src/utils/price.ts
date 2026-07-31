/** Formatters for the EUR pricing shown on card slots and in the action sheet. */

/**
 * Format a EUR price (Scryfall string like "7.24", or a number) as European-style
 * currency ("€7,24"), always with exactly two decimals. Extra precision is truncated,
 * not rounded ("9.9999999" → "€9,99"), and short values are padded ("24.9" → "€24,90").
 * Returns null when there is no price, so callers can omit the element entirely.
 */
export function formatEur(value: string | number | null | undefined): string | null {
  if (value == null || value === '') return null
  const num = typeof value === 'number' ? value : parseFloat(value)
  if (!Number.isFinite(num)) return null
  // toFixed(10) first to avoid float artefacts / exponential notation, then keep only
  // the first two fractional digits (truncate, so we "cap at 2 decimals" per the spec).
  const [intPart, fracPart] = Math.abs(num).toFixed(10).split('.')
  return `${num < 0 ? '-' : ''}€${intPart},${(fracPart ?? '').slice(0, 2)}`
}

const AMOUNT_FMT = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Format a numeric EUR total (e.g. a binder value) as "€1.234,56". */
export function formatEurAmount(amount: number): string {
  return `€${AMOUNT_FMT.format(amount)}`
}

/** Format a fetch timestamp as a short absolute date/time, e.g. "12 Jul 2026, 03:45". */
export function formatFetchTime(ts: number | null | undefined): string | undefined {
  if (!ts) return undefined
  return new Date(ts).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/** Human-readable "Prices as of …" label for the fetch-time tooltip. */
export function formatPriceTimestamp(ts: number | undefined): string | undefined {
  const formatted = formatFetchTime(ts)
  return formatted && `Prices as of ${formatted}`
}
