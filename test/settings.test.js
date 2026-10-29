/**
 * The settings card's host side: the override store and the two routes that
 * back it. The overrides file is redirected to a temp path so the test never
 * writes into the package directory.
 */

import assert from 'node:assert/strict'
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

import { clearOverrides, EDITABLE_KEYS, readOverrides, settingsPath, writeOverrides } from '../lib/settings.js'

const { SETTINGS_PATH: SETTINGS } = await import('./tmp-settings.js')

const { apply } = await import('../lib/index.js')

/** A request body as the handler's `for await` loop sees it. */
function requestOf(method, body, url = '/') {
  return {
    method,
    url,
    async* [Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(JSON.stringify(body), 'utf8')
    },
  }
}

/** A response capturing what the handler wrote. */
function responseOf() {
  const captured = { status: 0, body: undefined }
  return {
    captured,
    setHeader() {},
    writeHead(status) { captured.status = status },
    end(body) { captured.body = body },
  }
}

/** One request against a registered route; the query string rides on `req.url`. */
async function call(routes, path, method, body) {
  const [routePath, query] = path.split('?')
  const response = responseOf()
  const handler = routes.get(routePath)
  assert.equal(typeof handler, 'function', `no route registered for ${routePath}`)
  await handler(requestOf(method, body, query === undefined ? routePath : `${routePath}?${query}`), response)
  return { status: response.captured.status, payload: JSON.parse(response.captured.body) }
}

/** A plugin context with the services `apply` touches. */
function createHost({ config = {} } = {}) {
  const routes = new Map()
  const webCtx = {
    effect(callback) { callback() },
    webServer: {
      register(route) {
        routes.set(route.path, route.handler)
        return () => { routes.delete(route.path) }
      },
    },
  }
  const ctx = {
    logger: { info() {}, debug() {}, error() {}, warn() {} },
    effect(callback) { callback() },
    on() { return () => {} },
    sessionTitle: { register() { return () => {} } },
    sessionController: {},
    llm: { stream: () => (async function* () {})() },
    inject(deps, callback) {
      assert.deepEqual(deps, ['webServer'])
      callback(webCtx)
    },
  }
  apply(ctx, config)
  return { ctx, routes }
}

test.afterEach(async () => {
  await rm(SETTINGS, { force: true })
})

test('the override store keeps only editable keys and merges patches', async () => {
  assert.deepEqual(await readOverrides(), {})
  await writeOverrides({ maxTitleLength: 18, bogus: 1 })
  assert.deepEqual(await readOverrides(), { maxTitleLength: 18 })
  await writeOverrides({ provider: 'deepseek', model: 'deepseek-chat' })
  assert.deepEqual(await readOverrides(), { maxTitleLength: 18, provider: 'deepseek', model: 'deepseek-chat' })
  assert.ok(EDITABLE_KEYS.includes('maxTitleLength'))
  assert.ok(settingsPath().endsWith('.json'))
})

test('clearing the overrides restores an empty file', async () => {
  await writeOverrides({ language: 'zh' })
  assert.deepEqual(await clearOverrides(), {})
  assert.deepEqual(await readOverrides(), {})
})

test('the config route reports the effective configuration and its path', async () => {
  const { routes } = createHost({ config: { maxTitleLength: 20 } })
  await writeOverrides({ provider: 'deepseek', model: 'deepseek-chat' })
  const { status, payload } = await call(routes, '/dsh-auto-title/config', 'GET')
  assert.equal(status, 200)
  // The card's override wins over the Loader row's baseline.
  assert.equal(payload.effective.provider, 'deepseek')
  assert.equal(payload.effective.maxTitleLength, 20)
  assert.equal(payload.settingsPath, SETTINGS)
  assert.deepEqual(payload.overrides, { provider: 'deepseek', model: 'deepseek-chat' })
  assert.deepEqual(payload.base, { maxTitleLength: 20 })
})

test('the config route persists a patch and a reset', async () => {
  const { routes } = createHost({})
  const saved = await call(routes, '/dsh-auto-title/config', 'POST', { patch: { provider: 'p', model: 'm', maxTitleLength: 30 } })
  assert.equal(saved.status, 200)
  assert.equal(saved.payload.effective.maxTitleLength, 30)
  assert.deepEqual(await readOverrides(), { provider: 'p', model: 'm', maxTitleLength: 30 })

  const reset = await call(routes, '/dsh-auto-title/config', 'POST', { reset: true })
  assert.equal(reset.status, 200)
  assert.deepEqual(await readOverrides(), {})
})

test('the config route rejects a patch that resolves to an invalid configuration', async () => {
  const { routes } = createHost({})
  const { status, payload } = await call(routes, '/dsh-auto-title/config', 'POST', { patch: { maxTitleLength: 0 } })
  assert.equal(status, 400)
  assert.equal(payload.code, 'invalid-config')
  // The rejected value never reached the file.
  assert.deepEqual(await readOverrides(), {})
})

test('the log route records, lists and clears entries', async () => {
  const { routes } = createHost({})
  const written = await call(routes, '/dsh-auto-title/log', 'POST', {
    level: 'error',
    scope: 'menu',
    message: 'proposal failed',
    detail: 'HTTP 500',
  })
  assert.equal(written.status, 200)

  const listed = await call(routes, '/dsh-auto-title/log?limit=20', 'GET')
  assert.equal(listed.status, 200)
  const entry = listed.payload.entries.find(item => item.message === 'proposal failed')
  assert.equal(entry.level, 'error')
  assert.equal(entry.scope, 'menu')
  assert.equal(entry.detail, 'HTTP 500')

  await call(routes, '/dsh-auto-title/log', 'POST', { clear: true })
  const cleared = await call(routes, '/dsh-auto-title/log?limit=20', 'GET')
  assert.equal(cleared.payload.entries.length, 0)
})

test('a malformed settings file reads as no overrides', async () => {
  await writeFile(SETTINGS, '{not json', 'utf8')
  assert.deepEqual(await readOverrides(), {})
})

test('the routes refuse an unsupported method', async () => {
  const { routes } = createHost({})
  const { status, payload } = await call(routes, '/dsh-auto-title/config', 'DELETE')
  assert.equal(status, 405)
  assert.equal(payload.code, 'method-not-allowed')
})
