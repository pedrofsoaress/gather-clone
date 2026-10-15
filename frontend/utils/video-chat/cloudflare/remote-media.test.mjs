import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeDocument, loadRemoteMedia, tracksOf } from './test-dom.mjs'

// Kept here as well for callers of the brief's helper.
export { fakeDocument }

test('a remote video plays muted and inline in the tile, moves to another document and swaps its track', () => {
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
    // The same track again leaves the playing element alone (no blink).
    const playing = moved.srcObject
    video.setTrack(next)
    assert.equal(moved.srcObject, playing)
    video.stop()
    assert.equal(moved.removed, true)
    assert.equal(bubble.children.length, 0)
})

test('remote audio: volume in percent, the default output, the RTP level and stop', async () => {
    const page = fakeDocument('page')
    const clock = { now: 10_000 }
    const { RemoteAudio, AUDIO_LEVEL_FRESH_MS } = loadRemoteMedia(page, clock)
    assert.equal(AUDIO_LEVEL_FRESH_MS, 500)
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
    // The browser keeps the last level of a source that went silent (a remote mute): only a recent packet counts.
    const sourced = timestamp => new RemoteAudio(track, { getSynchronizationSources: () => [{ audioLevel: 0.4, timestamp }] }).getVolumeLevel()
    assert.equal(sourced(9_800), 0.4)
    assert.equal(sourced(9_000), 0)
    assert.equal(sourced(Date.now() - 100), 0.4, 'epoch timestamps are compared with the wall clock')
    assert.equal(sourced(Date.now() - 5_000), 0)
    audio.play()
    assert.equal(element.played, 1)
    audio.stop()
    assert.equal(element.srcObject, null)
    assert.equal(element.paused, true)
})

test('the local preview is mirrored by default, plain for a shared screen, and skips a missing container', () => {
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

test('remote audio blocked by autoplay plays on the next click or key press, once', async () => {
    const page = fakeDocument('page')
    const { RemoteAudio } = loadRemoteMedia(page)
    page.autoplayBlocked = true
    const audio = new RemoteAudio({ id: 'mic' }, null)
    audio.play()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(audio.element.played, 0)
    assert.equal(page.listenerCount('pointerdown'), 1)
    assert.equal(page.listenerCount('keydown'), 1)
    page.autoplayBlocked = false
    page.gesture('keydown')
    assert.equal(audio.element.played, 1)
    assert.equal(page.listenerCount('pointerdown'), 0)
    assert.equal(page.listenerCount('keydown'), 0)

    // Stopped before any gesture: nothing is left waiting.
    page.autoplayBlocked = true
    const other = new RemoteAudio({ id: 'mic-2' }, null)
    other.play()
    await new Promise(resolve => setImmediate(resolve))
    other.stop()
    assert.equal(page.listenerCount('pointerdown'), 0)
    page.autoplayBlocked = false
    page.gesture('pointerdown')
    assert.equal(other.element.played, 0)
})

test('without a level in the RTP sources (Cloudflare sends none), the level is measured from the decoded audio', () => {
    const page = fakeDocument('page')
    const made = []
    let samples = [0.1, -0.1, 0.1, -0.1]
    class FakeAudioContext {
        constructor() { this.state = 'suspended'; this.resumed = 0; made.push(this) }
        resume() { this.resumed++; this.state = 'running'; return Promise.resolve() }
        createMediaStreamSource(stream) { const node = { stream, connected: [], disconnected: false, connect(to) { node.connected.push(to) }, disconnect() { node.disconnected = true } }; this.source = node; return node }
        createAnalyser() { return { fftSize: 2048, getFloatTimeDomainData(array) { for (let i = 0; i < array.length; i++) array[i] = samples[i % samples.length] } } }
    }
    const { RemoteAudio, SPEAKING_AUDIO_LEVEL } = loadRemoteMedia(page, { now: 0 }, { AudioContext: FakeAudioContext, Float32Array })
    const track = { id: 'mic' }
    const audio = new RemoteAudio(track, { getSynchronizationSources: () => [{ timestamp: 5 }] })
    assert.ok(Math.abs(audio.getVolumeLevel() - 0.1) < 1e-6)
    assert.ok(audio.getVolumeLevel() > SPEAKING_AUDIO_LEVEL)
    assert.equal(made.length, 1)
    assert.deepEqual([...made[0].source.stream.tracks], [track])
    assert.equal(made[0].resumed, 1, 'a suspended context is resumed')
    samples = [0.001, -0.001]
    assert.ok(audio.getVolumeLevel() < SPEAKING_AUDIO_LEVEL)
    // One context for the page.
    const other = new RemoteAudio({ id: 'mic-2' }, null)
    samples = [0.3, -0.3]
    assert.ok(Math.abs(other.getVolumeLevel() - 0.3) < 1e-6)
    assert.equal(made.length, 1)
    // A level in the sources is used as before, without measuring.
    const sourced = new RemoteAudio({ id: 'mic-3' }, { getSynchronizationSources: () => [{ audioLevel: 0.4 }] })
    assert.equal(sourced.getVolumeLevel(), 0.4)
    audio.stop()
    assert.equal(made[0].source.disconnected, false, 'the last source made belongs to the other audio')
    assert.equal(audio.getVolumeLevel(), 0, 'a stopped audio is silent')
})
