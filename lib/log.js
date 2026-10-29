/**
 * The plugin's own diagnostic ring buffer, optionally mirrored to a file.
 *
 * The host writes one entry per route call, provider generation, and client
 * report; the settings card reads it back through `GET /dsh-auto-title/log`.
 * A user who cannot see a browser console still needs to know *which* step
 * failed, so entries carry the scope, the message, and a bounded detail.
 *
 * The mirror matters when the card itself is the thing that is broken: the
 * file can be read from disk (and pasted into an issue) without any UI.
 *
 * @module dsh-auto-title/log
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'

/** Entries kept in memory before the oldest are dropped. */
const LIMIT = 200
/** Characters of a detail kept; stack traces matter, giant payloads do not. */
const DETAIL_LIMIT = 2000
/** Lines kept in the mirror file; it is rotated by truncation. */
const FILE_LIMIT = 500

/**
 * Render one detail as a bounded string.
 * @param detail - anything worth recording.
 * @returns the string kept in the entry, or undefined.
 */
function renderDetail(detail) {
  if (detail === undefined || detail === null) return undefined
  let text
  if (typeof detail === 'string') {
    text = detail
  } else {
    try {
      text = JSON.stringify(detail)
    } catch {
      text = String(detail)
    }
  }
  return text.length > DETAIL_LIMIT ? `${text.slice(0, DETAIL_LIMIT)}…` : text
}

/**
 * Read the mirror back into memory so a restart does not lose the evidence.
 * @param file - the mirror path.
 * @param limit - how many lines to keep.
 * @returns the parsed entries, oldest first.
 */
function readMirror(file, limit) {
  if (!existsSync(file)) return []
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return []
  }
  const lines = text.split('\n').filter(line => line.trim() !== '')
  const kept = lines.slice(Math.max(0, lines.length - limit))
  const entries = []
  for (const line of kept) {
    try {
      const parsed = JSON.parse(line)
      if (parsed !== null && typeof parsed === 'object') entries.push(parsed)
    } catch {
      // A torn last line (process killed mid-write) is not worth reporting.
    }
  }
  return entries
}

/**
 * Create one log, optionally mirrored to a JSON-lines file.
 * @param options - `limit` overrides the entry cap, `file` the mirror path.
 * @returns the log handle used by the host half and its routes.
 */
export function createLog(options = {}) {
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : LIMIT
  const file = typeof options.file === 'string' && options.file !== '' ? options.file : null
  /** @type {Array<{ seq: number, ts: number, level: string, scope: string, message: string, detail?: string }>} */
  const entries = []
  let seq = 0
  if (file !== null) {
    for (const entry of readMirror(file, limit)) {
      const next = Number.isInteger(entry.seq) ? entry.seq : seq + 1
      seq = Math.max(seq, next)
      entries.push({ ...entry, seq: next })
    }
  }

  /**
   * Append one entry to the mirror, rotating by truncation.
   * @param entry - the entry just pushed.
   */
  const mirror = (entry) => {
    if (file === null) return
    try {
      appendFileSync(file, `${JSON.stringify(entry)}\n`, 'utf8')
      if (entries.length > 0 && entries.length % FILE_LIMIT === 0) {
        const kept = entries.slice(-FILE_LIMIT).map(item => JSON.stringify(item)).join('\n')
        writeFileSync(file, `${kept}\n`, 'utf8')
      }
    } catch {
      // A read-only plugin directory must not break naming.
    }
  }

  return {
    /**
     * Append one entry.
     * @param level - `info`, `warn`, or `error`.
     * @param scope - the emitting step, e.g. `route:title` or `client:apply`.
     * @param message - the human-readable line.
     * @param detail - optional extra context (error stack, payload).
     */
    push(level, scope, message, detail) {
      seq += 1
      const entry = {
        seq,
        ts: Date.now(),
        level: String(level ?? 'info'),
        scope: String(scope ?? 'host'),
        message: String(message ?? ''),
        ...(renderDetail(detail) === undefined ? {} : { detail: renderDetail(detail) }),
      }
      entries.push(entry)
      if (entries.length > limit) entries.splice(0, entries.length - limit)
      mirror(entry)
    },
    /** Record a thrown value with its stack. */
    error(scope, error, message) {
      const text = message ?? (error instanceof Error ? error.message : String(error))
      const detail = error instanceof Error ? error.stack : undefined
      this.push('error', scope, text, detail)
    },
    /**
     * The newest entries first.
     * @param count - how many to return (default: all retained).
     * @returns the entries, newest first.
     */
    list(count) {
      const wanted = Number.isInteger(count) && count > 0 ? Math.min(count, entries.length) : entries.length
      return entries.slice(entries.length - wanted).reverse()
    },
    /** Drop every entry, in memory and on disk. */
    clear() {
      entries.length = 0
      if (file === null) return
      try {
        writeFileSync(file, '', 'utf8')
      } catch {
        // Same reasoning as `mirror`.
      }
    },
    /** @returns the number of retained entries. */
    size() {
      return entries.length
    },
    /** @returns the mirror path, or null when the log is memory-only. */
    file() {
      return file
    },
  }
}
