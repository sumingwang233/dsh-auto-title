/**
 * Host half of `dsh-auto-title` — the sole `ctx.sessionTitle` provider.
 *
 * The base bundle's own provider titles a session from the first human prompt,
 * which is why every row in the list restates a truncated question. This
 * provider waits for the first assistant reply, then names the session from the
 * request *and* the answer ("project｜concrete task") through one auxiliary
 * model call on the session's own route.
 *
 * It must be the only registered provider, so the bundle patch disables the
 * `session-title-llm` row before this plugin activates.
 *
 * The same package also serves the manual "AI rename" action and the settings
 * card: both live in the browser, so they reach the host through same-origin
 * HTTP routes and read the plugin's own diagnostic log.
 *
 * @module dsh-auto-title
 */

import {
  assistantTextOf,
  buildPrompt,
  normalizeTitle,
  resolveConfig,
} from './core.js'
import { collectManualTexts } from './manual.js'
import { createLog } from './log.js'
import {
  clearOverrides,
  EDITABLE_KEYS,
  logPath,
  overridesMtime,
  readOverrides,
  settingsPath,
  writeOverrides,
} from './settings.js'

/** Cordis plugin name; Loader ids stay separate from this. */
export const name = 'dsh-auto-title'
/**
 * Services this plugin calls: the exclusivity-owning title service, the model
 * seam, and the session controller that resolves (and, on demand, resumes) one
 * session for the manual endpoints and commits a user title. `webServer` is
 * injected optionally (see `registerRoutes`) so a host without an HTTP face
 * still gets the automatic path.
 */
export const inject = ['sessionTitle', 'llm', 'sessionController']

/** Provider id recorded on every accepted title. */
const PROVIDER_ID = 'dsh-auto-title'
/** Timeout reason code for the auxiliary request. */
const TIMEOUT_CODE = 'SESSION_AUTO_TITLE_TIMEOUT'

/**
 * Register the title provider and the browser-facing routes.
 * @param ctx - context exposing `sessionTitle`, `llm`, and `sessionController`.
 * @param config - the Loader row's `config:` value; validated here.
 */
export function apply(ctx, config) {
  const logger = ctx.logger
  const log = createLog({ file: logPath() })
  const base = config ?? {}
  const initial = resolveConfig(base)
  if (!initial.enabled) {
    logger.info('disabled by configuration')
    log.push('info', 'apply', 'disabled by configuration')
    return
  }
  const effective = createEffectiveConfig(base)
  const provider = {
    id: PROVIDER_ID,
    automatic: initial.automatic,
    // The reply capture subscribes before the settings file is read, so a fast
    // first answer cannot slip through the gap.
    generate: async (request) => {
      try {
        return await generate(ctx, effective, log, logger, request)
      } catch (error) {
        // The service only warns to the host log; keep the reason where the
        // settings card (and a bug report) can find it.
        log.error('generate', error, `title generation failed for session ${request.session?.id}`)
        throw error
      }
    },
  }
  ctx.effect(() => {
    let dispose
    try {
      dispose = ctx.sessionTitle.register(provider)
    } catch (error) {
      // Another provider owns the slot: stay inert instead of failing the row.
      const message = error instanceof Error ? error.message : String(error)
      logger.warn(`session title provider not registered: ${message}`)
      log.error('provider', error, `provider not registered: ${message}`)
      return () => {}
    }
    logger.info(`title provider registered (${PROVIDER_ID})`)
    log.push('info', 'provider', `title provider registered (${PROVIDER_ID})`)
    return () => {
      if (typeof dispose === 'function') void dispose()
    }
  }, 'dsh-auto-title: provider')
  registerRoutes(ctx, log, logger, effective, base)
}

/**
 * Build the effective-config reader: Loader row config plus the card's
 * overrides, re-read only when `settings.json` changes.
 * @param base - the Loader row's `config:` value.
 * @returns an async getter of the resolved configuration.
 */
function createEffectiveConfig(base) {
  let cachedMtime = -1
  let cached = null
  return async () => {
    const mtime = await overridesMtime()
    if (cached !== null && mtime === cachedMtime) return cached
    const overrides = await readOverrides()
    cached = resolveConfig({ ...base, ...overrides })
    cachedMtime = mtime
    return cached
  }
}

