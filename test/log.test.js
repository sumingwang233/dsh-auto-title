import assert from 'node:assert/strict'
import test from 'node:test'
import { appendFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createLog } from '../lib/log.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const MIRROR = join(HERE, '.tmp-log.jsonl')

/** Remove the mirror before and after a case. */
function reset() {
  if (existsSync(MIRROR)) rmSync(MIRROR)
}

test('the mirror keeps the evidence across a restart', () => {
  reset()
  const first = createLog({ file: MIRROR })
  first.push('info', 'apply', 'provider registered')
  first.push('error', 'route:title', 'no route', 'stack line')
  assert.ok(existsSync(MIRROR))
  assert.equal(readFileSync(MIRROR, 'utf8').trim().split('\n').length, 2)

  // A fresh process reads the same file back: newest first, sequence preserved.
  const second = createLog({ file: MIRROR })
  const entries = second.list(10)
  assert.deepEqual(entries.map(entry => entry.message), ['no route', 'provider registered'])
  assert.equal(entries[0].detail, 'stack line')
  assert.equal(entries[0].seq, 2)

  // New entries continue the sequence instead of restarting it.
  second.push('info', 'apply', 'third')
  assert.equal(second.list(1)[0].seq, 3)
  reset()
})

test('clearing drops the mirror too', () => {
  reset()
  const log = createLog({ file: MIRROR })
  log.push('info', 'apply', 'one')
  log.clear()
  assert.equal(log.size(), 0)
  assert.equal(readFileSync(MIRROR, 'utf8'), '')
  // A restart after a clear starts empty rather than resurrecting entries.
  assert.equal(createLog({ file: MIRROR }).size(), 0)
  reset()
})

test('a torn last line is skipped, not fatal', () => {
  reset()
  const log = createLog({ file: MIRROR })
  log.push('info', 'apply', 'kept')
  // Simulate a process killed mid-write.
  appendFileSync(MIRROR, '{"seq":2,"ts":1,"level":"info","sco')
  const reloaded = createLog({ file: MIRROR })
  assert.deepEqual(reloaded.list(10).map(entry => entry.message), ['kept'])
  reset()
})

test('a log without a file stays in memory', () => {
  const log = createLog()
  log.push('info', 'apply', 'only memory')
  assert.equal(log.file(), null)
  assert.equal(log.list(1)[0].message, 'only memory')
})
