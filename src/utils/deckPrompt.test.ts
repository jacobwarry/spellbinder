import { describe, it, expect } from 'vitest'
import type { ScryfallCard } from '@/types'
import {
  buildPool,
  buildDeckPrompt,
  cardIdentity,
  fitsColorIdentity,
  formatPoolLine,
  isCommanderCandidate,
  oracleTextOf,
  typeLineOf
} from './deckPrompt'

function card(overrides: Partial<ScryfallCard>): ScryfallCard {
  return {
    id: Math.random().toString(36).slice(2),
    name: 'Test Card',
    collector_number: '1',
    set: 'tst',
    set_name: 'Test Set',
    rarity: 'common',
    type_line: 'Creature — Human',
    color_identity: [],
    ...overrides
  }
}

describe('cardIdentity', () => {
  it('collapses different printings of the same card', () => {
    const a = card({ name: 'Sol Ring', set: 'c14', id: 'a' })
    const b = card({ name: 'Sol Ring', set: 'lea', id: 'b' })
    expect(cardIdentity(a)).toBe(cardIdentity(b))
  })

  it('normalizes punctuation and diacritics', () => {
    expect(cardIdentity(card({ name: "Urza's Saga" }))).toBe(
      cardIdentity(card({ name: 'Urzas Saga' }))
    )
    expect(cardIdentity(card({ name: 'Jötun Grunt' }))).toBe(
      cardIdentity(card({ name: 'Jotun Grunt' }))
    )
  })
})

describe('fitsColorIdentity', () => {
  it('accepts a strict subset of the commander identity', () => {
    expect(fitsColorIdentity(card({ color_identity: ['B'] }), ['B', 'R', 'G'])).toBe(true)
    expect(fitsColorIdentity(card({ color_identity: ['B', 'G'] }), ['B', 'R', 'G'])).toBe(true)
  })

  it('accepts colourless cards into any identity', () => {
    expect(fitsColorIdentity(card({ color_identity: [] }), ['B'])).toBe(true)
    expect(fitsColorIdentity(card({ color_identity: [] }), [])).toBe(true)
  })

  it('rejects any colour outside the commander identity', () => {
    expect(fitsColorIdentity(card({ color_identity: ['W'] }), ['B', 'R', 'G'])).toBe(false)
    expect(fitsColorIdentity(card({ color_identity: ['B', 'W'] }), ['B', 'R', 'G'])).toBe(false)
  })

  it('treats an unmapped identity as colourless rather than hiding the card', () => {
    expect(fitsColorIdentity(card({ color_identity: undefined }), ['B'])).toBe(true)
  })
})

describe('double-faced cards', () => {
  const dfc = card({
    name: 'Delver of Secrets // Insectile Aberration',
    type_line: undefined,
    oracle_text: undefined,
    card_faces: [
      { name: 'Delver of Secrets', type_line: 'Creature — Human Wizard', oracle_text: 'Look at the top card.' },
      { name: 'Insectile Aberration', type_line: 'Creature — Human Insect', oracle_text: 'Flying.' }
    ]
  })

  it('reads the type line from the faces', () => {
    expect(typeLineOf(dfc)).toBe('Creature — Human Wizard // Creature — Human Insect')
  })

  it('joins oracle text across faces', () => {
    expect(oracleTextOf(dfc)).toBe('Look at the top card. // Flying.')
  })
})

describe('isCommanderCandidate', () => {
  it('accepts legendary creatures', () => {
    expect(isCommanderCandidate(card({ type_line: 'Legendary Creature — Dragon' }))).toBe(true)
  })

  it('rejects legendary non-creatures', () => {
    expect(isCommanderCandidate(card({ type_line: 'Legendary Artifact' }))).toBe(false)
    expect(isCommanderCandidate(card({ type_line: 'Legendary Land' }))).toBe(false)
  })

  it('accepts planeswalkers that explicitly grant commander status', () => {
    const pw = card({
      type_line: 'Legendary Planeswalker — Freyalise',
      oracle_text: 'Freyalise, Llanowar’s Fury can be your commander.'
    })
    expect(isCommanderCandidate(pw)).toBe(true)
  })

  it('rejects art series entries that share a legendary name', () => {
    expect(
      isCommanderCandidate(card({ type_line: 'Legendary Creature — Dragon', layout: 'art_series' }))
    ).toBe(false)
  })
})