/**
 * Mount the browser-facing routes on the host's own HTTP server.
 *
 * The menu row and the settings card live in the browser and cannot call host
 * services directly, so every action is an ordinary same-origin POST. Handlers
 * close over the plugin context: only route registration belongs to the nested
 * `webServer` scope, service calls belong to the plugin itself.
 * @param ctx - plugin context.
 * @param log - diagnostic ring buffer.
 * @param logger - plugin logger.
 * @param effective - async effective-config getter.
 * @param base - the Loader row's raw config, reported to the card.
 */
function registerRoutes(ctx, log, logger, effective, base) {
  if (typeof ctx.inject !== 'function') return
  ctx.inject(['webServer'], (webCtx) => {
    // A WebRoute is keyed by pathname alone — the method is the handler's
    // business, so one registration per path and a method switch inside.
    const routes = [
      ['/dsh-auto-title/title', (req, res) => byMethod(req, res, { POST: () => handleTitleRequest(ctx, effective, log, logger, req, res) })],
      ['/dsh-auto-title/apply', (req, res) => byMethod(req, res, { POST: () => handleApplyRequest(ctx, log, logger, req, res) })],
      ['/dsh-auto-title/config', (req, res) => byMethod(req, res, {
        GET: () => handleConfigRead(ctx, effective, base, log, req, res),
        POST: () => handleConfigWrite(effective, base, log, req, res),
      })],
      ['/dsh-auto-title/log', (req, res) => byMethod(req, res, {
        GET: () => handleLogRead(log, req, res),
        POST: () => handleLogWrite(log, req, res),
      })],
    ]
    for (const [path, handler] of routes) {
      webCtx.effect(
        () => webCtx.webServer.register({ kind: 'exact', path, handler }),
        `dsh-auto-title: route ${path}`,
      )
    }
    logger.info('browser routes registered')
    log.push('info', 'routes', `mounted ${routes.length} routes`)
  })
}

/**
 * Dispatch one path by request method.
 * @param req - the incoming request.
 * @param res - the response.
 * @param handlers - method name → handler.
 * @returns whatever the chosen handler returns.
 */
function byMethod(req, res, handlers) {
  const method = String(req.method ?? 'GET').toUpperCase()
  const handler = handlers[method]
  if (handler === undefined) {
    sendJson(res, 405, { code: 'method-not-allowed', error: `method ${method} is not allowed here` })
    return undefined
  }
  return handler()
}

/**
 * `POST /dsh-auto-title/title` — propose a title for one existing session.
 * @param ctx - plugin context exposing `sessionController`.
 * @param effective - async effective-config getter.
 * @param log - diagnostic ring buffer.
 * @param logger - plugin logger.
 * @param req - the request carrying `{ sessionId }`.
 * @param res - the response that receives `{ title }` or `{ code, error }`.
 */
async function handleTitleRequest(ctx, effective, log, logger, req, res) {
  let sessionId = ''
  try {
    const body = await readJsonBody(req)
    sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : ''
    if (sessionId === '') throw new HttpError(400, 'bad-request', '缺少会话标识')
    log.push('info', 'route:title', `request for ${sessionId}`)
    const config = await effective()
    const title = await manualTitle(ctx, config, log, logger, sessionId)
    log.push('info', 'route:title', `proposed "${title}" for ${sessionId}`)
    sendJson(res, 200, { title })
  } catch (error) {
    log.error('route:title', error, `title failed${sessionId === '' ? '' : ` for ${sessionId}`}: ${messageOf(error)}`)
    sendFailure(res, error)
  }
}

/**
 * `POST /dsh-auto-title/apply` — commit a title the user confirmed.
 * @param ctx - plugin context exposing `sessionController`.
 * @param log - diagnostic ring buffer.
 * @param logger - plugin logger.
 * @param req - the request carrying `{ sessionId, title }`.
 * @param res - the response that receives `{ title }` or `{ code, error }`.
 */
