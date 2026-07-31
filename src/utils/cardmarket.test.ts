import { describe, it, expect } from 'vitest'
import type { ScryfallCard } from '@/types'
import {
  cardmarketVariant,
  normalizeCardmarketBaseName,
  resolveCardmarketExpansion,
  cardmarketVersionIndex,
  cardmarketWantLine,
  buildCardmarketExport,
} from './cardmarket'

// Minimal card factory — only the fields the resolver reads.
function card(p: Partial<ScryfallCard> & { name: string; set: string }): ScryfallCard {
  return {
    id: p.id ?? `${p.set}-${p.collector_number ?? p.name}`,
    name: p.name,
    collector_number: p.collector_number ?? '1',
    set: p.set,
    set_name: p.set_name ?? p.set.toUpperCase(),
    rarity: p.rarity ?? 'rare',
    type_line: p.type_line ?? 'Creature',
    oracle_id: p.oracle_id,
    cardmarket_id: p.cardmarket_id,
    border_color: p.border_color,
    frame_effects: p.frame_effects,
    promo_types: p.promo_types,
  } as ScryfallCard
}

describe('cardmarketVariant', () => {
  it('treats a plain main-set printing as main (legendary frame alone is not Extras)', () => {
    expect(cardmarketVariant(card({ name: 'Tifa', set: 'fic', frame_effects: ['legendary'] }))).toBe('main')
  })

  it('flags booster-fun promo_types as Extras', () => {
    expect(
      cardmarketVariant(card({ name: 'Tifa', set: 'fic', promo_types: ['universesbeyond', 'boosterfun'] }))
    ).toBe('extras')
  })

  it('flags borderless and showcase/extended treatments as Extras', () => {
    expect(cardmarketVariant(card({ name: 'A', set: 'x', border_color: 'borderless' }))).toBe('extras')
    expect(cardmarketVariant(card({ name: 'B', set: 'x', frame_effects: ['legendary', 'extendedart'] }))).toBe('extras')
    expect(cardmarketVariant(card({ name: 'C', set: 'x', frame_effects: ['showcase'] }))).toBe('extras')
  })

  it('does not flag a surge-foil main-set card without booster-fun as Extras', () => {
    expect(
      cardmarketVariant(card({ name: 'Tifa', set: 'fic', promo_types: ['surgefoil', 'universesbeyond'] }))
    ).toBe('main')
  })
})

describe('normalizeCardmarketBaseName', () => {
  it('reorders "<Set> Commander" to "Commander: <Set>"', () => {
    expect(normalizeCardmarketBaseName('Bloomburrow Commander')).toBe('Commander: Bloomburrow')
    expect(normalizeCardmarketBaseName('Tarkir: Dragonstorm Commander')).toBe('Commander: Tarkir: Dragonstorm')
  })

  it('leaves standalone Commander products and normal sets untouched', () => {
    expect(normalizeCardmarketBaseName('Commander 2021')).toBe('Commander 2021')
    expect(normalizeCardmarketBaseName('Commander Legends')).toBe('Commander Legends')
    expect(normalizeCardmarketBaseName('Bloomburrow')).toBe('Bloomburrow')
  })
})

describe('resolveCardmarketExpansion', () => {
  it('reorders a Commander set name and composes it with the Extras suffix (the Flubs case)', () => {
    const flubs = card({
      name: 'Flubs, the Fool',
      set: 'blc',
      set_name: 'Bloomburrow Commander',
      frame_effects: ['showcase'],
    })
    expect(resolveCardmarketExpansion(flubs).name).toBe('Commander: Bloomburrow: Extras')
    // A plain main-set card from the same set → no Extras suffix.
    const plain = card({ name: 'Some Card', set: 'blc', set_name: 'Bloomburrow Commander' })
    expect(resolveCardmarketExpansion(plain).name).toBe('Commander: Bloomburrow')
  })


  it('uses the Scryfall set name for a main card with no override', () => {
    const r = resolveCardmarketExpansion(card({ name: 'A', set: 'fic', set_name: 'Commander: FINAL FANTASY' }))
    expect(r).toMatchObject({ name: 'Commander: FINAL FANTASY', variant: 'main', key: 'fic:main' })
  })

  it('appends ": Extras" for booster-fun cards', () => {
    const r = resolveCardmarketExpansion(
      card({ name: 'A', set: 'fic', set_name: 'Commander: FINAL FANTASY', promo_types: ['boosterfun'] })
    )
    expect(r.name).toBe('Commander: FINAL FANTASY: Extras')
    expect(r.key).toBe('fic:extras')
  })

  it('lets a main override flow through to the derived Extras name', () => {
    const overrides = { 'sta:main': 'Secrets of Strixhaven: Mystical Archive' }
    const main = resolveCardmarketExpansion(card({ name: 'A', set: 'sta', set_name: 'Strixhaven Mystical Archive' }), overrides)
    const extra = resolveCardmarketExpansion(
      card({ name: 'B', set: 'sta', set_name: 'Strixhaven Mystical Archive', border_color: 'borderless' }),
      overrides
    )
    expect(main.name).toBe('Secrets of Strixhaven: Mystical Archive')
    expect(extra.name).toBe('Secrets of Strixhaven: Mystical Archive: Extras')
  })

  it('lets an explicit extras override win over the derived name', () => {
    const overrides = { 'sta:extras': 'Totally Custom Extras' }
    const r = resolveCardmarketExpansion(
      card({ name: 'B', set: 'sta', set_name: 'Strixhaven Mystical Archive', border_color: 'borderless' }),
      overrides
    )
    expect(r.name).toBe('Totally Custom Extras')
  })
})

