// GENERATED-FREE hand-written client half of `dsh-auto-title`.
//
// Registers three surfaces, all reached through same-origin HTTP because the
// browser cannot call host services directly:
//   * `sidebar.workspaces.session.menu.item` — the "AI rename" row;
//   * `shell.overlay`                        — its confirm dialog;
//   * `settings.section`                     — the settings page (model,
//                                              provider, and the error log);
//                                              the Settings *navigation* entry,
//                                              not a card inside a plugins page.
// The menu row unmounts with its menu, so the dialog lives in the frame-wide
// overlay layer and the two share a module-level store.
//
// The bundle is a classic script loaded by the client module loader; it must not
// use ESM syntax because the loader evaluates the factory itself.
;(function () {
  if (typeof window === 'undefined' || window.__ModuleLoader__ === undefined) return

  window.__ModuleLoader__.load({
    id: 'dsh-auto-title',
    factory: (require) => {
      const module = { exports: {} }
      const React = require('react')
      const NS = 'dsh-auto-title'

      // UI primitives are a peer package; degrade to plain elements when the
      // host build does not expose them rather than failing the whole plugin.
      let primitives = null
      try {
        primitives = require('@deepseek-ai/dsh-client-ui-primitives')
      } catch (_) {
        primitives = null
      }

      const en = {
        'aiRename': 'AI rename',
        'aiRename.dialogTitle': 'AI rename session',
        'aiRename.dialogDescription': 'The title is proposed from the first prompt and the latest reply. Edit it before applying.',
        'aiRename.loading': 'Reading the conversation and proposing a title…',
        'aiRename.fieldLabel': 'Session title',
        'aiRename.apply': 'Apply',
        'aiRename.applying': 'Applying…',
        'aiRename.cancel': 'Cancel',
        'aiRename.close': 'Close',
        'aiRename.error.empty-session': 'This session has no human prompt yet, so there is nothing to name.',
        'aiRename.error.no-route': 'This session has never called a model. Set provider and model in the plugin settings first.',
        'aiRename.error.model-empty': 'The model returned no usable title (a reasoning model may have spent the whole output budget).',
        'aiRename.error.generic': 'Renaming failed.',
        'settings.title': 'Automatic titles',
        'settings.summary': 'Names new sessions from the prompt and the first reply.',
        'settings.status': 'Status',
        'settings.enabled': 'Enable automatic titles',
        'settings.provider': 'Provider',
        'settings.providerHint': 'Empty = copy the route from the session log',
        'settings.model': 'Model',
        'settings.language': 'Title language',
        'settings.maxTitleLength': 'Maximum title characters',
        'settings.waitForReplyMs': 'Wait for the first reply (ms)',
        'settings.timeoutMs': 'Model call timeout (ms)',
        'settings.save': 'Save',
        'settings.saving': 'Saving…',
        'settings.reset': 'Reset to defaults',
        'settings.saved': 'Saved. The next title uses the new settings.',
        'settings.reload': 'Reload',
        'settings.log': 'Recent events',
        'settings.logEmpty': 'No events yet. Run an AI rename and refresh.',
        'settings.logClear': 'Clear',
        'settings.copyLog': 'Copy log',
        'settings.copied': 'Log copied.',
        'settings.settingsPath': 'Stored in',
        'settings.loadFailed': 'Could not load the settings.',
        'settings.saveFailed': 'Could not save the settings.',
      }
      const zh = {
        'aiRename': 'AI 重命名',
        'aiRename.dialogTitle': 'AI 重命名会话',
        'aiRename.dialogDescription': '标题根据首条提问与最近一次回复生成，应用前可以修改。',
        'aiRename.loading': '正在读取对话并生成标题…',
        'aiRename.fieldLabel': '会话标题',
        'aiRename.apply': '应用',
        'aiRename.applying': '应用中…',
        'aiRename.cancel': '取消',
        'aiRename.close': '关闭',
        'aiRename.error.empty-session': '这条会话还没有人类提问，没有可命名的内容。',
        'aiRename.error.no-route': '这条会话还没有运行过模型，请先在插件设置里填写供应商与模型。',
        'aiRename.error.model-empty': '模型没有返回可用的标题（推理可能占满了输出上限）。',
        'aiRename.error.generic': '重命名失败。',
        'settings.title': '自动命名',
        'settings.summary': '根据提问与首轮回复为新会话命名。',
        'settings.status': '状态',
        'settings.enabled': '启用自动命名',
        'settings.provider': '供应商',
        'settings.providerHint': '留空 = 沿用会话日志里的模型路由',
        'settings.model': '模型',
        'settings.language': '标题语言',
        'settings.maxTitleLength': '标题最大字数',
        'settings.waitForReplyMs': '等待首轮回复（毫秒）',
        'settings.timeoutMs': '模型调用超时（毫秒）',
        'settings.save': '保存',
        'settings.saving': '保存中…',
        'settings.reset': '恢复默认',
        'settings.saved': '已保存，下一次命名即生效。',
        'settings.reload': '刷新',
        'settings.log': '最近事件',
        'settings.logEmpty': '还没有事件。执行一次 AI 重命名后刷新。',
        'settings.logClear': '清空',
        'settings.copyLog': '复制日志',
        'settings.copied': '日志已复制。',
        'settings.settingsPath': '保存位置',
        'settings.loadFailed': '无法读取设置。',
        'settings.saveFailed': '无法保存设置。',
      }

      /**
       * Translate one key, falling back to the built-in Chinese copy.
       * @param t - the slot-supplied translator, when the host provides one.
       * @param key - the locale key.
       * @returns the display string.
       */
      const tr = (t, key) => {
        if (typeof t === 'function') {
          try {
            const value = t(key)
            if (typeof value === 'string' && value !== '' && value !== key) return value
          } catch (_) { /* fall through to the built-in copy */ }
        }
        return zh[key] ?? key
      }

      // ------------------------------------------------------------- diagnostics
      /**
       * Report one event to the host log so a console-less failure is still
       * visible in the settings card. Never throws, never blocks.
       * @param level - info | warn | error
       * @param scope - the emitting step
       * @param message - the line
       * @param detail - optional context
       */
      const report = (level, scope, message, detail) => {
        try {
          const line = `[dsh-auto-title] ${scope}: ${message}`
          if (level === 'error') console.error(line, detail)
          else if (level === 'warn') console.warn(line, detail)
          else console.info(line, detail)
        } catch (_) { /* console may be absent */ }
        try {
          void fetch('/dsh-auto-title/log', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ level, scope, message, detail: renderDetail(detail) }),
          }).catch(() => {})
        } catch (_) { /* fetch may be absent */ }
      }

      /**
       * Render a detail as a short string for the log line.
       * @param detail - anything.
       * @returns the string, or undefined.
       */
      const renderDetail = (detail) => {
        if (detail === undefined || detail === null) return undefined
        if (typeof detail === 'string') return detail
        if (detail instanceof Error) return `${detail.name}: ${detail.message}\n${detail.stack ?? ''}`
        try {
          return JSON.stringify(detail)
        } catch (_) {
          return String(detail)
        }
      }

      // ------------------------------------------------------------------ store
      // `null` = idle. One request at a time is enough for a row action.
      let pending = null
      const listeners = new Set()
      const emit = () => {
        for (const listener of [...listeners]) listener()
      }
      const setPending = (next) => {
        pending = next
        emit()
      }
      const subscribe = (listener) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      }
      // `useState` + an effect rather than `useSyncExternalStore`: the shell's
      // React build is not pinned by this bundle, and the older hook is the
      // one every React ≥16.8 has. A crash here would be silent — the overlay
      // renders inside the error boundary — so the cheap version wins.
      const usePending = () => {
        const [value, setValue] = React.useState(pending)
        React.useEffect(() => {
          setValue(pending)
          return subscribe(() => setValue(pending))
        }, [])
        return value
      }

      /** One JSON request against this plugin's host routes. */
      const postJson = async (path, body) => {
        const response = await fetch(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
        return settle(response)
      }

      /** One JSON GET against this plugin's host routes. */
      const getJson = async (path) => settle(await fetch(path, { headers: { accept: 'application/json' } }))

      /**
       * Decode one response, turning a non-2xx into an Error carrying `code`.
       * @param response - the fetch response.
       * @returns the parsed payload.
       */
      const settle = async (response) => {
        let payload = null
        try {
          payload = await response.json()
        } catch (_) {
          payload = null
        }
        if (!response.ok) {
          const error = new Error((payload && payload.error) || `HTTP ${response.status}`)
          error.code = payload && payload.code
          error.status = response.status
          throw error
        }
        return payload ?? {}
      }

      /** Map one failure onto localized copy, keeping unknown messages as-is. */
      const describeError = (t, error) => {
        const code = error && error.code
        const message = error instanceof Error ? error.message : String(error)
        // The host explains a model failure precisely (finish reason, budget
        // consumed by reasoning); that beats any generic local copy.
        if (code === 'model-empty' && message !== '') return message
        if (typeof code === 'string' && code !== '') {
          const key = `aiRename.error.${code}`
          const mapped = tr(t, key)
          if (mapped !== key) return mapped
        }
        return `${tr(t, 'aiRename.error.generic')} ${message}`
      }

      const requestTitle = (sessionId) => {
        setPending({ sessionId, status: 'loading', draft: '', error: null })
        report('info', 'menu', `requesting a title for ${sessionId}`)
        postJson('/dsh-auto-title/title', { sessionId }).then(
          (payload) => {
            report('info', 'menu', `proposal for ${sessionId}: ${String(payload.title ?? '')}`)
            setPending(current => (current === null ? null : {
              ...current, status: 'ready', draft: String(payload.title ?? ''), error: null,
            }))
          },
          (error) => {
            report('error', 'menu', `proposal failed for ${sessionId}: ${error instanceof Error ? error.message : String(error)}`, error)
            setPending(current => (current === null ? null : {
              ...current, status: 'error', error,
            }))
          },
        )
      }

      // ------------------------------------------------------------- error guard
      /** Catches render failures so one broken surface cannot blank the frame. */
      class Guard extends React.Component {
        /** @param props - the wrapped children. */
        constructor(props) {
          super(props)
          this.state = { failed: false }
        }

        /**
         * @param error - what was thrown.
         * @param info - React's component stack.
         */
        componentDidCatch(error, info) {
          report('error', 'render', `surface crashed: ${error instanceof Error ? error.message : String(error)}`, `${info?.componentStack ?? ''}`)
          this.setState({ failed: true })
        }

        /** @returns the children, or nothing after a failure. */
        render() {
          if (this.state.failed) return null
          return this.props.children
        }
      }

      // ------------------------------------------------------------------- row
      const SparkIcon = () => React.createElement(
        'svg',
        { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        React.createElement('path', {
          d: 'M8 1.5 9.6 6 14 7.5 9.6 9 8 13.5 6.4 9 2 7.5 6.4 6 8 1.5Z',
          stroke: 'currentColor',
          strokeWidth: 1.2,
          strokeLinejoin: 'round',
        }),
      )

      /**
       * The menu row: ask for a proposal, then let the overlay ask for confirmation.
       * @param props - the row's session, its menu state, and the locale seat.
       * @returns the menu row.
       */
      const AutoRenameMenuItem = ({ sessionId, useMenuOpenState, t }) => {
        const [, setMenuOpen] = useMenuOpenState()
        const label = tr(t, 'aiRename')
        const onSelect = () => {
          try {
            setMenuOpen(false)
          } catch (error) {
            report('warn', 'menu', 'closing the menu failed', error)
          }
          requestTitle(sessionId)
        }
        if (primitives && primitives.MenuItemButton) {
          return React.createElement(
            primitives.MenuItemButton,
            { icon: React.createElement(SparkIcon), onSelect },
            label,
          )
        }
        return React.createElement(
          'button',
          { type: 'button', role: 'menuitem', onClick: onSelect, className: 'dsh-auto-title-row' },
          label,
        )
      }

      // ---------------------------------------------------------------- dialog
      /**
       * The frame-wide dialog for the pending request.
       * @param props - the locale seat.
       * @returns the dialog, or null while idle.
       */
      const AutoRenameDialog = ({ t }) => {
        const current = usePending()
        if (current === null) return null
        const busy = current.status === 'applying'
        const failed = current.status === 'error'
        const loading = current.status === 'loading'
        const close = () => {
          if (busy) return
          setPending(null)
        }
        const apply = () => {
          const draft = current.draft.trim()
          if (draft === '' || busy) return
          setPending({ ...current, status: 'applying', error: null })
          postJson('/dsh-auto-title/apply', { sessionId: current.sessionId, title: draft }).then(
            (payload) => {
              report('info', 'menu', `applied "${String(payload.title ?? draft)}" to ${current.sessionId}`)
              setPending(null)
            },
            (error) => {
              report('error', 'menu', `apply failed for ${current.sessionId}: ${error instanceof Error ? error.message : String(error)}`, error)
              setPending({ ...current, status: 'error', error })
            },
          )
        }
        const body = loading
          ? React.createElement('div', { className: 'dsh-auto-title-loading' }, tr(t, 'aiRename.loading'))
          : React.createElement(
            React.Fragment,
            null,
            primitives && primitives.Input
              ? React.createElement(primitives.Input, {
                value: current.draft,
                'aria-label': tr(t, 'aiRename.fieldLabel'),
                'data-modal-autofocus': true,
                disabled: busy,
                onChange: (event) => { setPending({ ...current, draft: event.target.value, error: null }) },
                onKeyDown: (event) => {
                  if (event.key === 'Enter' && !event.nativeEvent?.isComposing) {
                    event.preventDefault()
                    apply()
                  }
                },
              })
              : React.createElement('input', {
                value: current.draft,
                'aria-label': tr(t, 'aiRename.fieldLabel'),
                disabled: busy,
                style: { width: '100%' },
                onChange: (event) => { setPending({ ...current, draft: event.target.value, error: null }) },
              }),
            failed
              ? React.createElement('div', { role: 'alert', className: 'dsh-auto-title-error' }, describeError(t, current.error))
              : null,
          )
        const footer = loading
          ? null
          : React.createElement(
            React.Fragment,
            null,
            React.createElement(
              primitives && primitives.Button ? primitives.Button : 'button',
              { variant: 'outline', disabled: busy, onClick: close, type: 'button' },
              tr(t, 'aiRename.cancel'),
            ),
            React.createElement(
              primitives && primitives.Button ? primitives.Button : 'button',
              {
                variant: 'primary',
                type: 'button',
                disabled: busy || current.draft.trim() === '',
                onClick: apply,
              },
              busy ? tr(t, 'aiRename.applying') : tr(t, 'aiRename.apply'),
            ),
          )
        const modalProps = {
          open: true,
          onClose: close,
          closeLabel: tr(t, 'aiRename.close'),
          title: tr(t, 'aiRename.dialogTitle'),
          description: tr(t, 'aiRename.dialogDescription'),
          footer,
        }
        if (primitives && primitives.Modal) {
          return React.createElement(primitives.Modal, modalProps, body)
        }
        return React.createElement(
          'div',
          {
            role: 'dialog',
            'aria-label': modalProps.title,
            className: 'dsh-auto-title-dialog',
            style: { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.35)', display: 'grid', placeItems: 'center' },
          },
          React.createElement(
            'div',
            { style: { background: 'var(--dsh-color-bg, #fff)', padding: 20, borderRadius: 12, minWidth: 420 } },
            React.createElement('h2', null, modalProps.title),
            body,
            footer,
          ),
        )
      }

      // -------------------------------------------------------------- settings
      /** The editable fields the card renders, in order. */
      const FIELDS = [
        { key: 'provider', kind: 'text', label: 'settings.provider' },
        { key: 'model', kind: 'text', label: 'settings.model' },
        { key: 'language', kind: 'text', label: 'settings.language' },
        { key: 'maxTitleLength', kind: 'number', label: 'settings.maxTitleLength' },
        { key: 'waitForReplyMs', kind: 'number', label: 'settings.waitForReplyMs' },
        { key: 'timeoutMs', kind: 'number', label: 'settings.timeoutMs' },
      ]

      /**
       * One labelled control.
       * @param props - label, hint, and the control.
       * @returns the row.
       */
      const Field = ({ label, hint, children }) => React.createElement(
        'label',
        { style: { display: 'grid', gap: 4, marginBottom: 12 } },
        React.createElement('span', { style: { fontSize: 12, opacity: 0.75 } }, label),
        children,
        hint === undefined ? null : React.createElement('span', { style: { fontSize: 11, opacity: 0.55 } }, hint),
      )

      /**
       * The Plugins-page card: the plugin's settings plus its diagnostic log.
       * @param props - `view` and the locale seat.
       * @returns the summary line, or the full page.
       */
      const SettingsCard = ({ view, t }) => {
        const [state, setState] = React.useState({ status: 'loading', config: null, entries: [], error: null })
        const [draft, setDraft] = React.useState(null)
        const [busy, setBusy] = React.useState('')
        const [notice, setNotice] = React.useState('')

        const load = React.useCallback(async () => {
          try {
            const [config, logs] = await Promise.all([
              getJson('/dsh-auto-title/config'),
              getJson('/dsh-auto-title/log?limit=40'),
            ])
            setState({ status: 'ready', config, entries: logs.entries ?? [], error: null })
            setDraft({ ...config.effective })
          } catch (error) {
            report('error', 'settings', `load failed: ${error instanceof Error ? error.message : String(error)}`, error)
            setState(current => ({ ...current, status: 'error', error }))
          }
        }, [])

        React.useEffect(() => { void load() }, [load])

        if (view === 'summary') {
          const effective = state.config?.effective
          const route = effective && effective.provider !== ''
            ? `${effective.provider}/${effective.model}`
            : tr(t, 'settings.providerHint')
          return React.createElement(
            'div',
            null,
            React.createElement('strong', null, tr(t, 'settings.title')),
            React.createElement('div', { style: { fontSize: 12, opacity: 0.7 } }, route),
          )
        }

        const refreshLog = async () => {
          setBusy('log')
          try {
            const logs = await getJson('/dsh-auto-title/log?limit=40')
            setState(current => ({ ...current, entries: logs.entries ?? [] }))
          } catch (error) {
            report('error', 'settings', `log refresh failed: ${error instanceof Error ? error.message : String(error)}`, error)
          } finally {
            setBusy('')
          }
        }

        const save = async (payload) => {
          setBusy('save')
          setNotice('')
          try {
            const config = await postJson('/dsh-auto-title/config', payload)
            setState(current => ({ ...current, status: 'ready', config, error: null }))
            setDraft({ ...config.effective })
            setNotice(tr(t, 'settings.saved'))
            report('info', 'settings', 'settings saved')
          } catch (error) {
            report('error', 'settings', `save failed: ${error instanceof Error ? error.message : String(error)}`, error)
            setNotice(`${tr(t, 'settings.saveFailed')} ${error instanceof Error ? error.message : String(error)}`)
          } finally {
            setBusy('')
          }
        }

        const clearLog = async () => {
          setBusy('log')
          try {
            await postJson('/dsh-auto-title/log', { clear: true })
            setState(current => ({ ...current, entries: [] }))
          } catch (error) {
            report('error', 'settings', `log clear failed: ${error instanceof Error ? error.message : String(error)}`, error)
          } finally {
            setBusy('')
          }
        }

        const copyLog = async () => {
          const text = state.entries
            .map(entry => `${new Date(entry.ts).toISOString()} [${entry.level}] ${entry.scope}: ${entry.message}${entry.detail ? `\n${entry.detail}` : ''}`)
            .join('\n')
          try {
            await navigator.clipboard.writeText(text)
            setNotice(tr(t, 'settings.copied'))
          } catch (error) {
            report('warn', 'settings', 'clipboard write failed', error)
          }
        }

        if (state.status === 'error') {
          return React.createElement(
            'div',
            { role: 'alert' },
            `${tr(t, 'settings.loadFailed')} ${state.error instanceof Error ? state.error.message : String(state.error)}`,
          )
        }
        if (draft === null) {
          return React.createElement('div', null, tr(t, 'settings.title'))
        }

        const Button = primitives && primitives.Button ? primitives.Button : 'button'
        const Input = primitives && primitives.Input ? primitives.Input : 'input'
        const effective = state.config?.effective ?? {}
        const inputStyle = { width: '100%', boxSizing: 'border-box' }

        return React.createElement(
          'div',
          { style: { display: 'grid', gap: 16, maxWidth: 640 } },
          React.createElement(
            'div',
            null,
            React.createElement('h3', { style: { margin: '0 0 4px' } }, tr(t, 'settings.title')),
            React.createElement('div', { style: { fontSize: 12, opacity: 0.7 } }, tr(t, 'settings.summary')),
            React.createElement(
              'div',
              { style: { fontSize: 12, marginTop: 8, opacity: 0.75 } },
              `${tr(t, 'settings.status')}: ${effective.enabled === false ? 'off' : 'on'} · ${effective.provider || '—'}/${effective.model || '—'}`,
            ),
          ),
          React.createElement(
            'label',
            { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            React.createElement('input', {
              type: 'checkbox',
              checked: draft.enabled !== false,
              onChange: (event) => setDraft({ ...draft, enabled: event.target.checked }),
            }),
            tr(t, 'settings.enabled'),
          ),
          ...FIELDS.map(field => React.createElement(
            Field,
            { key: field.key, label: tr(t, field.label), hint: field.key === 'provider' ? tr(t, 'settings.providerHint') : undefined },
            React.createElement(Input, {
              type: field.kind,
              value: draft[field.key] === undefined || draft[field.key] === null ? '' : String(draft[field.key]),
              style: inputStyle,
              onChange: (event) => {
                const raw = event.target.value
                setDraft({ ...draft, [field.key]: field.kind === 'number' ? (raw === '' ? '' : Number(raw)) : raw })
              },
            }),
          )),
          React.createElement(
            'div',
            { style: { display: 'flex', gap: 8, alignItems: 'center' } },
            React.createElement(
              Button,
              { variant: 'primary', type: 'button', disabled: busy !== '', onClick: () => save({ patch: draft }) },
              busy === 'save' ? tr(t, 'settings.saving') : tr(t, 'settings.save'),
            ),
            React.createElement(
              Button,
              { variant: 'outline', type: 'button', disabled: busy !== '', onClick: () => save({ reset: true }) },
              tr(t, 'settings.reset'),
            ),
            React.createElement(
              Button,
              { variant: 'ghost', type: 'button', disabled: busy !== '', onClick: () => { void load() } },
              tr(t, 'settings.reload'),
            ),
            notice === '' ? null : React.createElement('span', { style: { fontSize: 12, opacity: 0.8 } }, notice),
          ),
          React.createElement(
            'div',
            null,
            React.createElement('div', { style: { fontSize: 12, opacity: 0.6, marginBottom: 6 } },
              `${tr(t, 'settings.settingsPath')}: ${state.config?.settingsPath ?? ''}`),
            React.createElement(
              'div',
              { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 } },
              React.createElement('h4', { style: { margin: 0 } }, tr(t, 'settings.log')),
              React.createElement(Button, { variant: 'ghost', type: 'button', disabled: busy !== '', onClick: () => { void refreshLog() } }, tr(t, 'settings.reload')),
              React.createElement(Button, { variant: 'ghost', type: 'button', disabled: busy !== '', onClick: () => { void copyLog() } }, tr(t, 'settings.copyLog')),
              React.createElement(Button, { variant: 'ghost', type: 'button', disabled: busy !== '', onClick: () => { void clearLog() } }, tr(t, 'settings.logClear')),
            ),
            state.entries.length === 0
              ? React.createElement('div', { style: { fontSize: 12, opacity: 0.6 } }, tr(t, 'settings.logEmpty'))
              : React.createElement(
                'ol',
                { style: { margin: 0, padding: '0 0 0 18px', fontSize: 12, maxHeight: 320, overflow: 'auto' } },
                state.entries.map(entry => React.createElement(
                  'li',
                  { key: entry.seq, style: { marginBottom: 6 } },
                  React.createElement(
                    'div',
                    { style: { opacity: entry.level === 'error' ? 1 : 0.85, color: entry.level === 'error' ? 'var(--dsh-color-danger, #c0392b)' : undefined } },
                    `${new Date(entry.ts).toLocaleTimeString()} [${entry.level}] ${entry.scope}: ${entry.message}`,
                  ),
                  entry.detail === undefined
                    ? null
                    : React.createElement('pre', { style: { margin: '2px 0 0', whiteSpace: 'pre-wrap', fontSize: 11, opacity: 0.65 } }, entry.detail),
                )),
              ),
          ),
        )
      }

      // ----------------------------------------------------------------- apply
      /** Client services this bundle consumes. */
      const inject = ['slots', 'locale']

      /**
       * Register one surface, reporting a failure instead of losing the rest.
       * @param ctx - the client plugin context.
       * @param slot - the slot name.
       * @param options - the registration options.
       * @param component - the component.
       * @param label - the human name used in the log.
       */
      const register = (ctx, slot, options, component, label) => {
        try {
          ctx.slots.inject(slot, () => ctx.slots.register({ name: slot, ...options }, component))
          report('info', 'apply', `registered ${label} on ${slot}`)
        } catch (error) {
          report('error', 'apply', `could not register ${label} on ${slot}: ${error instanceof Error ? error.message : String(error)}`, error)
        }
      }

      /**
       * Register the locale namespace, the menu row, the dialog, and the card.
       * @param ctx - the client plugin context.
       */
      function apply(ctx) {
        report('info', 'apply', 'client half loading')
        if (ctx.locale && typeof ctx.locale.register === 'function') {
          try {
            ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-auto-title: locale')
          } catch (error) {
            report('warn', 'apply', 'locale registration failed', error)
          }
        }
        if (!ctx.slots || typeof ctx.slots.inject !== 'function') {
          report('error', 'apply', 'no slots service: nothing can be registered')
          return
        }
        register(ctx, 'sidebar.workspaces.session.menu.item', {
          id: 'ai-rename',
          // Lands right after the shipped "rename" row (order 200).
          order: 250,
          locale: NS,
        }, AutoRenameMenuItem, 'menu row')
        register(ctx, 'shell.overlay', {
          id: 'ai-rename-dialog',
          locale: NS,
        }, (props) => React.createElement(Guard, null, React.createElement(AutoRenameDialog, props)), 'rename dialog')
        // `settings.section` is the Settings navigation entry itself (the same
        // slot dsh-email's page uses). `plugins.item` is NOT it: that slot is a
        // child of the `main` panel slot owned by the plugin manager page, so a
        // card registered there is invisible from Settings.
        register(ctx, 'settings.section', {
          id: 'auto-title',
          // After the built-in sections (models 30, plugins 15, …) and next to
          // the installed plugins that ship their own page.
          order: 70,
          label: () => '自动命名',
          locale: NS,
          inject: () => ({}),
        }, (props) => React.createElement(Guard, null, React.createElement(SettingsCard, props)), 'settings section')
      }

      module.exports.apply = apply
      module.exports.inject = inject
      return module.exports
    },
  })
})()
