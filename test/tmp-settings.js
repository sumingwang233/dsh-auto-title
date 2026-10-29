/**
 * Points the settings store (and the log file that lives beside it) at a
 * throwaway path inside `test/.tmp/`, so a test run never touches the real
 * profile configuration nor leaves files in the package directory.
 *
 * Imported first by every suite that loads `lib/index.js`.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const TMP_DIR = join(import.meta.dirname, '.tmp')
mkdirSync(TMP_DIR, { recursive: true })

export const SETTINGS_PATH = join(TMP_DIR, `settings-${process.pid}.json`)

process.env.DSH_AUTO_TITLE_SETTINGS = SETTINGS_PATH
