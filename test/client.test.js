import assert from 'node:assert/strict'
import test from 'node:test'

/**
 * Load the browser bundle the way the client module loader does: it is a classic
 * script that hands its factory to `window.__ModuleLoader__`, so a fake loader is
 * enough to exercise registration without a DOM.
 */
let loadCount = 0

async function loadBundle() {
  const loaded = []
  globalThis.window = {
    __ModuleLoader__: {
      load(definition) {
        loaded.push(definition)
      },
    },
  }
  // A fresh query defeats the ESM cache: the bundle is a side-effecting classic
  // script, so each test needs its own evaluation.
  await import(`../lib/client.js?smoke=${++loadCount}`)
  delete globalThis.window
  assert.equal(loaded.length, 1)
  return loaded[0]
}

/** A React stand-in: enough for the bundle's element-building and hooks. */
function fakeReact() {
  return {
    Component: class Component {
      /** @param props - the component props. */
      constructor(props) {
        this.props = props
        this.state = {}
      }
    },
    createElement: (type, props, ...children) => ({ type, props, children }),
    Fragment: 'Fragment',
    useState: value => [value, () => {}],
    useEffect: () => {},
  }
}

/** The bundle's exports, produced by a fake `require`. */
function instantiate(definition) {
  const primitives = {
    MenuItemButton: 'MenuItemButton',
    Modal: 'Modal',
    Button: 'Button',
    Input: 'Input',
  }
  const require = id => {
    if (id === 'react') return fakeReact()
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    throw new Error(`unexpected require: ${id}`)
  }
  return definition.factory(require)
}

/** A context that records every slot registration. */
function recordingContext(registrations, localeCalls = []) {
  return {
    effect(callback) {
      callback()
    },
    locale: {
      register(namespace, dictionaries) {
        localeCalls.push([namespace, dictionaries])
        return () => {}
      },
    },
    slots: {
      inject(name, factory) {
        assert.ok(typeof name === 'string' && name !== '')
        factory()
      },
      register(options, component) {
        registrations.push({ options, component })
        return () => {}
      },
    },
  }
}

test('the client bundle registers the menu row, the dialog, and the settings section', async () => {
  const definition = await loadBundle()
  assert.equal(definition.id, 'dsh-auto-title')
  const exports = instantiate(definition)
  assert.deepEqual(exports.inject, ['slots', 'locale'])

  const registrations = []
  const localeCalls = []
  exports.apply(recordingContext(registrations, localeCalls))

  assert.equal(localeCalls[0][0], 'dsh-auto-title')
  assert.ok(localeCalls[0][1].zh['aiRename'] === 'AI 重命名')
  assert.deepEqual(
    registrations.map(entry => [entry.options.name, entry.options.id, entry.options.order]),
    [
      ['sidebar.workspaces.session.menu.item', 'ai-rename', 250],
      ['shell.overlay', 'ai-rename-dialog', undefined],
      // `settings.section` is the Settings navigation entry. `plugins.item` is a
      // child of the plugin manager's `main` panel and is invisible from Settings.
      ['settings.section', 'auto-title', 70],
    ],
  )
  assert.equal(registrations[0].options.locale, 'dsh-auto-title')
})

test('the menu row hands the primitive `onSelect`, which is what wires the click', async () => {
  const definition = await loadBundle()
  const exports = instantiate(definition)
  const registrations = []
  exports.apply(recordingContext(registrations))

  const [row] = registrations
  const calls = []
  const element = row.component({
    sessionId: 'session-1',
    // The menu's open state is the occurrence hook context; the row only closes.
    useMenuOpenState: () => [true, value => calls.push(['menuOpen', value])],
    t: key => key,
  })
  assert.equal(element.type, 'MenuItemButton')
  assert.equal(typeof element.props.onSelect, 'function')
  // `MenuItemButton` forwards `onSelect` to the DOM click; `onClick` would be
  // silently dropped and the row would look dead.
  assert.equal(element.props.onClick, undefined)
  assert.deepEqual(element.children, ['AI 重命名'])

  element.props.onSelect()
  assert.deepEqual(calls[0], ['menuOpen', false])
})

test('the client bundle survives a host without UI primitives', async () => {
  const definition = await loadBundle()
  const require = id => {
    if (id === 'react') return fakeReact()
    throw new Error('primitives unavailable')
  }
  const exports = definition.factory(require)
  const registrations = []
  const ctx = {
    slots: {
      inject(_name, factory) { factory() },
      register(options) { registrations.push(options); return () => {} },
    },
  }
  assert.doesNotThrow(() => exports.apply(ctx))
  assert.equal(registrations.length, 3)
})
