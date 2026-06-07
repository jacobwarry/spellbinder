import { describe, it, expect } from 'vitest'
import type { PlacementResult } from './usePlacement'
import { buildCardLocationMap, buildBinderStats } from './useAllPlacements'

// Minimal placement factory — only the fields the aggregators read.
function placement(segmentId: string, cardIndexInSegment: number, binderId: string, pageNumber: number, slotOnPage: number) {
  return { card: { id: `${segmentId}-${cardIndexInSegment}` } as any, segmentId, cardIndexInSegment, binderId, binderIndex: 0, pageNumber, slotOnPage }
}
function result(...placements: ReturnType<typeof placement>[]): PlacementResult {
  return { placements, overflow: [], totalCards: placements.length, totalCapacity: 0 }
}

describe('buildCardLocationMap', () => {
  it('keys by segmentId:cardIndex and resolves the binder name', () => {
    const map = buildCardLocationMap(
      [result(placement('s', 0, 'b1', 1, 2), placement('s', 1, 'b1', 1, 3))],
      (id) => (id === 'b1' ? 'Binder A' : undefined)
    )
    expect(map.get('s:0')).toEqual({ binderName: 'Binder A', pageNumber: 1, slotOnPage: 2 })
    expect(map.get('s:1')).toEqual({ binderName: 'Binder A', pageNumber: 1, slotOnPage: 3 })
  })

  it('keeps the first placement for a duplicated key and skips unknown binders', () => {
    const map = buildCardLocationMap(
      [
        result(placement('s', 0, 'b1', 1, 1)),
        result(placement('s', 0, 'b1', 9, 9)), // duplicate key — ignored
        result(placement('s', 1, 'ghost', 1, 1)) // unresolved binder — skipped
      ],
      (id) => (id === 'b1' ? 'Binder A' : undefined)
    )
    expect(map.get('s:0')).toMatchObject({ pageNumber: 1, slotOnPage: 1 })
    expect(map.has('s:1')).toBe(false)
  })
})

describe('buildBinderStats', () => {
  it('counts planned per binder and owned via the predicate', () => {
    const owned = new Set(['s:0', 's:2'])
    const stats = buildBinderStats(
      [result(
        placement('s', 0, 'b1', 1, 1),
        placement('s', 1, 'b1', 1, 2),
        placement('s', 2, 'b2', 1, 1)
      )],
      (key) => owned.has(key)
    )
    expect(stats.get('b1')).toEqual({ planned: 2, owned: 1 })
    expect(stats.get('b2')).toEqual({ planned: 1, owned: 1 })
  })
})
