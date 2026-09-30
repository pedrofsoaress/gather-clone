import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as actions from './avatar-actions.ts'
import { MovementAuthority } from './movement-authority.ts'

const tick = () => new Promise(resolve => setImmediate(resolve))
function deferred() {
    let resolve, reject
    const promise = new Promise((yes, no) => { resolve = yes; reject = no })
    return { promise, resolve, reject }
}

function harness() {
    const loads = [], sheets = [], gates = new Map()
    const resource = () => ({ destroyCount: 0, destroy() { assert.equal(++this.destroyCount, 1, 'resource must be destroyed only once') } })
    class Container { children = []; addChild(child) { this.children.push(child) } }
    class Spritesheet {
        constructor(texture, data) {
            this.texture = texture
            this.data = data
            this.animations = { idle_down: [resource()] }
            this.destroyCount = 0
            this.parsed = deferred()
            sheets.push(this)
        }
        parse() { return this.parsed.promise }
        destroy() { assert.equal(++this.destroyCount, 1, 'spritesheet must be destroyed only once') }
    }
    const source = ts.transpileModule(readFileSync(new URL('./Player.ts', import.meta.url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText
    const exports = {}
    vm.runInNewContext(source, {
        exports, console, setTimeout, clearTimeout,
        document: { createElement: () => ({ getContext: () => ({ drawImage() {} }) }) },
        require: name => {
            if (name === 'pixi.js') return {
                Container, Text: class {}, Spritesheet,
                Assets: { load: src => { loads.push(src); const gate = deferred(); gates.set(src, gate); return gate.promise } },
                Texture: { from: source => ({ source: { resource: source }, ...resource() }) },
                Ticker: { shared: { remove() {} } },
            }
            if (name === './PlayerSpriteSheetData') return { meta: {} }
            if (name === './skins') return { defaultSkin: '009', skins: ['001', '002', '009'] }
            if (name === './avatar-actions') return actions
            if (name === './movement-authority') return { MovementAuthority }
            if (name === './outline-pixels') return { outlineCanvas() {} }
            if (name === './AvatarDecorations') return { AvatarDecorations: class {} }
            if (name === '@/utils/signal') return { emit() {} }
            if (['../office/walkable-path', '../../backend/server', '@/utils/video-chat/video-chat', '@/utils/video-chat/agoraIdentity', 'gsap'].includes(name)) return {}
            throw new Error(`Unexpected import: ${name}`)
        },
    })
    // Begin with an initialized player, retaining the same resource ownership as init().
    const player = new exports.Player('009', {}, 'Pedro')
    const oldSheet = new Spritesheet({}, { meta: { image: 'original' } })
    const oldSeat = resource()
    const sprite = { ...resource(), textures: oldSheet.animations.idle_down, play() {} }
    player.sheet = oldSheet
    player.avatarSprite = sprite
    player.seatedTextures = { down: oldSeat }
    player.rawAtlas = 'original'
    player.initialized = true
    return { player, oldSheet, oldSeat, sprite, loads, sheets, gates }
}

test('rapid skin changes serialize atlas swaps and release each replaced atlas exactly once', async () => {
    const env = harness()
    const first = env.player.changeSkin('001')
    const second = env.player.changeSkin('002')
    await tick()
    assert.deepEqual(env.loads, ['/sprites/characters/Character_001.png'])
    env.gates.get(env.loads[0]).resolve()
    await tick()
    assert.equal(env.player.rawAtlas, 'original', 'pending parsing must not replace the atlas used for seated poses')
    env.sheets[1].parsed.resolve()
    await first
    await tick()
    assert.equal(env.oldSheet.destroyCount, 1)
    assert.equal(env.oldSeat.destroyCount, 1)
    assert.equal(env.loads.length, 2)
    env.gates.get(env.loads[1]).resolve()
    await tick()
    env.sheets[2].parsed.resolve()
    await second
    assert.equal(env.player.skin, '002')
    assert.equal(env.player.sheet, env.sheets[2])
    assert.equal(env.sprite.textures, env.sheets[2].animations.idle_down)
    assert.equal(env.sheets[1].destroyCount, 1)
    assert.equal(env.sheets[2].destroyCount, 0)
    env.player.destroy()
    assert.equal(env.sheets[2].destroyCount, 1)
})

test('destroy during a skin parse releases old and pending resources and cancels queued changes', async () => {
    const env = harness()
    const pending = env.player.changeSkin('001')
    const queued = env.player.changeSkin('002')
    await tick()
    env.gates.get('/sprites/characters/Character_001.png').resolve()
    await tick()
    env.player.destroy()
    env.sheets[1].parsed.resolve()
    await Promise.all([pending, queued])
    assert.equal(env.oldSheet.destroyCount, 1)
    assert.equal(env.oldSeat.destroyCount, 1)
    assert.equal(env.sheets[1].destroyCount, 1)
    assert.equal(env.sprite.destroyCount, 1)
    assert.equal(env.player.sheet, null)
    assert.equal(env.player.avatarSprite, null)
    assert.equal(env.loads.length, 1)
})

test('a failed atlas parse preserves the existing skin and allows the next queued change', async () => {
    const env = harness()
    const first = env.player.changeSkin('001')
    const rejected = assert.rejects(first, /parse failed/)
    const second = env.player.changeSkin('002')
    await tick()
    env.gates.get('/sprites/characters/Character_001.png').resolve()
    await tick()
    env.sheets[1].parsed.reject(new Error('parse failed'))
    await rejected
    assert.equal(env.player.skin, '009')
    assert.equal(env.player.sheet, env.oldSheet)
    assert.equal(env.oldSheet.destroyCount, 0)
    assert.equal(env.oldSeat.destroyCount, 0)
    assert.equal(env.sheets[1].destroyCount, 1)
    await tick()
    env.gates.get('/sprites/characters/Character_002.png').resolve()
    await tick()
    env.sheets[2].parsed.resolve()
    await second
    assert.equal(env.player.skin, '002')
    env.player.destroy()
})
