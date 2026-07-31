import { describe, it, expect } from 'vitest'
import { parseManaboxCsv, ManaboxParseError } from './manaboxImport'

const HEADER = 'Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID'

describe('parseManaboxCsv', () => {
  it('parses a basic row and sums totals', () => {
    const csv = [HEADER, 'Storm Crow,PLST,The List,POR-69,normal,common,1,98118,abc-123'].join('\n')
    const result = parseManaboxCsv(csv)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      name: 'Storm Crow',
      scryfallId: 'abc-123',
      setCode: 'PLST',
      collectorNumber: 'POR-69',
      quantity: 1,
      foil: false
    })
    expect(result.totalCards).toBe(1)
  })

  it('handles quoted fields containing commas', () => {
    const csv = [HEADER, '"Momir Vig, Simic Visionary",PLST,The List,GK2-119,normal,rare,1,97528,def-456'].join('\n')
    const result = parseManaboxCsv(csv)
    expect(result.rows[0]!.name).toBe('Momir Vig, Simic Visionary')
    expect(result.rows[0]!.scryfallId).toBe('def-456')
  })

  it('sums quantity into totalCards and treats non-normal finish as foil', () => {
    const csv = [
      HEADER,
      'Questing Beast,PLST,The List,ELD-171,foil,mythic,2,85949,ghi-789',
      'Basic,PLST,The List,X-1,etched,common,3,1,jkl-000'
    ].join('\n')
    const result = parseManaboxCsv(csv)
    expect(result.totalCards).toBe(5)
    expect(result.rows[0]).toMatchObject({ quantity: 2, foil: true })
    expect(result.rows[1]).toMatchObject({ quantity: 3, foil: true })
  })

  it('skips rows with a blank Scryfall ID but keeps the rest', () => {
    const csv = [
      HEADER,
      'Good,PLST,The List,1,normal,common,1,1,has-id',
      'Bad,PLST,The List,2,normal,common,1,2,'
    ].join('\n')
    const result = parseManaboxCsv(csv)
    expect(result.rows).toHaveLength(1)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0]).toMatchObject({ name: 'Bad', reason: 'missing Scryfall ID' })
  })

  it('tolerates CRLF line endings and a trailing newline', () => {
    const csv = [HEADER, 'A,PLST,The List,1,normal,common,1,1,id-a', ''].join('\r\n')
    const result = parseManaboxCsv(csv)
    expect(result.rows).toHaveLength(1)
  })

  it('defaults a missing/unparseable quantity to 1', () => {
    const csv = [HEADER, 'A,PLST,The List,1,normal,common,,1,id-a'].join('\n')
    expect(parseManaboxCsv(csv).rows[0]!.quantity).toBe(1)
  })

  it('throws when the Scryfall ID column is absent', () => {
    const csv = ['Name,Quantity', 'A,1'].join('\n')
    expect(() => parseManaboxCsv(csv)).toThrow(ManaboxParseError)
  })

  it('throws when no importable rows remain', () => {
    const csv = [HEADER, 'A,PLST,The List,1,normal,common,1,1,'].join('\n')
    expect(() => parseManaboxCsv(csv)).toThrow(ManaboxParseError)
  })
})