async function handleApplyRequest(ctx, log, logger, req, res) {
  let sessionId = ''
  try {
    const body = await readJsonBody(req)
    sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : ''
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    if (sessionId === '') throw new HttpError(400, 'bad-request', '缺少会话标识')
    if (title === '') throw new HttpError(400, 'empty-title', '标题不能为空')
    log.push('info', 'route:apply', `applying "${title}" to ${sessionId}`)
    const value = await ctx.sessionController.rename({ sessionId, title })
    logger.info(`manual title applied to ${sessionId}`)
    log.push('info', 'route:apply', `renamed ${sessionId} to "${value?.title ?? title}"`)
    sendJson(res, 200, { title: value?.title ?? title })
  } catch (error) {
    log.error('route:apply', error, `apply failed${sessionId === '' ? '' : ` for ${sessionId}`}: ${messageOf(error)}`)
    sendFailure(res, error)
  }
}

/**
 * `GET /dsh-auto-title/config` — what the settings card renders.
 * @param ctx - plugin context (unused; kept for symmetry).
 * @param effective - async effective-config getter.
 * @param base - the Loader row's raw config.
 * @param log - diagnostic ring buffer.
 * @param req - the request (unused).
 * @param res - the response.
 */
async function handleConfigRead(ctx, effective, base, log, req, res) {
  try {
    const resolved = await effective()
    const overrides = await readOverrides()
    sendJson(res, 200, {
      effective: { ...resolved },
      overrides,
      base: { ...base },
      editable: [...EDITABLE_KEYS],
      settingsPath: settingsPath(),
      logPath: logPath(),
    })
  } catch (error) {
    log.error('route:config', error, `config read failed: ${messageOf(error)}`)
    sendFailure(res, error)
  }
}

/**
 * `POST /dsh-auto-title/config` — persist the card's edits.
 * @param effective - async effective-config getter (cache invalidated by mtime).
 * @param base - the Loader row's raw config.
 * @param log - diagnostic ring buffer.
 * @param req - the request carrying `{ patch }`.
 * @param res - the response carrying the new effective config.
 */
async function handleConfigWrite(effective, base, log, req, res) {
  try {
    const body = await readJsonBody(req)
    let overrides
    if (body?.reset === true) {
      overrides = await clearOverrides()
      log.push('info', 'route:config', 'settings reset to the deployment baseline')
    } else {
      const patch = body?.patch
      if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
        throw new HttpError(400, 'bad-request', '缺少 patch')
      }
      // Validate before writing: an invalid value must never reach the file,
      // because every later read would then fail with the same error.
      const merged = { ...(await readOverrides()), ...patch }
      try {
        resolveConfig({ ...base, ...merged })
      } catch (error) {
        throw new HttpError(400, 'invalid-config', messageOf(error))
      }
      overrides = await writeOverrides(patch)
      log.push('info', 'route:config', `settings saved: ${Object.keys(patch).join(', ') || '(empty)'}`)
    }
    const resolved = await effective()
    sendJson(res, 200, {
      effective: { ...resolved },
      overrides,
      base: { ...base },
      editable: [...EDITABLE_KEYS],
      settingsPath: settingsPath(),
      logPath: logPath(),
    })
  } catch (error) {
    log.error('route:config', error, `config write failed: ${messageOf(error)}`)
    sendFailure(res, error)
  }
}

/**
 * `GET /dsh-auto-title/log?limit=N` — the newest diagnostics first.
 * @param log - diagnostic ring buffer.
 * @param req - the request whose query carries `limit`.
 * @param res - the response.
 */
function handleLogRead(log, req, res) {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const limit = Number.parseInt(url.searchParams.get('limit') ?? '', 10)
    sendJson(res, 200, { entries: log.list(Number.isInteger(limit) ? limit : undefined), size: log.size() })
  } catch (error) {
    sendFailure(res, error)
  }
}

/**
 * `POST /dsh-auto-title/log` — a browser report, so a console-less failure
 * still reaches the card. `{ clear: true }` empties the buffer.
 * @param log - diagnostic ring buffer.
 * @param req - the request carrying `{ level, scope, message, detail, clear? }`.
 * @param res - the response.
 */
async function handleLogWrite(log, req, res) {
  try {
    const body = await readJsonBody(req)
    if (body?.clear === true) {
      log.clear()
      sendJson(res, 200, { cleared: true })
      return
    }
    const level = typeof body?.level === 'string' ? body.level : 'info'
    const scope = typeof body?.scope === 'string' ? body.scope : 'client'
    const message = typeof body?.message === 'string' ? body.message : '(no message)'
    log.push(level, scope, message, body?.detail)
    sendJson(res, 200, { ok: true })
  } catch (error) {
    sendFailure(res, error)
  }
}

