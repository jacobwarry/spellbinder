import { describe, it, expect } from 'vitest'
import { normalizeForSearch, cardMatchesQuery } from './cardSearch'
import type { BinderSlotCard } from '@/components/common/types'

function card(overrides: Partial<BinderSlotCard>): BinderSlotCard {
  return { name: '', set: '', number: '', color: 'C', status: 'missing', ...overrides }
}

describe('normalizeForSearch', () => {
  it('folds case and strips punctuation and whitespace', () => {
    expect(normalizeForSearch("Urza's Saga")).toBe('urzassaga')
    expect(normalizeForSearch('Lim-Dûl, the Necromancer')).toBe('limdulthenecromancer')
  })

  it('strips diacritics and expands MTG ligatures', () => {
    expect(normalizeForSearch('Jötun Grunt')).toBe('jotungrunt')
    expect(normalizeForSearch('Æther Vial')).toBe('aethervial')
    expect(normalizeForSearch('Lörïen')).toBe('lorien')
  })
})

describe('cardMatchesQuery', () => {
  const q = (s: string) => normalizeForSearch(s)

  it('matches on a name fragment ignoring the apostrophe', () => {
    expect(cardMatchesQuery(card({ name: "Urza's Saga" }), q('urzas'))).toBe(true)
    expect(cardMatchesQuery(card({ name: "Gaea's Cradle" }), q('gaea'))).toBe(true)
  })

  it('matches Æ cards typed as "aether"', () => {
    expect(cardMatchesQuery(card({ name: 'Æther Vial' }), q('aether'))).toBe(true)
  })

  it('matches on set code, collector number, and rarity', () => {
    const c = card({ name: 'Ragavan', set: 'MH2', number: '138', rarity: 'mythic' })
    expect(cardMatchesQuery(c, q('mh2'))).toBe(true)
    expect(cardMatchesQuery(c, q('138'))).toBe(true)
    expect(cardMatchesQuery(c, q('mythic'))).toBe(true)
  })

  it('does not match unrelated text', () => {
    expect(cardMatchesQuery(card({ name: 'Lightning Bolt' }), q('counterspell'))).toBe(false)
  })

  it('treats an empty query as matching everything', () => {
    expect(cardMatchesQuery(card({ name: 'Lightning Bolt' }), '')).toBe(true)
  })
})
