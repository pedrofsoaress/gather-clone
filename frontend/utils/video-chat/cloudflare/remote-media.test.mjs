import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { pathToFileURL } from 'node:url'

const transpile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText

// Also a helper of CloudflareVideoChat.test.mjs: its own tests run only when this file is the one being run.
const main = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href
const it = main ? test : () => {}

// A document whose elements record what the page does to them. `add(id)` puts a container on the page.
export function fakeDocument(name) {
    const registry = new Map()
    const doc = {
        name,
        createElement: tag => element(tag),
        getElementById: id => registry.get(id) ?? null,
        add(id, tag = 'div') { const box = element(tag); box.id = id; registry.set(id, box); return box },
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
            play() { el.played++; el.paused = false; return Promise.resolve() },
            pause() { el.paused = true },
            setSinkId(id) { el.sinkId = id; return Promise.resolve() },
        }
        return el
    }
    return doc
}

// Arrays made inside the vm have another prototype: copy them before comparing.
export const tracksOf = element => [...element.srcObject.tracks]

export class FakeMediaStream { constructor(tracks) { this.tracks = tracks } }

// The module running on `document`; MediaStream records the tracks it was made with.
export function loadRemoteMedia(document) {
    const exports = {}
    vm.runInNewContext(transpile('./remote-media.ts'), { exports, document, MediaStream: FakeMediaStream, HTMLMediaElement: class { setSinkId() {} } })
    return exports
}

it('a remote video plays muted and inline in the tile, moves to another document and swaps its track', () => {
    const page = fakeDocument('page'), floating = fakeDocument('floating')
    const tile = page.add('remote-user-ana'), bubble = floating.add('bubble')
    const { RemoteVideo } = loadRemoteMedia(page)
    const first = { id: 'cam-1' }, next = { id: 'cam-2' }
    const video = new RemoteVideo(first)
    video.play('remote-user-ana', { fit: 'contain' })
    assert.equal(tile.children.length, 1)
    const element = tile.children[0]
    assert.equal(element.tag, 'video')
    assert.equal(element.ownerDocument, page)
    assert.equal(element.muted, true)
    assert.equal(element.autoplay, true)
    assert.equal(element.playsInline, true)
    assert.equal(element.style.objectFit, 'contain')
    assert.deepEqual(tracksOf(element), [first])
    assert.equal(element.played, 1)

    video.play(bubble)
    assert.equal(element.removed, true)
    assert.equal(tile.children.length, 0)
    const moved = bubble.children[0]
    assert.equal(moved.ownerDocument, floating)
    assert.equal(moved.style.objectFit, 'cover')

    video.setTrack(next)
    assert.deepEqual(tracksOf(moved), [next])
    video.stop()
    assert.equal(moved.removed, true)
    assert.equal(bubble.children.length, 0)
})

it('remote audio: volume in percent, the default output, the RTP level and stop', async () => {
    const page = fakeDocument('page')
    const { RemoteAudio } = loadRemoteMedia(page)
    const track = { id: 'mic' }
    let level = 0.4
    const audio = new RemoteAudio(track, { getSynchronizationSources: () => [{ audioLevel: level }] })
    const element = audio.element
    assert.equal(element.tag, 'audio')
    assert.equal(element.autoplay, true)
    assert.deepEqual(tracksOf(element), [track])
    audio.setVolume(57)
    assert.equal(element.volume, 0.57)
    audio.setVolume(250)
    assert.equal(element.volume, 1)
    audio.setVolume(-3)
    assert.equal(element.volume, 0)
    await audio.setPlaybackDevice('default')
    assert.equal(element.sinkId, '')
    await audio.setPlaybackDevice('usb')
    assert.equal(element.sinkId, 'usb')
    assert.equal(audio.getVolumeLevel(), 0.4)
    level = 0.01
    assert.equal(audio.getVolumeLevel(), 0.01)
    assert.equal(new RemoteAudio(track, null).getVolumeLevel(), 0)
    assert.equal(new RemoteAudio(track, { getSynchronizationSources: () => [] }).getVolumeLevel(), 0)
    audio.play()
    assert.equal(element.played, 1)
    audio.stop()
    assert.equal(element.srcObject, null)
    assert.equal(element.paused, true)
})

it('the local preview is mirrored by default, plain for a shared screen, and skips a missing container', () => {
    const page = fakeDocument('page')
    const box = page.add('local-video')
    const { LocalPreview } = loadRemoteMedia(page)
    const camera = { id: 'camera' }
    const preview = new LocalPreview()
    preview.play(box, camera)
    const video = box.children[0]
    assert.equal(video.style.objectFit, 'cover')
    assert.equal(video.style.transform, 'scaleX(-1)')
    assert.deepEqual(tracksOf(video), [camera])

    preview.play('local-video', camera, { fit: 'contain', mirror: false })
    assert.equal(video.removed, true)
    const screen = box.children[0]
    assert.equal(screen.style.objectFit, 'contain')
    assert.equal(screen.style.transform, '')
    preview.stop()
    assert.equal(screen.removed, true)
    assert.equal(box.children.length, 0)

    preview.play('nowhere', camera)
    preview.stop()
    assert.equal(box.children.length, 0)
})
