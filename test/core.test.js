import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assistantTextOf,
  buildPrompt,
  clip,
  DEFAULTS,
  normalizeTitle,
  resolveConfig,
} from '../lib/core.js'

test('resolveConfig fills the documented defaults', () => {
  const config = resolveConfig(undefined)
  assert.deepEqual(config, { ...DEFAULTS })
})

test('resolveConfig trims strings and keeps explicit values', () => {
  const config = resolveConfig({
    provider: ' deepseek ',
    model: ' deepseek-chat ',
    maxTitleLength: 32,
    waitForReplyMs: 5000,
  })
  assert.equal(config.provider, 'deepseek')
  assert.equal(config.model, 'deepseek-chat')
  assert.equal(config.maxTitleLength, 32)
  assert.equal(config.waitForReplyMs, 5000)
})

test('resolveConfig rejects a half-configured route', () => {
  assert.throws(() => resolveConfig({ provider: 'deepseek' }), /configured together/u)
  assert.throws(() => resolveConfig({ model: 'deepseek-chat' }), /configured together/u)
})

test('resolveConfig rejects malformed fields', () => {
  assert.throws(() => resolveConfig({ language: 'fr' }), /language must be one of/u)
  assert.throws(() => resolveConfig({ automatic: 'every-turn' }), /automatic must be one of/u)
  assert.throws(() => resolveConfig({ enabled: 'yes' }), /enabled must be a boolean/u)
  assert.throws(() => resolveConfig({ maxTitleLength: 0 }), /maxTitleLength must be an integer/u)
  assert.throws(() => resolveConfig({ timeoutMs: 1.5 }), /timeoutMs must be an integer/u)
  assert.throws(() => resolveConfig({ stopWords: 'pls' }), /stopWords must be an array/u)
  assert.throws(() => resolveConfig([]), /config must be an object/u)
})

test('resolveConfig defaults the cadence to the first prompt', () => {
  assert.equal(resolveConfig(undefined).automatic, 'first-prompt')
  assert.equal(resolveConfig({ automatic: 'all-prompts' }).automatic, 'all-prompts')
})

test('normalizeTitle keeps the first line and strips model decoration', () => {
  const config = resolveConfig({ maxTitleLength: 40 })
  assert.equal(normalizeTitle('标题：会话自动重命名插件', config), '会话自动重命名插件')
  assert.equal(normalizeTitle('Title: dsh-auto-title 打包', config), 'dsh-auto-title 打包')
  assert.equal(normalizeTitle('**DSH 插件｜会话标题**', config), 'DSH 插件｜会话标题')
  assert.equal(normalizeTitle('"会话命名插件."', config), '会话命名插件')
  assert.equal(normalizeTitle('第一行\n第二行', config), '第一行')
  assert.equal(normalizeTitle('  ', config), '')
  assert.equal(normalizeTitle(undefined, config), '')
})

test('normalizeTitle bounds the length', () => {
  const config = resolveConfig({ maxTitleLength: 6 })
  assert.equal(normalizeTitle('一二三四五六七八九十', config), '一二三四五六')
})

test('assistantTextOf joins text blocks and ignores other blocks', () => {
  const message = {
    content: [
      { type: 'reasoning', text: 'ignored' },
      { type: 'text', text: 'first' },
      { type: 'tool-call', id: 't', name: 'x', arguments: '{}' },
      { type: 'text', text: 'second' },
    ],
  }
  assert.equal(assistantTextOf(message), 'first\nsecond')
  assert.equal(assistantTextOf(undefined), '')
  assert.equal(assistantTextOf({ content: 'nope' }), '')
})

test('clip marks a truncation and leaves short text alone', () => {
  assert.equal(clip(' short ', 10), 'short')
  assert.equal(clip('abcdefghij', 4), 'abcd…')
})

test('buildPrompt frames the request with the reply excerpt', () => {
  const config = resolveConfig({ maxTitleLength: 20 })
  const prompt = buildPrompt({ userText: '我想开发一个自动重命名插件', assistantText: '好的，先做调研。', config })
  assert.match(prompt.system, /At most 20 characters/u)
  assert.match(prompt.system, /the language the user writes in/u)
  assert.match(prompt.user, /User request:\n我想开发一个自动重命名插件/u)
  assert.match(prompt.user, /Assistant reply \(excerpt\):\n好的，先做调研。/u)
})

test('buildPrompt omits an empty reply and honours the input budget', () => {
  const config = resolveConfig({ language: 'zh', maxInputChars: 10, stopWords: ['帮忙', ' '] })
  const prompt = buildPrompt({ userText: 'a'.repeat(40), assistantText: '', config })
  assert.match(prompt.system, /Chinese/u)
  assert.match(prompt.system, /Words to avoid in the title: 帮忙/u)
  assert.equal(prompt.user.includes('Assistant reply'), false)
  assert.equal(prompt.user, `User request:\n${'a'.repeat(5)}…`)
})
