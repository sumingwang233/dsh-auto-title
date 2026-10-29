/**
 * File-backed overrides for the settings card.
 *
 * The Loader row's `config:` is the deployment's baseline; the card writes
 * `settings.json` beside this package instead of rewriting the user's profile
 * patch, so a change survives a restart and never touches generated files.
 * Every read is mtime-checked, so a save takes effect on the next title
 * without restarting the desktop app.
 *
 * @module dsh-auto-title/settings
 */

import { readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** File name written next to the package root. */
const FILE_NAME = 'settings.json'
/** Package root (`<pkg>/lib/settings.js` → `<pkg>`). */
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

/** The only keys the card may override. */
export const EDITABLE_KEYS = Object.freeze([
  'enabled',
  'provider',
  'model',
  'language',
  'maxTitleLength',
  'maxInputChars',
  'maxOutputTokens',
  'waitForReplyMs',
  'timeoutMs',
])

/**
 * Keep only the editable keys.
 * @param source - any parsed object.
 * @returns the subset the card owns.
 */
function pickEditable(source) {
  const result = {}
  for (const key of EDITABLE_KEYS) {
    if (Object.hasOwn(source, key)) result[key] = source[key]
  }
  return result
}

/** @returns the absolute path of the overrides file. */
export function settingsPath() {
  // `DSH_AUTO_TITLE_SETTINGS` relocates the file: tests use it, and a user who
  // wants the overrides outside the package directory can point it anywhere.
  const override = typeof process.env.DSH_AUTO_TITLE_SETTINGS === 'string'
    ? process.env.DSH_AUTO_TITLE_SETTINGS.trim()
    : ''
  return override === '' ? join(ROOT, FILE_NAME) : override
}

/**
 * @returns the absolute path of the diagnostic log mirror, beside the
 * overrides file so both live where the user already looks.
 */
export function logPath() {
  return join(dirname(settingsPath()), 'log.jsonl')
}

/**
 * Read the overrides file.
 * @returns the parsed object, or an empty object when absent or unreadable.
 */
export async function readOverrides() {
  try {
    const text = await readFile(settingsPath(), 'utf8')
    const parsed = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return pickEditable(parsed)
  } catch {
    return {}
  }
}

/**
 * Merge one patch into the overrides file.
 * @param patch - the fields to change; only editable keys are honoured.
 * @returns the merged overrides.
 */
export async function writeOverrides(patch) {
  const current = await readOverrides()
  const merged = { ...current, ...pickEditable(patch) }
  await writeFile(settingsPath(), `${JSON.stringify(merged, null, 2)}\n`, 'utf8')
  return merged
}

/**
 * Drop every override, restoring the Loader row's baseline.
 * @returns the (now empty) overrides.
 */
export async function clearOverrides() {
  await writeFile(settingsPath(), '{}\n', 'utf8')
  return {}
}

/**
 * The overrides' modification time, used to skip re-reading an unchanged file.
 * @returns the mtime in milliseconds, or 0 when the file does not exist.
 */
export async function overridesMtime() {
  try {
    const info = await stat(settingsPath())
    return info.mtimeMs
  } catch {
    return 0
  }
}
