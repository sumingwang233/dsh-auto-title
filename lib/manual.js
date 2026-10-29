/**
 * Reading side of the manual "AI rename" path.
 *
 * The automatic path receives the human messages pre-collected by the
 * `sessionTitle` service; the manual path is raised from the session row's
 * "…" menu, so it reads the same log itself. Only two texts matter: the first
 * human prompt (what the session is about) and the newest assistant reply
 * (what it concluded). Tool traffic, injected context, attachments and
 * reasoning never reach the prompt.
 *
 * @module dsh-auto-title/manual
 */

import { assistantTextOf } from './core.js'

/**
 * Concatenate the text blocks of a content array.
 * @param content - message content blocks, or anything unexpected.
 * @returns the joined text, or an empty string.
 */
function textBlocksOf(content) {
  if (!Array.isArray(content)) return ''
  return content
    .filter(block => block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n')
}

/**
 * Text of one logged human message; empty for anything that is not human input.
 * @param event - one session event.
 * @returns the human text, or an empty string.
 */
export function humanTextOf(event) {
  if (event === null || typeof event !== 'object') return ''
  if (event.type !== 'user/message') return ''
  const source = event.data?.source
  // Queued/steering input, injected context and system notices are not prompts.
  if (source === null || typeof source !== 'object' || source.kind !== 'user') return ''
  return textBlocksOf(event.data?.content)
}

/**
 * Pick the two texts a manual title is framed from.
 * @param events - the session's event log in order.
 * @returns the first human prompt and the newest non-empty assistant reply.
 */
export function collectManualTexts(events) {
  let userText = ''
  let userSeq = 0
  let assistantText = ''
  if (!Array.isArray(events)) return { userText, userSeq, assistantText }
  for (const event of events) {
    if (userText === '') {
      const text = humanTextOf(event)
      if (text.trim() !== '') {
        userText = text
        userSeq = typeof event.seq === 'number' ? event.seq : 0
      }
    }
    if (event?.type === 'assistant/message') {
      const text = assistantTextOf(event.data?.message)
      // Keep the newest reply that actually carries text; a trailing
      // tool-call-only message must not erase the previous one.
      if (text.trim() !== '') assistantText = text
    }
  }
  return { userText, userSeq, assistantText }
}
