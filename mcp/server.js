import fs from 'node:fs'
import path from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

/**
 * Spellbinder MCP server.
 *
 * Reads the JSON snapshot exported from the app ("Build with Claude" → Export JSON) and
 * exposes it as query tools, so Claude Desktop can build decks from the real collection
 * on a subscription instead of the API.
 *
 * IMPORTANT: stdout is the MCP protocol channel. Never console.log — a single stray write
 * corrupts the stream and the server dies with no useful error. Log to stderr only.
 */

const COLLECTION_PATH =
  process.env.SPELLBINDER_COLLECTION ?? path.resolve(process.cwd(), 'collection.json')

const DECKS_DIR = process.env.SPELLBINDER_DECKS ?? path.dirname(COLLECTION_PATH)

/** Bounded by default so a broad query can't flood the model's context. */
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 300

let collection = { version: 0, exportedAt: null, cards: [] }

function load() {
  try {
    const raw = fs.readFileSync(COLLECTION_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    collection = { ...parsed, cards: Array.isArray(parsed.cards) ? parsed.cards : [] }
    console.error(`[spellbinder] loaded ${collection.cards.length} cards from ${COLLECTION_PATH}`)
  } catch (error) {
    collection = { version: 0, exportedAt: null, cards: [] }
    console.error(`[spellbinder] could not read ${COLLECTION_PATH}: ${error.message}`)
  }
}

load()

// Pick up a re-export without restarting Claude Desktop. Editors often write via
// rename, which fires as 'rename' rather than 'change', so reload on any event.
try {
  fs.watch(COLLECTION_PATH, { persistent: false }, () => {
    setTimeout(load, 100) // let the writer finish before re-reading
  })
} catch {
  console.error('[spellbinder] file watch unavailable; restart to pick up a new export')
}

// ---- Query helpers

const NON_LAND_BASIC = /^Basic Land/

function fitsIdentity(card, identity) {
  const allowed = new Set(identity)
  return (card.colorIdentity ?? []).every((c) => allowed.has(c))
}

function isCommander(card) {
  const type = card.typeLine ?? ''
  if (type.includes('Legendary') && type.includes('Creature')) return true
  return /can be your commander/i.test(card.oracleText ?? '')
}

function formatCard(card) {
  const head = card.manaCost ? `${card.name} ${card.manaCost}` : card.name
  const copies = card.copies > 1 ? ` (x${card.copies})` : ''
  return [`${head}${copies}`, card.typeLine, card.oracleText].filter(Boolean).join(' | ')
}

/** Every tool answers with text; keep it compact and always state the total. */
function textResult(text) {
  return { content: [{ type: 'text', text }] }
}

function guardEmpty() {
  if (collection.cards.length > 0) return null
  return textResult(
    `No collection loaded. Export it from Spellbinder (Decks → Build with Claude → Export JSON) and save it to ${COLLECTION_PATH}.`
  )
}

const server = new McpServer({ name: 'spellbinder', version: '1.0.0' })

server.registerTool(
  'collection_stats',
  {
    description:
      'Overview of the owned Magic collection: total cards, breakdown by colour identity and card type. Call this first to orient before searching.',
    inputSchema: {}
  },
  async () => {
    const empty = guardEmpty()
    if (empty) return empty

    const byColor = {}
    const byType = {}
    for (const card of collection.cards) {
      const key = (card.colorIdentity ?? []).join('') || 'Colourless'
      byColor[key] = (byColor[key] ?? 0) + 1

      const primary = (card.typeLine ?? '').split('—')[0].trim().split(/\s+/).pop() ?? 'Unknown'
      byType[primary] = (byType[primary] ?? 0) + 1
    }

    const lines = [
      `${collection.cards.length} unique cards owned (exported ${collection.exportedAt ?? 'unknown'})`,
      '',
      'By colour identity:',
      ...Object.entries(byColor)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `  ${k}: ${v}`),
      '',
      'By type:',
      ...Object.entries(byType)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `  ${k}: ${v}`)
    ]
    return textResult(lines.join('\n'))
  }
)

server.registerTool(
  'list_commanders',
  {
    description:
      'List owned legendary creatures (and anything that says it can be your commander), optionally filtered to a colour identity.',
    inputSchema: {
      colors: z
        .array(z.enum(['W', 'U', 'B', 'R', 'G']))
        .optional()
        .describe('Only commanders whose identity is exactly within these colours')
    }
  },
  async ({ colors }) => {
    const empty = guardEmpty()
    if (empty) return empty

    let results = collection.cards.filter(isCommander)
    if (colors?.length) results = results.filter((c) => fitsIdentity(c, colors))

    if (results.length === 0) return textResult('No matching commanders in the collection.')

    return textResult(
      `${results.length} commanders:\n` + results.map((c) => formatCard(c)).join('\n')
    )
  }
)