/**
 * Resolve one session to a live agent, resuming it when it is not open.
 * @param ctx - plugin context exposing `sessionController`.
 * @param sessionId - the session to resolve.
 * @returns the live agent.
 */
async function resolveSession(ctx, sessionId) {
  const found = await ctx.sessionController.resolveAgent(sessionId)
  if (found !== null && typeof found === 'object' && 'error' in found) {
    throw new HttpError(404, 'session-missing', found.error?.message ?? '会话不存在或无法打开')
  }
  const agent = found?.agent
  if (agent === undefined) throw new HttpError(404, 'session-missing', '会话不存在或无法打开')
  return agent
}

/**
 * Generate one title for an existing session from its own log.
 * @param ctx - plugin context exposing `sessionController`.
 * @param config - resolved configuration.
 * @param log - diagnostic ring buffer.
 * @param logger - plugin logger.
 * @param sessionId - the session to name.
 * @returns the normalized title.
 */
async function manualTitle(ctx, config, log, logger, sessionId) {
  const agent = await resolveSession(ctx, sessionId)
  const { userText, assistantText } = collectManualTexts(agent.session.ownEvents())
  if (userText.trim() === '') throw new HttpError(422, 'empty-session', '这条会话还没有人类提问，无法命名')
  const route = manualRoute(config, agent.session, log)
  log.push('info', 'route:title', `using route ${route.provider}/${route.model} (${route.source})`)
  const prompt = buildPrompt({ userText, assistantText, config })
  // A fresh signal: the manual call is bounded by `timeoutMs` alone.
  const title = await titleFromModel(ctx, config, route, prompt, agent.session, new AbortController().signal, log)
  logger.info(`manual title proposed for ${sessionId}`)
  return title
}

/**
 * Run the auxiliary model and turn its answer into a title, recording what the
 * stream actually produced. An empty answer is the failure users hit most, so
 * it is reported with the finish reason that explains it.
 * @param ctx - plugin context exposing `llm`.
 * @param config - resolved configuration.
 * @param route - the provider/model to call.
 * @param prompt - the composed system/user prompt.
 * @param session - the session being named.
 * @param signal - the caller's abort signal.
 * @param log - diagnostic ring buffer.
 * @returns the normalized title.
 */
async function titleFromModel(ctx, config, route, prompt, session, signal, log) {
  const result = await requestTitle(ctx, config, route, prompt, session, signal)
  const title = normalizeTitle(result.text, config)
  const summary = `stream finish=${result.finish} text=${result.text.length}ch reasoning=${result.reasoningChars}ch title=${title === '' ? '(empty)' : `"${title}"`}`
  log.push(title === '' ? 'warn' : 'info', 'route:title', summary)
  if (title === '') {
    throw new HttpError(502, 'model-empty', result.finish === 'max-tokens'
      // A reasoning model can spend the whole budget before writing anything.
      ? `模型在输出上限（${config.maxOutputTokens} tokens）内没有写出标题，推理占用了 ${result.reasoningChars} 字符——把 maxOutputTokens 调大，或换一个非推理模型`
      : `模型没有返回可用的标题（finish=${result.finish}，输出 ${result.text.length} 字符）`)
  }
  return title
}

/**
 * Route for a manual request: explicit configuration wins, otherwise the
 * session's own logged request route. A session that never called a model has
 * no route to copy, so the plugin has to be configured for that case.
 * @param config - resolved configuration.
 * @param session - the live session being named.
 * @param log - diagnostic ring buffer.
 * @returns the provider/model pair to call, and where it came from.
 */
function manualRoute(config, session, log) {
  if (config.provider !== '') {
    return { provider: config.provider, model: config.model, source: 'configuration' }
  }
  const header = typeof session.requestHeader === 'function' ? session.requestHeader() : undefined
  const route = header?.config
  if (route !== undefined && route.provider !== '' && route.model !== '') {
    return { provider: route.provider, model: route.model, source: 'session log' }
  }
  log.push('warn', 'route:title', 'no route: the session never called a model and the plugin has no provider/model')
  throw new HttpError(409, 'no-route', '这条会话尚未运行过模型，请先在设置里填写供应商与模型')
}

