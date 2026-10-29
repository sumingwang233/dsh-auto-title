/**
 * Pure helpers of `dsh-auto-title`: configuration validation, prompt
 * framing, and title normalization. No Cordis, filesystem, or network imports,
 * so every rule here is unit-testable in plain Node.
 *
 * @module dsh-auto-title/core
 */

/**
 * Accepted configuration, with the default applied for every omitted field.
 * `waitForReplyMs` is a *budget*, not a guarantee: a reply that arrives earlier
 * ends the wait.
 */
export const DEFAULTS = {
  enabled: true,
  automatic: 'first-prompt',
  provider: '',
  model: '',
  language: 'auto',
  maxTitleLength: 24,
  maxInputChars: 6000,
  // Reasoning models spend budget before any text, so leave real headroom.
  maxOutputTokens: 512,
  waitForReplyMs: 120_000,
  timeoutMs: 30_000,
  stopWords: [],
}

/** Locale names the prompt may request explicitly. */
const LANGUAGES = ['auto', 'zh', 'en']

/** Cadences the session-title service accepts from a provider. */
const AUTOMATIC = ['first-prompt', 'all-prompts']

/**
 * Validate one boolean field.
 * @param key - configuration key, used in the message.
 * @param value - raw value.
 * @param fallback - value used when `value` is undefined.
 * @returns the boolean.
 */
function booleanField(key, value, fallback) {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') throw new TypeError(`${key} must be a boolean, received ${typeof value}`)
  return value
}

/**
 * Validate one positive integer field.
 * @param key - configuration key, used in the message.
 * @param value - raw value.
 * @param fallback - value used when `value` is undefined.
 * @param max - inclusive upper bound.
 * @returns the integer.
 */
function positiveIntegerField(key, value, fallback, max) {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max) {
    throw new TypeError(`${key} must be an integer between 1 and ${max}, received ${String(value)}`)
  }
  return value
}

/**
 * Validate one string field.
 * @param key - configuration key, used in the message.
 * @param value - raw value.
 * @param fallback - value used when `value` is undefined.
 * @returns the trimmed string.
 */
function stringField(key, value, fallback) {
  if (value === undefined) return fallback
  if (typeof value !== 'string') throw new TypeError(`${key} must be a string, received ${typeof value}`)
  return value.trim()
}

/**
 * Validate a Loader row's `config:` value into the shape `apply` uses.
 * @param raw - the row's config; `undefined`/`null` mean "defaults".
 * @returns the resolved configuration.
 */
export function resolveConfig(raw) {
  const value = raw ?? {}
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('dsh-auto-title config must be an object')
  }
  const provider = stringField('provider', value.provider, DEFAULTS.provider)
  const model = stringField('model', value.model, DEFAULTS.model)
  if ((provider === '') !== (model === '')) {
    throw new TypeError('provider and model must be configured together')
  }
  const language = stringField('language', value.language, DEFAULTS.language)
  if (!LANGUAGES.includes(language)) {
    throw new TypeError(`language must be one of ${LANGUAGES.join(', ')}, received "${language}"`)
  }
  const automatic = stringField('automatic', value.automatic, DEFAULTS.automatic)
  if (!AUTOMATIC.includes(automatic)) {
    throw new TypeError(`automatic must be one of ${AUTOMATIC.join(', ')}, received "${automatic}"`)
  }
  const stopWords = value.stopWords ?? DEFAULTS.stopWords
  if (!Array.isArray(stopWords) || stopWords.some(word => typeof word !== 'string')) {
    throw new TypeError('stopWords must be an array of strings')
  }
  return {
    enabled: booleanField('enabled', value.enabled, DEFAULTS.enabled),
    automatic,
    provider,
    model,
    language,
    maxTitleLength: positiveIntegerField('maxTitleLength', value.maxTitleLength, DEFAULTS.maxTitleLength, 80),
    maxInputChars: positiveIntegerField('maxInputChars', value.maxInputChars, DEFAULTS.maxInputChars, 20_000),
    maxOutputTokens: positiveIntegerField('maxOutputTokens', value.maxOutputTokens, DEFAULTS.maxOutputTokens, 8192),
    waitForReplyMs: positiveIntegerField('waitForReplyMs', value.waitForReplyMs, DEFAULTS.waitForReplyMs, 600_000),
    timeoutMs: positiveIntegerField('timeoutMs', value.timeoutMs, DEFAULTS.timeoutMs, 600_000),
    stopWords: stopWords.map(word => word.trim()).filter(word => word !== ''),
  }
}

