import { describe, it, expect, vi } from 'vitest'
import type { Segment, Binder } from '@/types'

// The engine resolves card data through the Scryfall cache. Stub it so the test
// is pure logic: every requested id maps to a minimal card object. The engine
// only stores the card (it reads no fields), so `{ id }` is sufficient.
vi.mock('@/api/scryfall', () => ({
  getCachedCards: vi.fn(async (ids: string[]) =>
    new Map(ids.map((id) => [id, { id } as any]))
  )
}))

import { calculatePlacements } from './usePlacement'

function seg(id: string, n: number, extra: Partial<Segment> = {}): Segment {
  return {
    id,
    name: id,
    scryfallSetCode: 'TST',
    cardIds: Array.from({ length: n }, (_, i) => `${id}-c${i}`),
    offset: 0,
    spacersBefore: {},
    ...extra
  }
}
const binder = (id: string, pageCount: number, slotsPerPage: number): Binder => ({
  id, name: id, type: 'binder', pageCount, slotsPerPage
})
const box = (id: string): Binder => ({ id, name: id, type: 'box' })

describe('calculatePlacements', () => {
  it('places cards sequentially with correct page/slot math across pages', async () => {
    const { placements, overflow, totalCards, totalCapacity } = await calculatePlacements(
      [seg('s', 11)],
      [binder('b1', 2, 9)]
    )
    expect(placements).toHaveLength(11)
    expect(placements[0]).toMatchObject({ pageNumber: 1, slotOnPage: 1, binderIndex: 0, binderId: 'b1' })
    expect(placements[8]).toMatchObject({ pageNumber: 1, slotOnPage: 9 })
    expect(placements[9]).toMatchObject({ pageNumber: 2, slotOnPage: 1 }) // rolls to next page
    expect(placements[10]).toMatchObject({ pageNumber: 2, slotOnPage: 2 })
    expect(overflow).toHaveLength(0)
    expect(totalCards).toBe(11)
    expect(totalCapacity).toBe(18)
  })

  it('applies a segment offset as leading blank slots', async () => {
    const { placements } = await calculatePlacements(
      [seg('s', 2, { offset: 2 })],
      [binder('b1', 1, 9)]
    )
    expect(placements.map((p) => p.slotOnPage)).toEqual([3, 4]) // first two slots left blank
  })

  it('inserts spacersBefore a specific card index', async () => {
    const { placements } = await calculatePlacements(
      [seg('s', 3, { spacersBefore: { 1: 2 } })],
      [binder('b1', 1, 9)]
    )
    // c0 at slot1; 2 blanks before c1 -> c1 at slot4; c2 at slot5
    expect(placements.map((p) => p.slotOnPage)).toEqual([1, 4, 5])
  })

  it('reports overflow when capacity is exceeded', async () => {
    const { placements, overflow, totalCapacity } = await calculatePlacements(
      [seg('s', 3)],
      [binder('b1', 1, 2)]
    )
    expect(placements).toHaveLength(2)
    expect(overflow).toEqual([{ segmentId: 's', segmentName: 's', overflowCount: 1 }])
    expect(totalCapacity).toBe(2)
  })

  it('uses linear, unlimited positioning for boxes', async () => {
    const { placements, overflow } = await calculatePlacements([seg('s', 5)], [box('x')])
    expect(placements.map((p) => p.slotOnPage)).toEqual([1, 2, 3, 4, 5])
    expect(placements.every((p) => p.pageNumber === 1 && p.binderId === 'x')).toBe(true)
    expect(overflow).toHaveLength(0)
  })

  it('pins a segment to its targetBinderId', async () => {
    const { placements } = await calculatePlacements(
      [seg('s', 2, { targetBinderId: 'b2' })],
      [binder('b1', 1, 9), binder('b2', 1, 9)]
    )
    expect(placements.every((p) => p.binderId === 'b2' && p.binderIndex === 1)).toBe(true)
    expect(placements.map((p) => p.slotOnPage)).toEqual([1, 2])
  })

  it('auto-fills into the next binder when the current one is full', async () => {
    const { placements } = await calculatePlacements(
      [seg('s', 3)],
      [binder('b1', 1, 1), binder('b2', 1, 9)]
    )
    expect(placements[0]).toMatchObject({ binderId: 'b1', slotOnPage: 1 })
    expect(placements[1]).toMatchObject({ binderId: 'b2', slotOnPage: 1 }) // spilled over
    expect(placements[2]).toMatchObject({ binderId: 'b2', slotOnPage: 2 })
  })
})
