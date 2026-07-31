import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

/**
 * End-to-end check that the server speaks MCP and the query filters behave.
 * Self-contained: writes its own fixture to a temp dir. Run with `npm run smoke`.
 */

const here = path.dirname(fileURLToPath(import.meta.url))

const FIXTURE = {
  version: 1,
  exportedAt: '2026-01-01T00:00:00Z',
  cards: [
    { name: 'Prossh, Skyraider of Kher', manaCost: '{4}{B}{R}{G}', cmc: 7, typeLine: 'Legendary Creature — Dragon', oracleText: 'When you cast this spell, create X 0/1 red Kobold creature tokens.', colorIdentity: ['B', 'R', 'G'], copies: 1, rarity: 'mythic', setName: 'Gatecrash' },
    { name: 'Cultivate', manaCost: '{2}{G}', cmc: 3, typeLine: 'Sorcery', oracleText: 'Search your library for up to two basic land cards.', colorIdentity: ['G'], copies: 2, rarity: 'common', setName: 'Commander 2014' },
    { name: 'Counterspell', manaCost: '{U}{U}', cmc: 2, typeLine: 'Instant', oracleText: 'Counter target spell.', colorIdentity: ['U'], copies: 1, rarity: 'common', setName: 'Modern Horizons 2' },
    { name: "Ashnod's Altar", manaCost: '{3}', cmc: 3, typeLine: 'Artifact', oracleText: 'Sacrifice a creature: Add {C}{C}.', colorIdentity: [], copies: 1, rarity: 'uncommon', setName: 'Antiquities' },
    { name: 'Forest', manaCost: '', cmc: 0, typeLine: 'Basic Land — Forest', oracleText: '', colorIdentity: ['G'], copies: 20, rarity: 'common', setName: 'Core Set 2021' }
  ]
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spellbinder-mcp-'))
fs.writeFileSync(path.join(tmp, 'collection.json'), JSON.stringify(FIXTURE))

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(here, 'server.js')],
  env: {
    ...process.env,
    SPELLBINDER_COLLECTION: path.join(tmp, 'collection.json'),
    SPELLBINDER_DECKS: tmp
  }
})

const client = new Client({ name: 'smoke', version: '1.0.0' })
await client.connect(transport)

let failures = 0
function check(label, condition, detail) {
  if (condition) {
    console.log(`  ok   ${label}`)
  } else {
    failures += 1
    console.log(`  FAIL ${label}\n${detail}`)
  }
}

async function call(name, args = {}) {
  const res = await client.callTool({ name, arguments: args })
  return res.content[0].text
}

const { tools } = await client.listTools()
check(
  'all five tools registered',
  ['collection_stats', 'list_commanders', 'search_cards', 'get_card', 'save_deck'].every((t) =>
    tools.some((x) => x.name === t)
  ),
  tools.map((t) => t.name).join(', ')
)

const stats = await call('collection_stats')
check('stats report the card count', stats.includes('5 unique cards'), stats)

const commanders = await call('list_commanders')
check('finds the one legendary creature', commanders.includes('Prossh'), commanders)
check('does not list non-commanders', !commanders.includes('Cultivate'), commanders)

const brg = await call('search_cards', { colorIdentity: ['B', 'R', 'G'] })
check('colour identity keeps legal cards', brg.includes('Cultivate') && brg.includes("Ashnod's Altar"), brg)
check('colour identity rejects off-colour cards', !brg.includes('Counterspell'), brg)
check('basics excluded by default', !brg.includes('Forest'), brg)

const withBasics = await call('search_cards', { colorIdentity: ['B', 'R', 'G'], excludeBasicLands: false })
check('basics included on request', withBasics.includes('Forest'), withBasics)

const byText = await call('search_cards', { text: 'sacrifice a creature' })
check('oracle text search matches', byText.includes("Ashnod's Altar"), byText)

const byType = await call('search_cards', { types: ['Instant', 'Sorcery'] })
check('type filter matches any listed type', byType.includes('Cultivate') && byType.includes('Counterspell'), byType)

const byCmc = await call('search_cards', { cmcMax: 2 })
check('mana value filter applies', byCmc.includes('Counterspell') && !byCmc.includes('Cultivate'), byCmc)

const limited = await call('search_cards', { limit: 1 })
check('limit truncates and says so', limited.includes('showing 1'), limited)

const card = await call('get_card', { name: 'Cultivate' })
check('get_card returns detail', card.includes('Owned copies: 2'), card)

const missing = await call('get_card', { name: 'Black Lotus' })
check('get_card reports absent cards', missing.includes('not in the collection'), missing)

const saved = await call('save_deck', {
  name: 'Smoke Deck',
  commander: 'Prossh, Skyraider of Kher',
  cards: ['Cultivate', 'Forest', 'Bogus Card']
})
check('save_deck writes a file', fs.existsSync(path.join(tmp, 'Smoke Deck.deck.json')), saved)
check('save_deck flags unknown names', saved.includes('Bogus Card'), saved)
check('save_deck does not flag basics', !saved.includes('Forest'), saved)

await client.close()
fs.rmSync(tmp, { recursive: true, force: true })

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
