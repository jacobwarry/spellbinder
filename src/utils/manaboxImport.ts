// Parse a ManaBox CSV export (the "Export collection" format) into rows we can
// resolve against Scryfall. ManaBox stamps every row with a `Scryfall ID`, so we
// match on that directly rather than fuzzy-matching names — the resulting cards are
// the exact printings the user scanned.

export interface ManaboxRow {
  name: string
  scryfallId: string
  setCode: string
  collectorNumber: string
  quantity: number
  foil: boolean
}

export interface ManaboxParseResult {
  rows: ManaboxRow[]
  /** Data rows we had to drop (missing/blank Scryfall ID), with a reason. */
  skipped: { line: number; name: string; reason: string }[]
  /** Total physical cards across all rows (sum of quantities). */
  totalCards: number
}

export class ManaboxParseError extends Error {}

/**
 * Split a single CSV line into fields, honoring double-quoted fields that may
 * contain commas or escaped (`""`) quotes — e.g. `"Momir Vig, Simic Visionary"`.
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++ // skip the escaped quote
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      fields.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

/** Split the raw file into logical rows, tolerating both LF and CRLF and a trailing newline. */
function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(line => line.length > 0)
}

export function parseManaboxCsv(text: string): ManaboxParseResult {
  const lines = splitLines(text)
  if (lines.length === 0) {
    throw new ManaboxParseError('The file is empty.')
  }

  const header = splitCsvLine(lines[0]!).map(h => h.trim().toLowerCase())
  const col = (name: string) => header.indexOf(name.toLowerCase())

  const idIdx = col('Scryfall ID')
  const nameIdx = col('Name')
  const qtyIdx = col('Quantity')
  const foilIdx = col('Foil')
  const setIdx = col('Set code')
  const numIdx = col('Collector number')

  if (idIdx === -1) {
    throw new ManaboxParseError(
      'This does not look like a ManaBox export — no "Scryfall ID" column found.'
    )
  }

  const rows: ManaboxRow[] = []
  const skipped: ManaboxParseResult['skipped'] = []
  let totalCards = 0

  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i]!)
    const scryfallId = (fields[idIdx] ?? '').trim()
    const name = (nameIdx !== -1 ? fields[nameIdx] ?? '' : '').trim()

    if (!scryfallId) {
      skipped.push({ line: i + 1, name: name || '(unknown)', reason: 'missing Scryfall ID' })
      continue
    }

    const quantity = Math.max(1, parseInt((qtyIdx !== -1 ? fields[qtyIdx] ?? '' : '').trim(), 10) || 1)
    const foilValue = (foilIdx !== -1 ? fields[foilIdx] ?? '' : '').trim().toLowerCase()
    const foil = foilValue !== '' && foilValue !== 'normal'

    rows.push({
      name,
      scryfallId,
      setCode: (setIdx !== -1 ? fields[setIdx] ?? '' : '').trim(),
      collectorNumber: (numIdx !== -1 ? fields[numIdx] ?? '' : '').trim(),
      quantity,
      foil
    })
    totalCards += quantity
  }

  if (rows.length === 0) {
    throw new ManaboxParseError('No importable rows found (every row was missing a Scryfall ID).')
  }

  return { rows, skipped, totalCards }
}
