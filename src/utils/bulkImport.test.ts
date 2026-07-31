import { describe, it, expect } from 'vitest'
import { extractCardObjects, parseBulkCards, createObjectScanner } from './bulkImport'

// A representative Scryfall card: nested objects (prices, image_uris), an array of objects
// (all_parts), and a flavor_text with an escaped quote + newline — the tricky bits for a
// brace scanner. JSON.stringify guarantees valid escaping, so these mirror real bulk data.
const forest = {
  object: 'card',
  id: '0000419b-0bba-4488-8f7a-6194544ce91e',
  name: 'Forest',
  finishes: ['nonfoil', 'foil'],
  image_uris: { small: 'https://cards.scryfall.io/small/x.jpg', normal: 'https://cards.scryfall.io/normal/x.jpg' },
  all_parts: [{ object: 'related_card', name: 'Forest' }],
  prices: { usd: '0.35', eur: '0.22', eur_foil: '0.58', eur_etched: null }
}
const furySliver = {
  object: 'card',
  id: '0000579f-7b35-4ed3-b44c-db2a538066fe',
  name: 'Fury Sliver',
  flavor_text: '"A rift opened, and our arrows were abruptly stilled.\n—Adom Capashen, Benalish hero"',
  prices: { usd: '0.54', eur: '0.19', eur_foil: '2.57' }
}

describe('extractCardObjects', () => {
  it('parses JSON-lines / NDJSON (one compact object per line)', () => {
    const jsonl = JSON.stringify(forest) + '\n' + JSON.stringify(furySliver) + '\n'
    const cards = extractCardObjects(jsonl) as Array<{ id: string }>
    expect(cards).toHaveLength(2)
    expect(cards[0]!.id).toBe(forest.id)
    expect(cards[1]!.id).toBe(furySliver.id)
  })

  it('handles \\r\\n line endings', () => {
    const jsonl = JSON.stringify(forest) + '\r\n' + JSON.stringify(furySliver)
    expect(extractCardObjects(jsonl)).toHaveLength(2)
  })

  it('handles pretty-printed objects that span multiple lines (no array wrapper)', () => {
    const pretty = JSON.stringify(forest, null, 2) + '\n' + JSON.stringify(furySliver, null, 2)
    expect(extractCardObjects(pretty)).toHaveLength(2)
  })

  it('does not split on braces/quotes inside strings (escaped quote + newline)', () => {
    const cards = extractCardObjects(JSON.stringify(furySliver)) as Array<{ flavor_text: string }>
    expect(cards).toHaveLength(1)
    expect(cards[0]!.flavor_text).toContain('rift opened')
  })

  it('skips a malformed object without dropping the good ones', () => {
    const text = JSON.stringify(forest) + '\n{ not valid json }\n' + JSON.stringify(furySliver)
    expect(extractCardObjects(text)).toHaveLength(2)
  })
})

describe('createObjectScanner (streaming across chunk boundaries)', () => {
  const jsonl = JSON.stringify(forest) + '\n' + JSON.stringify(furySliver)

  it('stitches an object split across two feeds', () => {
    const out: unknown[] = []
    const feed = createObjectScanner(o => out.push(o))
    const mid = Math.floor(jsonl.length / 2) // likely inside the first object
    feed(jsonl.slice(0, mid))
    feed(jsonl.slice(mid))
    expect(out).toHaveLength(2)
  })

  it('handles tiny chunks, including splits inside escaped strings', () => {
    const out: Array<{ id: string }> = []
    const feed = createObjectScanner(o => out.push(o as { id: string }))
    for (const ch of jsonl) feed(ch) // one character at a time
    expect(out).toHaveLength(2)
    expect(out.map(c => c.id)).toEqual([forest.id, furySliver.id])
  })
})

describe('parseBulkCards', () => {
  it('fast-paths a JSON array (Scryfall\'s own format)', () => {
    expect(parseBulkCards(JSON.stringify([forest, furySliver]))).toHaveLength(2)
  })

  it('fast-paths a pretty-printed JSON array', () => {
    expect(parseBulkCards(JSON.stringify([forest, furySliver], null, 2))).toHaveLength(2)
  })

  it('falls back to the scanner for JSON-lines', () => {
    expect(parseBulkCards(JSON.stringify(forest) + '\n' + JSON.stringify(furySliver))).toHaveLength(2)
  })

  it('throws when there is nothing parseable', () => {
    expect(() => parseBulkCards('not json at all')).toThrow(/No cards found/)
  })
})