/**
 * Flatten one assistant message's text blocks into a single string.
 * @param message - an `AssistantMessage` event payload; anything else yields ''.
 * @returns the concatenated visible text.
 */
export function assistantTextOf(message) {
  const content = message?.content
  if (!Array.isArray(content)) return ''
  const text = content
    .filter(block => block?.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n')
  return text.trim()
}

/**
 * Cut a piece of conversation input to the configured budget, keeping the head
 * (where the request lives) and marking the cut so the model does not continue
 * a truncated sentence.
 * @param text - raw text.
 * @param limit - maximum characters.
 * @returns the bounded text.
 */
export function clip(text, limit) {
  const value = text.trim()
  if (value.length <= limit) return value
  return `${value.slice(0, limit)}…`
}

/**
 * Frame the naming request: one system message stating the naming rules plus one
 * user message carrying both halves of the conversation.
 * @param input - the human request and the assistant reply (either may be '').
 * @param config - resolved configuration.
 * @returns the system and user text to send.
 */
export function buildPrompt({ userText, assistantText, config }) {
  const budget = config.maxInputChars
  const half = Math.max(1, Math.floor(budget / 2))
  const request = clip(userText, half)
  const reply = clip(assistantText, half)
  const language = config.language === 'auto' ? 'the language the user writes in' : CONFIG_LANGUAGE_NAMES[config.language]
  const stop = config.stopWords.length === 0 ? '' : `\nWords to avoid in the title: ${config.stopWords.join(', ')}.`
  const system = [
    'You name chat sessions in a task list.',
    'Read the user request and the assistant reply, then answer with a short name for this session.',
    'Rules:',
    `- Write the name in ${language}.`,
    '- Shape it as "project｜concrete task" when a project or product is identifiable; otherwise name the task alone.',
    `- At most ${config.maxTitleLength} characters, one line, no period at the end.`,
    '- Name what this session is working on, never the conversation itself: avoid "help", "question", "chat", "会话", "问题", "询问".',
    '- Prefer the concrete nouns of the request (files, modules, features, errors) over generic verbs.',
    '- Answer with the name only: no quotes, no labels, no explanation.',`${stop}`,
  ].join('\n')
  const user = reply === ''
    ? `User request:\n${request}`
    : `User request:\n${request}\n\nAssistant reply (excerpt):\n${reply}`
  return { system, user }
}

/** Language names used inside the prompt. */
const CONFIG_LANGUAGE_NAMES = {
  zh: 'Chinese',
  en: 'English',
}

/** Leading labels a model may copy from the instruction. */
const LABEL = /^(?:标题|会话名称|名称|title|session title|name)\s*[:：]\s*/iu

/**
 * Turn a raw model answer into a title that is safe to store and show.
 * Keeps the first non-empty line, drops quoting and markdown, removes a
 * trailing period, collapses whitespace, and bounds the length.
 * @param text - the model's answer.
 * @param config - resolved configuration.
 * @returns the title, or '' when nothing usable remained.
 */
export function normalizeTitle(text, config) {
  const lines = String(text ?? '')
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(line => line !== '')
  if (lines.length === 0) return ''
  let title = lines[0]
    .replace(LABEL, '')
    .replace(/^[*_`#>~"'\s]+/u, '')
    .replace(/[*_`~"'\s]+$/u, '')
    .replace(/\s+/gu, ' ')
    .replace(/[.。,，;；]+$/u, '')
    .trim()
  if (title.length > config.maxTitleLength) title = title.slice(0, config.maxTitleLength).trim()
  return title
}