describe('buildPool', () => {
  it('collapses duplicate printings and counts copies', () => {
    const pool = buildPool([
      card({ name: 'Sol Ring', set: 'c14' }),
      card({ name: 'Sol Ring', set: 'lea' }),
      card({ name: 'Cultivate' })
    ])
    expect(pool).toHaveLength(2)
    expect(pool.find((e) => e.card.name === 'Sol Ring')?.copies).toBe(2)
    expect(pool.find((e) => e.card.name === 'Cultivate')?.copies).toBe(1)
  })

  it('filters to the commander colour identity', () => {
    const pool = buildPool(
      [
        card({ name: 'Cultivate', color_identity: ['G'] }),
        card({ name: 'Counterspell', color_identity: ['U'] }),
        card({ name: 'Sol Ring', color_identity: [] })
      ],
      { colorIdentity: ['B', 'R', 'G'] }
    )
    expect(pool.map((e) => e.card.name)).toEqual(['Cultivate', 'Sol Ring'])
  })

  it('drops basic lands by default but keeps nonbasics', () => {
    const pool = buildPool([
      card({ name: 'Forest', type_line: 'Basic Land — Forest' }),
      card({ name: 'Command Tower', type_line: 'Land' })
    ])
    expect(pool.map((e) => e.card.name)).toEqual(['Command Tower'])
  })

  it('keeps basic lands when asked', () => {
    const pool = buildPool([card({ name: 'Forest', type_line: 'Basic Land — Forest' })], {
      excludeBasicLands: false
    })
    expect(pool).toHaveLength(1)
  })

  it('excludes non-playable layouts', () => {
    const pool = buildPool([
      card({ name: 'Sol Ring', layout: 'art_series' }),
      card({ name: 'Beast', layout: 'token' }),
      card({ name: 'Cultivate', layout: 'normal' })
    ])
    expect(pool.map((e) => e.card.name)).toEqual(['Cultivate'])
  })

  it('excludes the commander from its own 99', () => {
    const commander = card({ name: 'Prossh, Skyraider of Kher' })
    const pool = buildPool([commander, card({ name: 'Cultivate' })], {
      excludeIdentity: cardIdentity(commander)
    })
    expect(pool.map((e) => e.card.name)).toEqual(['Cultivate'])
  })

  it('sorts by name so the paste is stable between runs', () => {
    const pool = buildPool([
      card({ name: 'Zulaport Cutthroat' }),
      card({ name: 'Anger' }),
      card({ name: 'Mountain', type_line: 'Land' })
    ])
    expect(pool.map((e) => e.card.name)).toEqual(['Anger', 'Mountain', 'Zulaport Cutthroat'])
  })
})

describe('formatPoolLine', () => {
  it('renders name, cost, type and text', () => {
    const line = formatPoolLine(
      card({
        name: 'Cultivate',
        mana_cost: '{2}{G}',
        type_line: 'Sorcery',
        oracle_text: 'Search your library for up to two basic land cards.'
      })
    )
    expect(line).toBe(
      'Cultivate {2}{G} | Sorcery | Search your library for up to two basic land cards.'
    )
  })

  it('omits the cost segment for lands', () => {
    const line = formatPoolLine(card({ name: 'Command Tower', mana_cost: '', type_line: 'Land' }))
    expect(line).toBe('Command Tower | Land')
  })

  it('strips reminder text by default', () => {
    const line = formatPoolLine(
      card({ name: 'Anger', oracle_text: 'Haste (This creature can attack as soon as it comes under your control.)' })
    )
    expect(line).toContain('Haste')
    expect(line).not.toContain('as soon as it comes')
  })

  it('keeps reminder text when asked', () => {
    const line = formatPoolLine(card({ name: 'Anger', oracle_text: 'Haste (This creature can attack.)' }), {
      stripReminderText: false
    })
    expect(line).toContain('(This creature can attack.)')
  })

  it('collapses newlines so each card stays on one line', () => {
    const line = formatPoolLine(card({ name: 'Prossh', oracle_text: 'Line one.\nLine two.' }))
    expect(line).not.toContain('\n')
    expect(line).toContain('Line one. / Line two.')
  })
})

describe('buildDeckPrompt', () => {
  const commander = card({
    name: 'Prossh, Skyraider of Kher',
    mana_cost: '{4}{B}{R}{G}',
    type_line: 'Legendary Creature — Dragon',
    color_identity: ['B', 'R', 'G']
  })

  const pool = buildPool([card({ name: 'Cultivate', color_identity: ['G'] })])

  it('names the commander and its identity', () => {
    const prompt = buildDeckPrompt(commander, pool)
    expect(prompt).toContain('Prossh, Skyraider of Kher')
    expect(prompt).toContain('{B}{R}{G}')
  })

  it('lists the correct basics for the identity', () => {
    const prompt = buildDeckPrompt(commander, pool)
    expect(prompt).toContain('Swamp, Mountain, Forest')
  })

  it('states the pool size and includes every pool card', () => {
    const prompt = buildDeckPrompt(commander, pool)
    expect(prompt).toContain('## Pool (1 cards)')
    expect(prompt).toContain('Cultivate')
  })

  it('forbids inventing cards outside the pool', () => {
    expect(buildDeckPrompt(commander, pool)).toContain('Never suggest a card that is not listed')
  })

  it('includes freeform notes when given', () => {
    const prompt = buildDeckPrompt(commander, pool, { notes: 'lean sacrifice, no infinite combos' })
    expect(prompt).toContain('lean sacrifice, no infinite combos')
  })

  it('omits the notes section when empty', () => {
    expect(buildDeckPrompt(commander, pool, { notes: '   ' })).not.toContain('Additional notes')
  })
})
