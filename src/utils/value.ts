/** Collection value math: turn owned finishes + fetched prices into EUR totals. */

interface PriceLike {
  eur: string | null
  eurFoil: string | null
}

export interface ValueSummary {
  /** Total EUR of owned finishes we actually have a price for. */
  value: number
  /** Owned finishes — each finish is its own item, so owning both counts twice. */
  ownedCount: number
  /** Owned finishes we could put a price on (coverage vs ownedCount). */
  pricedCount: number
  /** EUR to buy the cards that are neither owned nor skipped. */
  missingValue: number
  /** Cards neither owned nor skipped. */
  missingCount: number
  /** Missing cards we could put a price on (coverage vs missingCount). */
  missingPricedCount: number
}

export function emptyValue(): ValueSummary {
  return { value: 0, ownedCount: 0, pricedCount: 0, missingValue: 0, missingCount: 0, missingPricedCount: 0 }
}

/**
 * Fold one card into a running summary. Each owned finish is treated as its own
 * priced item (a card owned in both non-foil and foil counts as two), so the counts
 * stay consistent with the summed value. Cards that are neither owned nor skipped add
 * a single acquisition cost to `missingValue` (non-foil, or foil for foil-only).
 */
export function addCardValue(
  acc: ValueSummary,
  price: PriceLike | undefined,
  ownsNonFoil: boolean,
  ownsFoil: boolean,
  skipped: boolean
): void {
  if (ownsNonFoil || ownsFoil) {
    if (ownsNonFoil) {
      acc.ownedCount++
      if (price?.eur) {
        acc.value += parseFloat(price.eur)
        acc.pricedCount++
      }
    }
    if (ownsFoil) {
      acc.ownedCount++
      if (price?.eurFoil) {
        acc.value += parseFloat(price.eurFoil)
        acc.pricedCount++
      }
    }
    return
  }
  if (skipped) return
  acc.missingCount++
  const buy = price?.eur ?? price?.eurFoil ?? null
  if (buy) {
    acc.missingValue += parseFloat(buy)
    acc.missingPricedCount++
  }
}

/** Coverage tooltip, e.g. "3 of 5 owned cards priced" — null when nothing is priced. */
export function coverageLabel(summary: ValueSummary): string | undefined {
  if (summary.pricedCount === 0) return undefined
  return `${summary.pricedCount} of ${summary.ownedCount} owned cards priced`
}

/** Coverage tooltip for the missing (cost-to-complete) figure. */
export function missingCoverageLabel(summary: ValueSummary): string | undefined {
  if (summary.missingPricedCount === 0) return undefined
  return `Cost to buy ${summary.missingPricedCount} of ${summary.missingCount} missing cards`
}

export interface ValuePoint {
  date: string
  value: number
}

interface HistoryPoint {
  cardId: string
  date: string
  eur: string | null
  eurFoil: string | null
}

interface OwnedContribution {
  cardId: string
  ownsNonFoil: boolean
  ownsFoil: boolean
}

/**
 * Collection value over time: for each date we have price data, sum the current
 * collection's owned finishes using each card's most recent price on-or-before that
 * date (step interpolation). Ownership is current (we don't track it historically),
 * so this reads as "what my collection today would have been worth back then".
 */
export function buildValueSeries(points: HistoryPoint[], owned: OwnedContribution[]): ValuePoint[] {
  if (points.length === 0 || owned.length === 0) return []

  const ownedIds = new Set(owned.map(o => o.cardId))
  const byCard = new Map<string, { date: string; eur: number; eurFoil: number }[]>()
  for (const p of points) {
    if (!ownedIds.has(p.cardId)) continue
    const arr = byCard.get(p.cardId) ?? []
    arr.push({
      date: p.date,
      eur: p.eur ? parseFloat(p.eur) : NaN,
      eurFoil: p.eurFoil ? parseFloat(p.eurFoil) : NaN
    })
    byCard.set(p.cardId, arr)
  }
  if (byCard.size === 0) return []
  for (const arr of byCard.values()) arr.sort((a, b) => a.date.localeCompare(b.date))

  const dates = [...new Set(points.map(p => p.date))].sort()
  const ptr = new Map<string, number>()
  const cur = new Map<string, { eur: number; eurFoil: number }>()
  const series: ValuePoint[] = []

  for (const d of dates) {
    for (const [cardId, arr] of byCard) {
      let i = ptr.get(cardId) ?? 0
      while (i < arr.length && arr[i]!.date <= d) {
        cur.set(cardId, { eur: arr[i]!.eur, eurFoil: arr[i]!.eurFoil })
        i++
      }
      ptr.set(cardId, i)
    }
    let value = 0
    for (const o of owned) {
      const c = cur.get(o.cardId)
      if (!c) continue
      if (o.ownsNonFoil && !Number.isNaN(c.eur)) value += c.eur
      if (o.ownsFoil && !Number.isNaN(c.eurFoil)) value += c.eurFoil
    }
    series.push({ date: d, value })
  }
  return series
}

export interface PriceMover {
  cardId: string
  finish: 'nonfoil' | 'foil'
  from: number
  to: number
  fromDate: string
  toDate: string
  /** to − from (EUR). Positive = gainer, negative = loser. */
  delta: number
  /** delta / from, as a fraction. */
  pct: number
}

/**
 * Biggest price changes per card across the full recorded window — earliest snapshot vs
 * latest. Compares within a single finish (the one present in the latest snapshot: non-foil,
 * or foil for a foil-only card) so a card that lost its non-foil price doesn't produce a
 * bogus jump. Using the whole window (not just the last two days) means movement still shows
 * even when the two most recent days happen to be identical — e.g. after re-importing the
 * same bulk file. Cards with fewer than two priced snapshots, or net-zero change, are
 * dropped. Result is sorted by `delta` descending: head = top gainers, tail = top losers.
 */
export function computePriceMovers(points: HistoryPoint[]): PriceMover[] {
  const byCard = new Map<string, HistoryPoint[]>()
  for (const p of points) {
    const arr = byCard.get(p.cardId) ?? []
    arr.push(p)
    byCard.set(p.cardId, arr)
  }

  const movers: PriceMover[] = []
  for (const [cardId, pts] of byCard) {
    pts.sort((a, b) => a.date.localeCompare(b.date))
    const latest = pts[pts.length - 1]!
    const useFoil = latest.eur == null && latest.eurFoil != null
    const series = pts
      .map(p => ({ date: p.date, raw: useFoil ? p.eurFoil : p.eur }))
      .filter((x): x is { date: string; raw: string } => x.raw != null)
    if (series.length < 2) continue

    const to = series[series.length - 1]!
    const from = series[0]! // earliest recorded price in this finish
    const toV = parseFloat(to.raw)
    const fromV = parseFloat(from.raw)
    if (!(fromV > 0) || toV === fromV) continue

    movers.push({
      cardId,
      finish: useFoil ? 'foil' : 'nonfoil',
      from: fromV,
      to: toV,
      fromDate: from.date,
      toDate: to.date,
      delta: toV - fromV,
      pct: (toV - fromV) / fromV
    })
  }

  movers.sort((a, b) => b.delta - a.delta)
  return movers
}
