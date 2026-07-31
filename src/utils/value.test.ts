import { describe, it, expect } from 'vitest'
import { computePriceMovers } from './value'

type P = { cardId: string; date: string; eur: string | null; eurFoil: string | null }

describe('computePriceMovers', () => {
  it('measures change across the window (earliest → latest) and sorts by delta', () => {
    const points: P[] = [
      { cardId: 'up', date: '2026-07-01', eur: '10.00', eurFoil: null },
      { cardId: 'up', date: '2026-07-10', eur: '25.00', eurFoil: null }, // +15
      { cardId: 'down', date: '2026-07-01', eur: '40.00', eurFoil: null },
      { cardId: 'down', date: '2026-07-10', eur: '30.00', eurFoil: null } // -10
    ]
    const movers = computePriceMovers(points)
    expect(movers.map(m => m.cardId)).toEqual(['up', 'down'])
    expect(movers[0]!.delta).toBeCloseTo(15)
    expect(movers[0]!.pct).toBeCloseTo(1.5)
    expect(movers[1]!.delta).toBeCloseTo(-10)
  })

  it('uses the earliest and latest snapshot across the whole window', () => {
    const points: P[] = [
      { cardId: 'c', date: '2026-07-01', eur: '5.00', eurFoil: null },
      { cardId: 'c', date: '2026-07-05', eur: '100.00', eurFoil: null },
      { cardId: 'c', date: '2026-07-10', eur: '110.00', eurFoil: null }
    ]
    const [m] = computePriceMovers(points)
    expect(m!.from).toBeCloseTo(5)
    expect(m!.to).toBeCloseTo(110)
    expect(m!.delta).toBeCloseTo(105)
  })

  it('still reports a mover when the two most recent days are identical', () => {
    const points: P[] = [
      { cardId: 'c', date: '2026-07-01', eur: '10.00', eurFoil: null },
      { cardId: 'c', date: '2026-07-09', eur: '30.00', eurFoil: null },
      { cardId: 'c', date: '2026-07-10', eur: '30.00', eurFoil: null } // unchanged vs the prior day
    ]
    const [m] = computePriceMovers(points)
    expect(m!.delta).toBeCloseTo(20) // 10 → 30 across the window
  })

  it('uses the foil price for a foil-only card', () => {
    const points: P[] = [
      { cardId: 'foilonly', date: '2026-07-01', eur: null, eurFoil: '200.00' },
      { cardId: 'foilonly', date: '2026-07-10', eur: null, eurFoil: '260.00' }
    ]
    const [m] = computePriceMovers(points)
    expect(m!.finish).toBe('foil')
    expect(m!.delta).toBeCloseTo(60)
  })

  it('drops cards with only one priced snapshot or no change', () => {
    const points: P[] = [
      { cardId: 'single', date: '2026-07-10', eur: '10.00', eurFoil: null },
      { cardId: 'flat', date: '2026-07-01', eur: '10.00', eurFoil: null },
      { cardId: 'flat', date: '2026-07-10', eur: '10.00', eurFoil: null }
    ]
    expect(computePriceMovers(points)).toHaveLength(0)
  })
})