/** One failure with the HTTP status the client should see. */
class HttpError extends Error {
  /**
   * @param status - HTTP status.
   * @param code - machine-readable code the card localizes.
   * @param message - human-readable message.
   */
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** @returns the message of a thrown value. */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Read and parse a small JSON request body.
 * @param req - the incoming request.
 * @returns the parsed body.
 */
async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 64 * 1024) throw new HttpError(413, 'too-large', '请求体过大')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'bad-json', '请求体不是合法 JSON')
  }
}

/**
 * Write one JSON response.
 * @param res - the response to own.
 * @param status - HTTP status.
 * @param payload - the JSON body.
 */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

/**
 * Translate a thrown value into the response the card displays.
 * @param res - the response to own.
 * @param error - whatever was thrown.
 */
function sendFailure(res, error) {
  const known = error instanceof HttpError
  sendJson(res, known ? error.status : 500, {
    code: known ? error.code : 'internal',
    error: messageOf(error),
  })
}

/**
 * Produce one title revision for the service.
 * @param ctx - context exposing `llm`.
 * @param config - resolved configuration.
 * @param log - diagnostic ring buffer.
 * @param logger - plugin logger.
 * @param request - the service-owned session, message snapshot, route, and signal.
 * @returns the normalized title, its source seq, and the route used.
 */
async function generate(ctx, effective, log, logger, request) {
  const { session, messages, signal } = request
  // The newest human message is the revision's trigger: the only one in the
  // first-prompt cadence, the latest one when titles follow every prompt.
  const trigger = messages[messages.length - 1]
  if (trigger === undefined) throw new Error('dsh-auto-title: at least one human message is required')
  signal.throwIfAborted()
  const configPromise = effective()
  // Subscribe now, not after the settings read: the answer may land first.
  const reply = waitForAssistantText(ctx, session, trigger.seq, configPromise, logger, log, signal)
  try {
    const config = await configPromise
    if (!config.enabled) throw new Error('dsh-auto-title: disabled by configuration')
    const route = resolveRoute(config, request)
    log.push('info', 'generate', `session ${session.id} via ${route.provider}/${route.model}`)
    const assistantText = await reply.promise
    signal.throwIfAborted()
    const prompt = buildPrompt({ userText: trigger.text, assistantText, config })
    const title = await titleFromModel(ctx, config, route, prompt, session, signal, log)
    log.push('info', 'generate', `accepted "${title}" for ${session.id}`)
    // The service rejects a partial model identity, so only report a complete one.
    const identified = route.provider !== '' && route.model !== ''
    return {
      title,
      messageSeqs: [trigger.seq],
      ...identified ? { model: { provider: route.provider, model: route.model } } : {},
    }
  } finally {
    reply.dispose()
  }
}

/**
 * Resolve the auxiliary route: explicit configuration wins, otherwise the
 * session's own logged request route.
 * @param config - resolved configuration.
 * @param request - the provider request carrying the optional logged route.
 * @returns the provider/model pair to call.
 */
function resolveRoute(config, request) {
  if (config.provider !== '') return { provider: config.provider, model: config.model }
  if (request.route !== undefined) return { provider: request.route.provider, model: request.route.model }
  throw new Error('dsh-auto-title: no logged request route is available; configure provider and model together')
}

/**
 * Perform the auxiliary completion and return its text.
 * @param ctx - context exposing `llm`.
 * @param config - resolved configuration.
 * @param route - provider/model pair.
 * @param prompt - the framed system and user text.
 * @param session - the session being titled (for `sessionId` attribution).
 * @param signal - the service's cancellation.
 * @returns the assembled assistant text.
 */
