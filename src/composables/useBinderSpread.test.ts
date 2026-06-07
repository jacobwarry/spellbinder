import { describe, it, expect } from 'vitest'
import {
  gridDims,
  spreadViews,
  singleViews,
  viewIndexForPage,
  decideLayout,
  navLabel,
  navProgress,
  SPREAD_GEOMETRY
} from './useBinderSpread'

describe('gridDims', () => {
  it('treats 12 slots as 4×3 and everything else as 3×3', () => {
    expect(gridDims(12)).toEqual({ cols: 4, rows: 3 })
    expect(gridDims(9)).toEqual({ cols: 3, rows: 3 })
    expect(gridDims(3)).toEqual({ cols: 3, rows: 3 })
  })
})

describe('spreadViews', () => {
  it('keeps page 1 alone, then pairs', () => {
    expect(spreadViews(1)).toEqual([[1]])
    expect(spreadViews(5)).toEqual([[1], [2, 3], [4, 5]])
    expect(spreadViews(6)).toEqual([[1], [2, 3], [4, 5], [6]]) // lone last page
  })
  it('returns nothing for an empty binder', () => {
    expect(spreadViews(0)).toEqual([])
  })
})

describe('singleViews', () => {
  it('is one page per step', () => {
    expect(singleViews(3)).toEqual([[1], [2], [3]])
    expect(singleViews(0)).toEqual([])
  })
})

describe('viewIndexForPage', () => {
  it('finds the spread containing a page', () => {
    const vs = spreadViews(6) // [[1],[2,3],[4,5],[6]]
    expect(viewIndexForPage(vs, 1)).toBe(0)
    expect(viewIndexForPage(vs, 3)).toBe(1)
    expect(viewIndexForPage(vs, 5)).toBe(2)
    expect(viewIndexForPage(vs, 6)).toBe(3)
  })
  it('clamps an out-of-range page into the view list', () => {
    const vs = singleViews(3)
    expect(viewIndexForPage(vs, 99)).toBe(2)
  })
})

describe('decideLayout', () => {
  it('chooses a spread on a wide desktop stage (3×3)', () => {
    const d = decideLayout(1400, 900, gridDims(9))
    expect(d.layout).toBe('spread')
    expect(d.cardPx).toBeGreaterThanOrEqual(SPREAD_GEOMETRY.MIN_CARD)
    expect(d.cardPx).toBeLessThanOrEqual(SPREAD_GEOMETRY.MAX_CARD)
  })

  it('falls back to a single page on a phone-width stage', () => {
    expect(decideLayout(380, 800, gridDims(9)).layout).toBe('single')
  })

  it('never spreads below the minimum spread width even when tall', () => {
    // Just under the width gate → single, regardless of height.
    expect(decideLayout(600, 2000, gridDims(9)).layout).toBe('single')
  })

  it('needs more width for a 4×3 spread than a 3×3', () => {
    // A width that spreads a 3×3 can be too tight for the wider 4×3 grid.
    const narrowish = 760
    expect(decideLayout(narrowish, 900, gridDims(9)).layout).toBe('spread')
    expect(decideLayout(narrowish, 900, gridDims(12)).layout).toBe('single')
  })

  it('clamps the card size to the configured ceiling on a huge stage', () => {
    expect(decideLayout(6000, 4000, gridDims(9)).cardPx).toBe(SPREAD_GEOMETRY.MAX_CARD)
  })
})

describe('navLabel', () => {
  it('reads as a page range for a two-page spread', () => {
    expect(navLabel([4, 5], 24, 'spread')).toBe('Pages 4–5 of 24')
  })
  it('reads as a single page for single mode and lone spread pages', () => {
    expect(navLabel([4], 24, 'single')).toBe('Page 4 of 24')
    expect(navLabel([24], 24, 'spread')).toBe('Page 24 of 24')
  })
})

describe('navProgress', () => {
  it('is the last visible page over the total', () => {
    expect(navProgress([4, 5], 24)).toBeCloseTo(5 / 24)
    expect(navProgress([24], 24)).toBe(1)
  })
  it('is zero for an empty binder', () => {
    expect(navProgress([], 0)).toBe(0)
  })
})