describe('cardmarketVersionIndex', () => {
  it('orders versions within a bucket by cardmarket_id', () => {
    // The Tifa "Extras" bucket: extended (824220), borderless (824229), surge borderless (824238).
    const v1 = card({ name: 'Tifa', set: 'fic', oracle_id: 't', cardmarket_id: 824220, frame_effects: ['extendedart'] })
    const v2 = card({ name: 'Tifa', set: 'fic', oracle_id: 't', cardmarket_id: 824229, border_color: 'borderless' })
    const v3 = card({ name: 'Tifa', set: 'fic', oracle_id: 't', cardmarket_id: 824238, border_color: 'borderless' })
    const bucket = [v3, v1, v2] // unsorted input
    expect(cardmarketVersionIndex(v1, bucket)).toBe(1)
    expect(cardmarketVersionIndex(v2, bucket)).toBe(2)
    expect(cardmarketVersionIndex(v3, bucket)).toBe(3)
  })

  it('does not cross the main/Extras boundary when numbering', () => {
    const main = card({ name: 'Tifa', set: 'fic', oracle_id: 't', cardmarket_id: 824195 })
    const extra = card({ name: 'Tifa', set: 'fic', oracle_id: 't', cardmarket_id: 824220, frame_effects: ['extendedart'] })
    // Only one product in the main bucket → no version suffix.
    expect(cardmarketVersionIndex(main, [main, extra])).toBeUndefined()
  })

  it('returns undefined for a lone product and when the id is missing', () => {
    const only = card({ name: 'Solo', set: 'x', cardmarket_id: 5 })
    expect(cardmarketVersionIndex(only, [only])).toBeUndefined()
    const noId = card({ name: 'Old', set: 'x' })
    expect(cardmarketVersionIndex(noId, [noId, card({ name: 'Old', set: 'x', cardmarket_id: 9 })])).toBeUndefined()
  })
})

describe('cardmarketWantLine', () => {
  it('formats amount, name, version and expansion', () => {
    expect(cardmarketWantLine({ name: 'High Tide', expansion: 'Fallen Empires', version: 1 })).toBe(
      '1 High Tide (V.1) (Fallen Empires)'
    )
    expect(cardmarketWantLine({ name: 'Dark Ritual', expansion: 'Ice Age', quantity: 4 })).toBe(
      '4 Dark Ritual (Ice Age)'
    )
  })
})

describe('buildCardmarketExport', () => {
  it('produces lines with correct expansion + version and summarises buckets', () => {
    const main = card({ name: 'Tifa', set: 'fic', set_name: 'Commander: FINAL FANTASY', oracle_id: 't', cardmarket_id: 824195 })
    const ex1 = card({ name: 'Tifa', set: 'fic', set_name: 'Commander: FINAL FANTASY', oracle_id: 't', cardmarket_id: 824220, frame_effects: ['extendedart'] })
    const ex2 = card({ name: 'Tifa', set: 'fic', set_name: 'Commander: FINAL FANTASY', oracle_id: 't', cardmarket_id: 824238, border_color: 'borderless' })
    const setLists = new Map([['fic', [main, ex1, ex2]]])

    const { lines, buckets } = buildCardmarketExport([main, ex1, ex2], setLists)

    expect(lines).toEqual([
      '1 Tifa (Commander: FINAL FANTASY)', // lone product in main bucket → no version
      '1 Tifa (V.1) (Commander: FINAL FANTASY: Extras)',
      '1 Tifa (V.2) (Commander: FINAL FANTASY: Extras)',
    ])
    const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]))
    expect(byKey['fic:main']!.count).toBe(1)
    expect(byKey['fic:extras']!.count).toBe(2)
    expect(byKey['fic:extras']!.name).toBe('Commander: FINAL FANTASY: Extras')
  })

  it('applies overrides to the emitted expansion name', () => {
    const c = card({ name: 'Approach', set: 'sta', set_name: 'Strixhaven Mystical Archive', cardmarket_id: 1 })
    const { lines } = buildCardmarketExport([c], new Map([['sta', [c]]]), {
      'sta:main': 'Secrets of Strixhaven: Mystical Archive',
    })
    expect(lines[0]).toBe('1 Approach (Secrets of Strixhaven: Mystical Archive)')
  })
})