async function requestTitle(ctx, config, route, prompt, session, signal) {
  const callSignal = withDeadline(signal, config.timeoutMs)
  const options = {
    provider: route.provider,
    model: route.model,
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt.user }] }],
    system: prompt.system,
    maxTokens: config.maxOutputTokens,
    sessionId: session.id,
    // Lets adapters apply purpose-specific policy to this auxiliary call.
    purpose: 'session-title',
    signal: callSignal.signal,
  }
  const parts = new Map()
  let finish
  let reasoningChars = 0
  try {
    for await (const chunk of ctx.llm.stream(options)) {
      callSignal.signal.throwIfAborted()
      switch (chunk.type) {
        case 'text-delta':
          parts.set(chunk.index, (parts.get(chunk.index) ?? '') + chunk.text)
          break
        case 'reasoning-delta':
          // Reasoning models spend the output budget here before any text.
          reasoningChars += chunk.text.length
          break
        case 'block-end':
          if (chunk.block?.type === 'text') parts.set(chunk.index, chunk.block.text)
          if (chunk.block?.type === 'tool-call') {
            throw new Error('dsh-auto-title: the title model requested a tool')
          }
          break
        case 'finish':
          finish = chunk.reason
          break
        default:
          break
      }
    }
  } finally {
    callSignal.dispose()
  }
  const text = [...parts.keys()]
    .sort((left, right) => left - right)
    .map(index => parts.get(index))
    .join('\n')
  if (finish === undefined) throw new Error('dsh-auto-title: the title stream ended without a finish reason')
  if (finish.kind === 'error' || finish.kind === 'aborted') {
    const failure = finish.failure ?? {}
    const error = new Error(failure.message ?? 'the title model call failed')
    error.code = failure.code ?? TIMEOUT_CODE
    throw error
  }
  return { text, finish: finish.kind, reasoningChars }
}

/**
 * Compose the service cancellation with this plugin's own call deadline.
 * @param signal - the service's signal.
 * @param timeoutMs - positive deadline in milliseconds.
 * @returns the composed signal and its disposer.
 */
function withDeadline(signal, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(Object.assign(new Error(`title request timed out after ${timeoutMs} ms`), { code: TIMEOUT_CODE }))
  }, timeoutMs)
  const onAbort = () => controller.abort(signal.reason)
  signal.addEventListener('abort', onAbort, { once: true })
  if (signal.aborted) controller.abort(signal.reason)
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
    },
  }
}

/**
 * Start capturing the first assistant reply that carries text, bounded by
 * `waitForReplyMs`. A failed or timed-out turn resolves with an empty string so
 * the title still improves on the raw prompt.
 *
 * The listener is attached synchronously, before `config` resolves, so a reply
 * that lands while the settings file is still being read is not missed. The
 * caller must always `dispose()`.
 * @param ctx - context exposing the event bus.
 * @param session - the session being titled.
 * @param throughSeq - the seq of the human message that triggered this revision.
 * @param configPromise - promise of the resolved configuration (for the timeout).
 * @param logger - plugin logger.
 * @param log - diagnostic ring buffer.
 * @param signal - the revision's abort signal.
 * @returns the pending reply text and the disposer.
 */
function waitForAssistantText(ctx, session, throughSeq, configPromise, logger, log, signal) {
  let settle = () => {}
  let stopListening = () => {}
  const promise = new Promise((resolve) => {
    let settled = false
    let timer
    const finish = (text) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(text)
    }
    settle = () => finish('')
    const onEvent = (eventSession, event) => {
      if (eventSession !== session) return
      if (typeof event.seq === 'number' && event.seq <= throughSeq) return
      if (event.type === 'assistant/message') {
        const text = assistantTextOf(event.data?.message)
        if (text !== '') finish(text)
        return
      }
      if (event.type === 'turn/end') {
        const kind = event.data?.reason?.kind
        if (kind !== 'completed' && kind !== 'max-tokens') {
          logger.debug(`turn ended with "${String(kind)}" before any assistant text; titling from the prompt alone`)
          log.push('info', 'generate', `turn ended with "${String(kind)}" before any assistant text`)
          finish('')
        }
      }
    }
    stopListening = ctx.on('session/event', onEvent)
    if (typeof signal?.addEventListener === 'function') {
      signal.addEventListener('abort', () => finish(''), { once: true })
    }
    configPromise.then((config) => {
      if (settled) return
      timer = setTimeout(() => {
        logger.debug(`no assistant reply within ${config.waitForReplyMs} ms; titling from the prompt alone`)
        log.push('info', 'generate', `no assistant reply within ${config.waitForReplyMs} ms`)
        finish('')
      }, config.waitForReplyMs)
    }, () => finish(''))
  })
  return {
    promise,
    dispose: () => {
      stopListening()
      settle()
    },
  }
}
