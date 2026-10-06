import test from 'node:test'
import assert from 'node:assert/strict'
import { copyStyles, floatingApi, registerAutoOpen } from './floating-window.ts'

function fakeDocument(styleSheets = []) {
    const head = { children: [], appendChild(node) { this.children.push(node) } }
    return { styleSheets, head, createElement: tag => ({ tag }) }
}

test('the floating window is only offered where the browser supports it', () => {
    assert.equal(floatingApi({}), null)
    const api = { window: null, requestWindow: async () => ({}) }
    assert.equal(floatingApi({ documentPictureInPicture: api }), api)
    assert.equal(floatingApi(undefined), null)
})

test('office styles are copied inline, or linked by absolute URL when unreadable', () => {
    const readable = { cssRules: [{ cssText: '.a { color: red; }' }, { cssText: '.b { margin: 0; }' }] }
    const external = { href: 'https://cdn.example/fonts.css', get cssRules() { throw new Error('cross-origin') } }
    const target = fakeDocument()
    copyStyles(fakeDocument([readable, external]), target)
    assert.equal(target.head.children[0].tag, 'style')
    assert.equal(target.head.children[0].textContent, '.a { color: red; }\n.b { margin: 0; }')
    assert.deepEqual({ ...target.head.children[1] }, { tag: 'link', rel: 'stylesheet', href: 'https://cdn.example/fonts.css' })
})

test('automatic opening is registered and released through Media Session', () => {
    const handlers = new Map()
    const session = { setActionHandler: (action, handler) => handlers.set(action, handler) }
    const open = () => {}
    const release = registerAutoOpen(open, session)
    assert.equal(handlers.get('enterpictureinpicture'), open)
    release()
    assert.equal(handlers.get('enterpictureinpicture'), null)
})

test('browsers without automatic picture-in-picture are left untouched', () => {
    const session = { setActionHandler() { throw new TypeError('unsupported action') } }
    assert.doesNotThrow(() => registerAutoOpen(() => {}, session)())
    assert.doesNotThrow(() => registerAutoOpen(() => {}, undefined)())
})
