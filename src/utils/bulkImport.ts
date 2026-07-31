/**
 * Parsing for Scryfall "bulk data" card dumps that the user downloads and feeds in by hand
 * (see the control panel). Scryfall's Default Cards file is ~500 MB+ — past V8's max string
 * length (~536,870,911 chars) — so it can't be read into a single string. Everything here
 * is built around a chunk-at-a-time scanner so the file is streamed, never fully held in
 * memory. Also tolerant of format: JSON array, JSON-lines / NDJSON, pretty-printed, gzip,
 * and UTF-16.
 */

/**
 * Incremental object scanner. Returns a `feed(chunk)` function; call it with successive
 * text chunks and it emits each complete top-level `{…}` object via `onObject`, tracking
 * brace depth + string state across chunk boundaries. A malformed object is skipped rather
 * than aborting the run. Because it never holds more than the current in-flight object, it
 * scales to arbitrarily large inputs.
 */
export function createObjectScanner(onObject: (obj: unknown) => void) {
  let carry = '' // trailing text of an object that spilled past the last chunk

  return function feed(chunk: string): void {
    // `carry` always starts at a top-level `{`, so re-scanning carry+chunk from a clean
    // state correctly reconstructs depth/string state through the carry and into the chunk.
    const s = carry ? carry + chunk : chunk
    let depth = 0
    let inString = false
    let escaped = false
    let objStart = -1
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i)
      if (inString) {
        if (escaped) escaped = false
        else if (c === 92) escaped = true // backslash
        else if (c === 34) inString = false // closing quote
        continue
      }
      if (c === 34) {
        inString = true // opening quote
      } else if (c === 123) {
        if (depth === 0) objStart = i // top-level object begins
        depth++
      } else if (c === 125 && depth > 0) {
        depth--
        if (depth === 0 && objStart !== -1) {
          try {
            onObject(JSON.parse(s.slice(objStart, i + 1)))
          } catch {
            /* skip one malformed object */
          }
          objStart = -1
        }
      }
    }
    carry = objStart !== -1 ? s.slice(objStart) : ''
  }
}

/** Non-streaming convenience: extract every top-level object from a string (small inputs). */
export function extractCardObjects(text: string): unknown[] {
  const out: unknown[] = []
  createObjectScanner(o => out.push(o))(text)
  return out
}

/**
 * Parse an in-memory bulk dump. Fast-paths a well-formed JSON array (Scryfall's own files);
 * otherwise falls back to the tolerant scanner. For very large files use `streamBulkCards`.
 */
export function parseBulkCards(text: string): unknown[] {
  const clean = text.replace(/^﻿/, '') // strip a leading BOM if the decoder left one
  if (clean.trimStart().startsWith('[')) {
    try {
      const parsed = JSON.parse(clean)
      if (Array.isArray(parsed)) return parsed
    } catch {
      // malformed/truncated array — fall through to the scanner
    }
  }
  const cards = extractCardObjects(clean)
  if (cards.length === 0) {
    throw new Error('No cards found. Expected Scryfall bulk data (JSON or JSON-lines).')
  }
  return cards
}

/** Pick a byte stream + text decoder for the file, gunzipping and honoring UTF-16 BOMs. */
async function openBulkStream(file: File): Promise<{ stream: ReadableStream<Uint8Array>; decoder: TextDecoder }> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  if (head[0] === 0x1f && head[1] === 0x8b) {
    const DS = (globalThis as { DecompressionStream?: new (format: string) => ReadableWritablePair<Uint8Array, Uint8Array> }).DecompressionStream
    if (!DS) throw new Error("This is a gzip (.gz) file and this browser can't unzip it — please unzip it first.")
    return { stream: file.stream().pipeThrough(new DS('gzip')), decoder: new TextDecoder('utf-8') }
  }
  if (head[0] === 0xff && head[1] === 0xfe) return { stream: file.stream(), decoder: new TextDecoder('utf-16le') }
  if (head[0] === 0xfe && head[1] === 0xff) return { stream: file.stream(), decoder: new TextDecoder('utf-16be') }
  return { stream: file.stream(), decoder: new TextDecoder('utf-8') } // UTF-8 BOM auto-stripped
}

/**
 * Stream a bulk file and emit every top-level card object via `onCard`, without ever
 * materializing the whole file as a string. Handles gzip + UTF-16 transparently. This is
 * the path the control panel uses; `onProgress` reports bytes read so far.
 */
export async function streamBulkCards(
  file: File,
  onCard: (card: unknown) => void,
  onProgress?: (bytesRead: number, totalBytes: number) => void
): Promise<void> {
  const { stream, decoder } = await openBulkStream(file)
  const reader = stream.getReader()
  const feed = createObjectScanner(onCard)
  let bytesRead = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value && value.byteLength) {
      bytesRead += value.byteLength
      feed(decoder.decode(value, { stream: true }))
      onProgress?.(bytesRead, file.size)
    }
  }
  const tail = decoder.decode() // flush any buffered multi-byte remainder
  if (tail) feed(tail)
}
