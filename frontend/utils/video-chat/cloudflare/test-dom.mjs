// Shared by remote-media.test.mjs and CloudflareVideoChat.test.mjs: a recording DOM and remote-media.ts loaded on it.
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const transpile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText

// A document whose elements record what the page does to them. `add(id)` puts a container on the page.
// `autoplayBlocked` makes play() of unmuted elements reject; `failSink` makes setSinkId reject; `gesture(name)` is a
// click or key press on the page.
export function fakeDocument(name) {
    const registry = new Map()
    const listeners = new Map()
    const doc = {
        name, autoplayBlocked: false, failSink: false,
        createElement: tag => element(tag),
        getElementById: id => registry.get(id) ?? null,
        add(id, tag = 'div') { const box = element(tag); box.id = id; registry.set(id, box); return box },
        addEventListener(event, fn) { listeners.set(event, [...(listeners.get(event) ?? []), fn]) },
        removeEventListener(event, fn) { listeners.set(event, (listeners.get(event) ?? []).filter(other => other !== fn)) },
        listenerCount: event => (listeners.get(event) ?? []).length,
        gesture(event = 'pointerdown') { for (const fn of [...(listeners.get(event) ?? [])]) fn() },
    }
    function element(tag) {
        const el = {
            tag, ownerDocument: doc, parent: null, children: [], style: {}, srcObject: null, volume: 1, sinkId: undefined, played: 0, paused: false, removed: false,
            autoplay: false, muted: false, playsInline: false,
            replaceChildren(...children) {
                for (const child of el.children) child.parent = null
                el.children = children
                for (const child of children) child.parent = el
            },
            remove() {
                el.removed = true
                if (el.parent) el.parent.children = el.parent.children.filter(child => child !== el)
                el.parent = null
            },
            play() {
                if (doc.autoplayBlocked && !el.muted) return Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }))
                el.played++
                el.paused = false
                return Promise.resolve()
            },
            pause() { el.paused = true },
            setSinkId(id) {
                if (doc.failSink) return Promise.reject(new Error('sink refused'))
                el.sinkId = id
                return Promise.resolve()
            },
        }
        return el
    }
    return doc
}

// Arrays made inside the vm have another prototype: copy them before comparing.
export const tracksOf = element => [...element.srcObject.tracks]

export class FakeMediaStream { constructor(tracks) { this.tracks = tracks } }

// The module running on `document`; MediaStream records the tracks it was made with. `clock.now` is performance.now().
// `globals` adds browser globals (an AudioContext) to the module's context.
export function loadRemoteMedia(document, clock = { now: 0 }, globals = {}) {
    const exports = {}
    vm.runInNewContext(transpile('./remote-media.ts'), { exports, document, MediaStream: FakeMediaStream, HTMLMediaElement: class { setSinkId() {} }, performance: { now: () => clock.now }, ...globals })
    return exports
}
