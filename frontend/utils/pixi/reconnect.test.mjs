import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const tick = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)) }

function harness() {
    const handlers = new Map()
    const managerHandlers = new Map()
    const signals = []
    const env = { roomPlayers: [], videoLeaves: 0, serverDisconnects: 0, signals, handlers, managerHandlers, spawned: [] }
    const socket = {
        active: true,
        io: { on: (name, callback) => managerHandlers.set(name, callback), off: name => managerHandlers.delete(name) },
        on: (name, callback) => handlers.set(name, callback),
        off: name => handlers.delete(name),
        emit() {},
    }
    env.socket = socket
    class Graphics { clear() {} rect() {} fill() {} pivot = { set() {} } }
    class Player {
        constructor(skin, _app, username, isLocal = false) {
            Object.assign(this, { skin, username, isLocal, frozen: false, destroyed: false, parent: {}, currentTilePosition: { x: 0, y: 0 } })
            if (!isLocal) env.spawned.push(this)
        }
        async init() { await new Promise(resolve => setImmediate(resolve)) }
        setPosition(x, y) { this.currentTilePosition = { x, y } }
        setFrozen(frozen) { this.frozen = frozen }
        setSeatedVisual() {}
        applyAvatarState() {}
        moveToTile(x, y) { this.currentTilePosition = { x, y } }
        requestRunning() {}
        destroy() { this.destroyed = true }
    }
    class App {
        constructor(realmData) {
            this.realmData = realmData
            this.currentRoomIndex = realmData.spawnpoint.roomIndex
            this.layers = { object: { addChild() {}, removeChild() {} } }
            this.app = { screen: { width: 800, height: 600 }, stage: { pivot: { set() {} } } }
        }
        sortObjectsByY() {}
    }
    const source = ts.transpileModule(readFileSync(new URL('./PlayApp.ts', import.meta.url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText
    const exports = {}
    vm.runInNewContext(source, {
        exports, console, setTimeout, clearTimeout, document: { removeEventListener() {} }, window: { removeEventListener() {} },
        require: name => {
            if (name === './App') return { App }
            if (name === './Player/Player') return { Player }
            if (name === 'pixi.js') return { Graphics, Container: class {}, Ticker: { shared: { add() {}, remove() {} } } }
            if (name === '../backend/server') return { server: {
                socket,
                getPlayersInRoom: async () => ({ data: { players: env.roomPlayers }, error: null }),
                disconnect() { env.serverDisconnects++ },
            } }
            if (name === './Player/skins') return { defaultSkin: '009' }
            if (name === '../signal') return { __esModule: true, default: { emit: (event, value) => signals.push({ event, value }), on() {}, off() {} } }
            if (name === '../video-chat/video-chat') return { videoChat: { leaveChannel: async () => { env.videoLeaves++ } } }
            if (['../supabase/client', 'gsap', './office/geometry', './office/InteractionLayer', './office/LightingLayer', './office/GamepadController', './office/camera-zoom.mjs'].includes(name)) return {}
            throw new Error(`Unexpected import: ${name}`)
        },
    })
    const realm = { spawnpoint: { roomIndex: 0, x: 25, y: 18 }, rooms: [{ name: 'Escritório Matte', tilemap: {} }] }
    const app = new exports.PlayApp('pedro', 'office', realm, 'Pedro')
    app.setUpSocketEvents()
    env.app = app
    return env
}

test('a dropped connection keeps the office and the call open while it reconnects', async () => {
    const env = harness()
    env.handlers.get('disconnect')('transport close')
    assert.equal(env.serverDisconnects, 0, 'automatic reconnection must stay enabled')
    assert.equal(env.videoLeaves, 0)
    assert.equal(env.app.player.frozen, true)
    assert.ok(!env.signals.some(signal => signal.event === 'showDisconnectModal'))
    assert.ok(env.handlers.has('joinedRealm'))
})

test('rejoining restores the server position, other visitors and movement', async () => {
    const env = harness()
    env.handlers.get('disconnect')('ping timeout')
    env.roomPlayers = [{ uid: 'michele', skin: '017', username: 'Michele', x: 30, y: 10 }]
    await env.handlers.get('joinedRealm')({ roomIndex: 0, x: 40, y: 12 })
    assert.deepEqual(env.app.player.currentTilePosition, { x: 40, y: 12 })
    assert.equal(env.app.player.frozen, false)
    assert.deepEqual(Object.keys(env.app.players), ['michele'])
    assert.ok(env.signals.some(signal => signal.value?.key === 'office-reconnected'))
})

test('when reconnection gives up the call ends and the visitor is told', async () => {
    const env = harness()
    env.handlers.get('disconnect')('transport close')
    env.managerHandlers.get('reconnect_failed')()
    assert.equal(env.videoLeaves, 1)
    assert.ok(env.signals.some(signal => signal.event === 'showDisconnectModal'))
})

test('a server that closes the socket ends the session instead of waiting', async () => {
    const env = harness()
    env.socket.active = false
    env.handlers.get('disconnect')('io server disconnect')
    assert.equal(env.videoLeaves, 1)
    assert.ok(env.signals.some(signal => signal.event === 'showDisconnectModal'))
})

test('movement from a visitor this screen never saw join brings their avatar in', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const env = harness()
    env.roomPlayers = [{ uid: 'adriano', skin: '060', username: 'Adriano', x: 12, y: 8 }]
    env.handlers.get('playerMoved')({ uid: 'adriano', x: 12, y: 8 })
    t.mock.timers.tick(1000)
    await tick()
    assert.equal(env.app.players.adriano?.username, 'Adriano')
})

test('a resync removes avatars of people who are no longer in the room', async () => {
    const env = harness()
    env.roomPlayers = [{ uid: 'adriano', skin: '060', username: 'Adriano', x: 12, y: 8 }]
    await env.app.syncOtherPlayers()
    env.roomPlayers = []
    await env.app.syncOtherPlayers()
    assert.deepEqual(Object.keys(env.app.players), [])
    assert.equal(env.spawned[0].destroyed, true)
})

test('simultaneous join events create a single avatar', async () => {
    const env = harness()
    const adriano = { uid: 'adriano', skin: '060', username: 'Adriano', x: 12, y: 8 }
    env.handlers.get('playerJoinedRoom')(adriano)
    env.roomPlayers = [adriano]
    await env.app.syncOtherPlayers()
    await tick()
    assert.equal(env.spawned.length, 1)
})

test('rejoining an older server without a reported position still restores movement', async () => {
    const env = harness()
    env.app.player.setPosition(40, 12)
    env.handlers.get('disconnect')('transport close')
    await env.handlers.get('joinedRealm')()
    assert.deepEqual(env.app.player.currentTilePosition, { x: 40, y: 12 })
    assert.equal(env.app.player.frozen, false)
})