server.registerTool(
  'search_cards',
  {
    description:
      'Search owned cards. Combine filters to find candidates for a deck: colour identity, type line text, oracle text, and mana value range. Returns a bounded page plus the total match count.',
    inputSchema: {
      colorIdentity: z
        .array(z.enum(['W', 'U', 'B', 'R', 'G']))
        .optional()
        .describe("Commander colour identity — only cards legal within it are returned"),
      types: z
        .array(z.string())
        .optional()
        .describe('Type line substrings, matched case-insensitively, ANY of them (e.g. ["Instant","Sorcery"])'),
      text: z
        .string()
        .optional()
        .describe('Case-insensitive substring to find in the oracle text (e.g. "sacrifice a creature")'),
      cmcMin: z.number().optional(),
      cmcMax: z.number().optional(),
      excludeBasicLands: z.boolean().optional().describe('Default true'),
      limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(`Default ${DEFAULT_LIMIT}`)
    }
  },
  async ({ colorIdentity, types, text, cmcMin, cmcMax, excludeBasicLands = true, limit = DEFAULT_LIMIT }) => {
    const empty = guardEmpty()
    if (empty) return empty

    const needle = text?.toLowerCase()
    const typeNeedles = types?.map((t) => t.toLowerCase())

    const matches = collection.cards.filter((card) => {
      if (excludeBasicLands && NON_LAND_BASIC.test(card.typeLine ?? '')) return false
      if (colorIdentity && !fitsIdentity(card, colorIdentity)) return false
      if (typeNeedles?.length) {
        const line = (card.typeLine ?? '').toLowerCase()
        if (!typeNeedles.some((t) => line.includes(t))) return false
      }
      if (needle && !(card.oracleText ?? '').toLowerCase().includes(needle)) return false
      if (cmcMin !== undefined && (card.cmc ?? 0) < cmcMin) return false
      if (cmcMax !== undefined && (card.cmc ?? 0) > cmcMax) return false
      return true
    })

    if (matches.length === 0) return textResult('No owned cards match those filters.')

    const page = matches.slice(0, limit)
    const header =
      page.length < matches.length
        ? `${matches.length} matches, showing ${page.length}. Narrow the filters or raise \`limit\` to see more.`
        : `${matches.length} matches.`

    return textResult(`${header}\n` + page.map((c) => formatCard(c)).join('\n'))
  }
)

server.registerTool(
  'get_card',
  {
    description: 'Full detail for one owned card by exact or partial name.',
    inputSchema: { name: z.string().describe('Card name, or a distinctive part of it') }
  },
  async ({ name }) => {
    const empty = guardEmpty()
    if (empty) return empty

    const needle = name.toLowerCase()
    const matches = collection.cards.filter((c) => c.name.toLowerCase().includes(needle))

    if (matches.length === 0) return textResult(`"${name}" is not in the collection.`)
    if (matches.length > 1 && !matches.some((c) => c.name.toLowerCase() === needle)) {
      return textResult(
        `${matches.length} cards match "${name}":\n` + matches.slice(0, 20).map((c) => c.name).join('\n')
      )
    }

    const card = matches.find((c) => c.name.toLowerCase() === needle) ?? matches[0]
    return textResult(
      [
        card.name,
        card.manaCost ? `Mana cost: ${card.manaCost} (mv ${card.cmc})` : `Mana value: ${card.cmc}`,
        card.typeLine,
        card.oracleText,
        `Colour identity: ${(card.colorIdentity ?? []).join('') || 'colourless'}`,
        `Owned copies: ${card.copies} · ${card.setName} · ${card.rarity}`
      ]
        .filter(Boolean)
        .join('\n')
    )
  }
)

server.registerTool(
  'save_deck',
  {
    description:
      'Save a finished decklist so Spellbinder can import it. Card names must match the collection exactly.',
    inputSchema: {
      name: z.string().describe('Deck name'),
      commander: z.string().describe('Commander card name'),
      cards: z.array(z.string()).describe('The 99 non-commander card names, one entry per card')
    }
  },
  async ({ name, commander, cards }) => {
    const known = new Set(collection.cards.map((c) => c.name.toLowerCase()))
    const unknown = cards.filter((c) => !known.has(c.toLowerCase()) && !/^(Plains|Island|Swamp|Mountain|Forest|Wastes)$/i.test(c))

    const safeName = name.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'deck'
    const file = path.join(DECKS_DIR, `${safeName}.deck.json`)

    fs.writeFileSync(
      file,
      JSON.stringify({ version: 1, name, commander, cards, savedAt: new Date().toISOString() }, null, 2)
    )

    const warning = unknown.length
      ? `\n\nWarning: ${unknown.length} name(s) are not in the collection and may be typos: ${unknown.join(', ')}`
      : ''

    return textResult(`Saved ${cards.length + 1} cards to ${file}${warning}`)
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('[spellbinder] MCP server running on stdio')
