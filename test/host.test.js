import assert from 'node:assert/strict'
import test from 'node:test'

import './tmp-settings.js'
import { apply } from '../lib/index.js'

/** A Cordis-shaped host recording what the plugin asks of it. */
function createHost({ chunks = [], registerThrows = false } = {}) {
  const listeners = new Set()
  const calls = { streams: [], registered: undefined, disposals: 0, warnings: [], teardowns: [] }
  const logger = { info() {}, debug() {}, error() {}, warn: message => calls.warnings.push(message) }
  const ctx = {
    logger,
    effect(callback) {
      const dispose = callback()
      if (typeof dispose === 'function') calls.teardowns.push(dispose)
    },
    on(_name, handler) {
      listeners.add(handler)
      return () => listeners.delete(handler)
    },
    sessionTitle: {
      register(provider) {
        if (registerThrows) throw new Error('another provider is registered')
        calls.registered = provider
        return () => {
          calls.disposals += 1
        }
      },
    },
    llm: {
      stream(options) {
        calls.streams.push(options)
        return (async function* () {
          yield* chunks
        })()
      },
    },
    emit(session, event) {
      for (const handler of [...listeners]) handler(session, event)
    },
  }
  return { ctx, calls, listeners }
}

/** The request a provider receives for a session whose first prompt is recorded. */
function promptRequest({ session = { id: 's1' }, text = '帮我做一个自动重命名会话的插件', seq = 1, route = { provider: 'logged', model: 'logged-model' } } = {}) {
  const controller = new AbortController()
  return {
    session,
    messages: [{ seq, text }],
    signal: controller.signal,
    route,
    controller,
  }
}

const ANSWER_CHUNKS = [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text: '标题：' },
  { type: 'text-delta', index: 0, text: 'DSH 插件｜会话自动命名' },
  { type: 'block-end', index: 0, block: { type: 'text', text: 'DSH 插件｜会话自动命名' } },
  { type: 'finish', reason: { kind: 'stop' } },
]

test('apply registers the sole title provider and disposes it with the plugin', () => {
  const { ctx, calls } = createHost()
  apply(ctx, {})
  assert.equal(calls.registered.id, 'dsh-auto-title')
  assert.equal(calls.registered.automatic, 'first-prompt')
  assert.equal(typeof calls.registered.generate, 'function')
  assert.equal(calls.teardowns.length, 1)
  calls.teardowns[0]()
  assert.equal(calls.disposals, 1)
})

test('apply stays inert when disabled', () => {
  const { ctx, calls } = createHost()
  apply(ctx, { enabled: false })
  assert.equal(calls.registered, undefined)
  assert.equal(calls.teardowns.length, 0)
})

test('apply warns instead of throwing when another provider owns the slot', () => {
  const { ctx, calls } = createHost({ registerThrows: true })
  assert.doesNotThrow(() => apply(ctx, {}))
  assert.equal(calls.teardowns.length, 1)
  assert.match(calls.warnings[0], /another provider is registered/u)
})

test('generate titles from the prompt and the first assistant reply', async () => {
  const { ctx, calls } = createHost({ chunks: ANSWER_CHUNKS })
  apply(ctx, {})
  const request = promptRequest()
  setTimeout(() => {
    ctx.emit(request.session, { seq: 2, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '好的，先做调研。' }] } } })
  }, 5)
  const revision = await calls.registered.generate(request)
  assert.equal(revision.title, 'DSH 插件｜会话自动命名')
  assert.deepEqual(revision.messageSeqs, [1])
  assert.equal(calls.streams.length, 1)
  assert.match(calls.streams[0].messages[0].content[0].text, /Assistant reply \(excerpt\):\n好的，先做调研。/u)
})

test('generate falls back to the prompt when no reply arrives in time', async () => {
  const { ctx, calls } = createHost({ chunks: ANSWER_CHUNKS })
  apply(ctx, { waitForReplyMs: 20 })
  const request = promptRequest()
  const revision = await calls.registered.generate(request)
  assert.equal(revision.title, 'DSH 插件｜会话自动命名')
  assert.equal(calls.streams[0].messages[0].content[0].text, 'User request:\n帮我做一个自动重命名会话的插件')
})

test('generate uses the logged route unless a route is configured', async () => {
  const { ctx, calls } = createHost({ chunks: ANSWER_CHUNKS })
  apply(ctx, { waitForReplyMs: 20 })
  await calls.registered.generate(promptRequest({ route: { provider: 'logged', model: 'logged-model' } }))
  assert.deepEqual([calls.streams[0].provider, calls.streams[0].model], ['logged', 'logged-model'])
})

test('generate prefers the configured route over the logged one', async () => {
  const { ctx, calls } = createHost({ chunks: ANSWER_CHUNKS })
  apply(ctx, { provider: 'deepseek', model: 'deepseek-chat', waitForReplyMs: 20 })
  const revision = await calls.registered.generate(promptRequest({ route: { provider: 'logged', model: 'logged-model' } }))
  assert.deepEqual([calls.streams[0].provider, calls.streams[0].model], ['deepseek', 'deepseek-chat'])
  assert.deepEqual(revision.model, { provider: 'deepseek', model: 'deepseek-chat' })
})

test('generate surfaces a model failure with its code', async () => {
  const { ctx, calls } = createHost({
    chunks: [{ type: 'finish', reason: { kind: 'error', failure: { code: 'RATE_LIMITED', message: 'slow down' } } }],
  })
  apply(ctx, { waitForReplyMs: 10 })
  await assert.rejects(calls.registered.generate(promptRequest()), /slow down/u)
})

test('generate rejects a stream that ends without a finish reason', async () => {
  const { ctx, calls } = createHost({ chunks: [{ type: 'text-delta', index: 0, text: 'x' }] })
  apply(ctx, { waitForReplyMs: 10 })
  await assert.rejects(calls.registered.generate(promptRequest()), /without a finish reason/u)
})

test('generate rejects when no route is available at all', async () => {
  const { ctx, calls } = createHost({ chunks: ANSWER_CHUNKS })
  apply(ctx, { waitForReplyMs: 10 })
  await assert.rejects(calls.registered.generate({ ...promptRequest(), route: undefined }), /no logged request route/u)
})

test('apply honours the configured cadence', () => {
  const { ctx, calls } = createHost()
  apply(ctx, { automatic: 'all-prompts' })
  assert.equal(calls.registered.automatic, 'all-prompts')
})

test('generate names the newest prompt when titles follow every prompt', async () => {
  const { ctx, calls } = createHost({ chunks: ANSWER_CHUNKS })
  apply(ctx, { automatic: 'all-prompts', waitForReplyMs: 50 })
  const request = promptRequest()
  request.messages = [{ seq: 1, text: '先看一下现状' }, { seq: 4, text: '改成中文标题并限制 20 字' }]
  setTimeout(() => {
    ctx.emit(request.session, { seq: 5, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '已改好。' }] } } })
  }, 5)
  const revision = await calls.registered.generate(request)
  assert.deepEqual(revision.messageSeqs, [4])
  assert.match(calls.streams[0].messages[0].content[0].text, /^User request:\n改成中文标题并限制 20 字/u)
  assert.match(calls.streams[0].messages[0].content[0].text, /已改好。/u)
})
