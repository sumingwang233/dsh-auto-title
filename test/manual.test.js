import assert from 'node:assert/strict'
import test from 'node:test'

import './tmp-settings.js'
import { apply } from '../lib/index.js'
import { collectManualTexts, humanTextOf } from '../lib/manual.js'

/** One logged human message event. */
function human(seq, text, kind = 'user') {
  return { seq, type: 'user/message', data: { source: { kind }, content: [{ type: 'text', text }] } }
}

/** One logged assistant message event. */
function assistant(seq, blocks) {
  return { seq, type: 'assistant/message', data: { message: { content: blocks } } }
}

const TITLE_CHUNKS = [
  { type: 'text-delta', index: 0, text: '标题：DSH 插件｜菜单里加 AI 重命名' },
  { type: 'block-end', index: 0, block: { type: 'text', text: 'DSH 插件｜菜单里加 AI 重命名' } },
  { type: 'finish', reason: { kind: 'stop' } },
]

/**
 * A host with the agent registry, the title service, and an HTTP face, recording
 * every registered route so a test can call the handler directly.
 */
function createHost({
  events = [human(1, '给会话加个 AI 重命名入口')],
  chunks = TITLE_CHUNKS,
  sessionRoute = undefined,
  resolveError = undefined,
  renameResult = undefined,
} = {}) {
  const routes = new Map()
  const calls = { streams: [], renamed: [], resolved: [] }
  const logger = { info() {}, debug() {}, error() {}, warn() {} }
  const session = {
    id: 's1',
    ownEvents: () => events,
    requestHeader: () => (sessionRoute === undefined ? undefined : { config: sessionRoute }),
  }
  const webCtx = {
    effect(callback) {
      callback()
    },
    webServer: {
      register(route) {
        routes.set(route.path, route.handler)
        return () => { routes.delete(route.path) }
      },
    },
  }
  const ctx = {
    logger,
    effect(callback) {
      callback()
    },
    on() {
      return () => {}
    },
    sessionTitle: {
      register(provider) {
        calls.provider = provider
        return () => {}
      },
    },
    sessionController: {
      // Mirrors `SessionController.resolveAgent(sessionId) → { agent } | { error }`.
      async resolveAgent(sessionId) {
        calls.resolved.push(sessionId)
        if (resolveError !== undefined) return { error: resolveError }
        return { agent: { session } }
      },
      // Mirrors `SessionController.rename({ sessionId, title }) → { title, seq }`.
      async rename(request) {
        calls.renamed.push({ sessionId: request.sessionId, title: request.title })
        return renameResult ?? { title: request.title, seq: 7 }
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
    inject(deps, callback) {
      assert.deepEqual(deps, ['webServer'])
      callback(webCtx)
    },
  }
  return { ctx, calls, routes }
}

/** A request body as the handler's `for await` loop sees it. */
function requestOf(body) {
  return {
    method: 'POST',
    async* [Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify(body), 'utf8')
    },
  }
}

/** A response capturing what the handler wrote. */
function responseOf() {
  const captured = { status: 0, headers: undefined, body: undefined }
  return {
    captured,
    writeHead(status, headers) {
      captured.status = status
      captured.headers = headers
    },
    end(body) {
      captured.body = body
    },
  }
}

/** Call one registered route and decode its JSON answer. */
async function call(routes, path, body) {
  const response = responseOf()
  await routes.get(path)(requestOf(body), response)
  return { status: response.captured.status, payload: JSON.parse(response.captured.body) }
}

test('humanTextOf keeps human prompts only', () => {
  assert.equal(humanTextOf(human(1, '你好')), '你好')
  assert.equal(humanTextOf(human(1, '注入的上下文', 'inject')), '')
  assert.equal(humanTextOf({ seq: 1, type: 'assistant/message', data: {} }), '')
  assert.equal(humanTextOf({ seq: 1, type: 'user/message', data: { source: { kind: 'user' }, content: [] } }), '')
})

test('collectManualTexts takes the first prompt and the newest reply', () => {
  const texts = collectManualTexts([
    human(1, '第一个问题'),
    assistant(2, [{ type: 'text', text: '第一轮回答' }]),
    human(3, '追加一句'),
    assistant(4, [{ type: 'tool-call', id: 't', name: 'read', arguments: '{}' }]),
    assistant(5, [{ type: 'text', text: '最后一轮回答' }]),
  ])
  assert.equal(texts.userText, '第一个问题')
  assert.equal(texts.userSeq, 1)
  // The tool-only message between them must not erase the text reply.
  assert.equal(texts.assistantText, '最后一轮回答')
})

test('collectManualTexts tolerates a missing log', () => {
  assert.deepEqual(collectManualTexts(undefined), { userText: '', userSeq: 0, assistantText: '' })
})

test('the title route proposes a title from the session log', async () => {
  const { ctx, calls, routes } = createHost({ sessionRoute: { provider: 'logged', model: 'logged-model' } })
  apply(ctx, {})
  assert.ok(routes.has('/dsh-auto-title/title'))
  const { status, payload } = await call(routes, '/dsh-auto-title/title', { sessionId: 's1' })
  assert.equal(status, 200)
  assert.equal(payload.title, 'DSH 插件｜菜单里加 AI 重命名')
  assert.deepEqual(calls.resolved, ['s1'])
  // The manual path is bounded by the plugin timeout, not the reply wait.
  assert.equal(calls.streams[0].maxTokens, 512)
  assert.match(calls.streams[0].messages[0].content[0].text, /User request:\n给会话加个 AI 重命名入口/u)
})

test('the title route explains an empty session', async () => {
  const { ctx, routes } = createHost({ events: [] })
  apply(ctx, {})
  const { status, payload } = await call(routes, '/dsh-auto-title/title', { sessionId: 's1' })
  assert.equal(status, 422)
  assert.equal(payload.code, 'empty-session')
})

test('the title route names the output budget when reasoning ate it', async () => {
  // What a reasoning model does with a small maxOutputTokens: it stops on the
  // cap having written reasoning only, so no title text exists.
  const { ctx, routes } = createHost({
    sessionRoute: { provider: 'logged', model: 'logged-model' },
    chunks: [
      { type: 'reasoning-delta', index: 0, text: '先想一下这个会话在做什么……' },
      { type: 'finish', reason: { kind: 'max-tokens' } },
    ],
  })
  apply(ctx, { maxOutputTokens: 96 })
  const { status, payload } = await call(routes, '/dsh-auto-title/title', { sessionId: 's1' })
  assert.equal(status, 502)
  assert.equal(payload.code, 'model-empty')
  assert.match(payload.error, /96 tokens/u)
  assert.match(payload.error, /maxOutputTokens/u)
})

test('the title route demands a route when the session never ran a model', async () => {
  const { ctx, routes } = createHost({ sessionRoute: undefined })
  apply(ctx, {})
  const { status, payload } = await call(routes, '/dsh-auto-title/title', { sessionId: 's1' })
  assert.equal(status, 409)
  assert.equal(payload.code, 'no-route')
})

test('the title route prefers the configured route', async () => {
  const { ctx, calls, routes } = createHost({ sessionRoute: { provider: 'logged', model: 'logged-model' } })
  apply(ctx, { provider: 'deepseek', model: 'deepseek-chat' })
  await call(routes, '/dsh-auto-title/title', { sessionId: 's1' })
  assert.deepEqual([calls.streams[0].provider, calls.streams[0].model], ['deepseek', 'deepseek-chat'])
})

test('the apply route commits the confirmed title through the session controller', async () => {
  const { ctx, calls, routes } = createHost()
  apply(ctx, {})
  const { status, payload } = await call(routes, '/dsh-auto-title/apply', { sessionId: 's1', title: 'DSH 插件｜AI 重命名' })
  assert.equal(status, 200)
  assert.equal(payload.title, 'DSH 插件｜AI 重命名')
  assert.deepEqual(calls.renamed, [{ sessionId: 's1', title: 'DSH 插件｜AI 重命名' }])
})

test('the apply route refuses an empty title and a missing session id', async () => {
  const { ctx, calls, routes } = createHost()
  apply(ctx, {})
  assert.equal((await call(routes, '/dsh-auto-title/apply', { sessionId: 's1', title: '  ' })).payload.code, 'empty-title')
  assert.equal((await call(routes, '/dsh-auto-title/apply', { title: 'x' })).payload.code, 'bad-request')
  assert.equal(calls.renamed.length, 0)
})

test('the manual routes stay unmounted without an HTTP face', () => {
  const { ctx } = createHost()
  delete ctx.inject
  assert.doesNotThrow(() => apply(ctx, {}))
})
