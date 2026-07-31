# Spellbinder MCP server

Exposes your owned collection to **Claude Desktop** as query tools, so you can build decks
against the cards you actually have. Runs on your Claude subscription — no API key, no credits.

Spellbinder is browser-only, so its data can't be read directly by a Node process. The app
exports a JSON snapshot; this server reads it.

## Setup

```bash
cd mcp
npm install
npm run smoke     # verifies the server works before you wire it up
```

**1. Export your collection.** In Spellbinder: **Decks → Build with Claude → Export JSON**.
Save the downloaded `collection.json` next to `server.js` (or anywhere, see the env vars below).

**2. Register the server.** Edit `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "spellbinder": {
      "command": "node",
      "args": ["D:\\Projects\\spellbinder\\mcp\\server.js"],
      "env": {
        "SPELLBINDER_COLLECTION": "D:\\Projects\\spellbinder\\mcp\\collection.json"
      }
    }
  }
}
```

Use absolute paths with escaped backslashes. Relative paths will not resolve.

**3. Fully quit and relaunch Claude Desktop.** Closing the window is not enough — the server
is spawned at startup, so config changes need a real restart.

The server appears under the connectors menu (the `/` button next to the message box).

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `SPELLBINDER_COLLECTION` | `./collection.json` | Path to the exported snapshot |
| `SPELLBINDER_DECKS` | same folder as the collection | Where `save_deck` writes |

## Tools

| Tool | Purpose |
|---|---|
| `collection_stats` | Totals by colour identity and type. Good opener for orientation. |
| `list_commanders` | Owned legendary creatures, optionally filtered by colour |
| `search_cards` | Filter by colour identity, type, oracle text, mana value. Bounded results plus a total. |
| `get_card` | Full detail for one card |
| `save_deck` | Writes `<name>.deck.json` for Spellbinder to import |

## Usage

> Build me a Prossh, Skyraider of Kher deck from my collection. Check what I own first, then
> save it when you're happy with the list.

Claude will call `collection_stats`, then run several `search_cards` queries as it works out
what the deck needs, then `save_deck`. Expect a dozen or more tool calls — that iterative
searching is the point, and it costs nothing on a subscription.

## Notes

- **Re-export whenever your collection changes.** The server watches the file and reloads
  automatically, so you don't need to restart Claude Desktop for a refresh.
- **`search_cards` returns the commander too.** It's a general-purpose search; tell Claude to
  exclude the commander from the 99, or just check the final list.
- **Banned cards are not filtered.** `legalities` isn't in Spellbinder's Scryfall cache yet, so
  nothing here knows about the Commander ban list.
- **Never `console.log` in `server.js`.** stdout is the MCP protocol channel — a stray write
  corrupts the stream and the server dies without a useful error. Use `console.error`.
- **Logs:** `%APPDATA%\Claude\logs\mcp-server-spellbinder.log`.
