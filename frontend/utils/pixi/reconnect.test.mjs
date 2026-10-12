import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const transpile = (file) => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText
const followModule = () => {
    const exports = {}
    vm.runInNewContext(transpile('./office/follow.ts'), { exports })
    return exports
}

const tick = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)) }

function floor(x0, y0, width, height, extra = {}) {
    const tilemap = {}
    for (let x = x0; x < x0 + width; x++) for (let y = y0; y < y0 + height; y++) tilemap[`${x}, ${y}`] = {}
    return { ...tilemap, ...extra }
}

function harness() {
    const handlers = new Map()
    const managerHandlers = new Map()
    const signals = []
    const emitted = []
    const signalHandlers = new Map()
    const env = { roomPlayers: [], videoLeaves: 0, serverDisconnects: 0, signals, handlers, managerHandlers, spawned: [], emitted, signalHandlers }
    const socket = {
        active: true,
        io: { on: (name, callback) => managerHandlers.set(name, callback), off: name => managerHandlers.delete(name) },
        on: (name, callback) => handlers.set(name, callback),
        off: name => handlers.delete(name),
        emit(name, payload) { emitted.push([name, payload]) },
    }
    env.socket = socket
    class Graphics { clear() {} rect() {} fill() {} pivot = { set() {} } }
    class Player {
        constructor(skin, _app, username, isLocal = false) {
            Object.assign(this, { skin, username, isLocal, frozen: false, destroyed: false, parent: {}, currentTilePosition: { x: 0, y: 0 }, movingTo: null, walks: [] })
            if (!isLocal) env.spawned.push(this)
        }
        async init() { await new Promise(resolve => setImmediate(resolve)) }
        setPosition(x, y) { this.currentTilePosition = { x, y } }
        setFrozen(frozen) { this.frozen = frozen }
        setSeatedVisual() {}
        setFocusBadge() {}
        applyAvatarState() {}
        get verifiedPosition() { return this.currentTilePosition }
        moveToTile(x, y) {
            if (env.walkable && !env.walkable(x, y)) return false
            this.walks.push({ x, y })
            this.currentTilePosition = { x, y }
            return true
        }
        setMovementMode() {}
        setClickable() {}
        isAtTile(x, y) { return this.currentTilePosition.x === x && this.currentTilePosition.y === y }
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
    const source = transpile('./PlayApp.ts')
    const follow = followModule()
    const exports = {}
    vm.runInNewContext(source, {
        exports, console, setTimeout, clearTimeout, setInterval, clearInterval, Date, document: { removeEventListener() {} }, window: { removeEventListener() {} },
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
            if (name === '../signal') return { __esModule: true, default: { emit: (event, value) => signals.push({ event, value }), on: (event, callback) => signalHandlers.set(event, callback), off() {} } }
            if (name === '../video-chat/video-chat') return { videoChat: { leaveChannel: async () => { env.videoLeaves++ }, rememberToken() {} } }
            if (name === '../video-chat/meeting') return { setLocalMeetingUid() {}, setMeeting() {} }
            if (name === './office/geometry') return { nearestObject: () => null }
            if (name === './office/follow') return follow
            if (name === './office/focus') return { focusedUids: () => new Set(), nearestFocused: () => null }
            if (['../supabase/client', 'gsap', './office/InteractionLayer', './office/LightingLayer', './office/AnnexLayer', './office/annex-reveal', './office/GamepadController', './office/camera-zoom.mjs'].includes(name)) return {}
            throw new Error(`Unexpected import: ${name}`)
        },
    })
    const realm = { spawnpoint: { roomIndex: 0, x: 25, y: 18 }, rooms: [{ name: 'Escritório Matte', tilemap: floor(0, 0, 60, 30, { '51, 26': { teleporter: { roomIndex: 1, x: 10, y: 10 } } }) }, { name: 'Segundo andar', tilemap: floor(0, 0, 30, 30) }] }
    const app = new exports.PlayApp('pedro', 'office', realm, 'Pedro')
    app.setUpSocketEvents()
    app.setUpSignalListeners()
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

test('a reload starts where the server kept the visitor', async () => {
    const env = harness()
    env.app.setStartPosition({ roomIndex: 0, x: 70, y: 10 })
    await env.app.spawnLocalPlayer()
    assert.deepEqual(env.app.player.currentTilePosition, { x: 70, y: 10 })
})

test('without a usable server position the visitor starts at the spawnpoint', async () => {
    for (const position of [undefined, { roomIndex: 3, x: 70, y: 10 }]) {
        const env = harness()
        env.app.setStartPosition(position)
        await env.app.spawnLocalPlayer()
        assert.deepEqual(env.app.player.currentTilePosition, { x: 25, y: 18 }, JSON.stringify(position))
    }
})

// Values created inside the PlayApp sandbox compare by content.
const plain = value => JSON.parse(JSON.stringify(value))

async function following(t) {
    t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 100_000 })
    const env = harness()
    env.app.player.setPosition(2, 5)
    env.roomPlayers = [{ uid: 'bia', skin: '017', username: 'Bia', x: 10, y: 5 }]
    await env.app.syncOtherPlayers()
    env.signalHandlers.get('followStart')({ uid: 'bia' })
    // Mocked intervals fire once per tick() call: advance one interval at a time.
    env.advance = ms => { for (let elapsed = 0; elapsed < ms; elapsed += 300) t.mock.timers.tick(300) }
    env.notices = () => env.signals.filter(signal => signal.event === 'officeNotice').map(signal => signal.value.message)
    env.stops = () => plain(env.emitted.filter(([name]) => name === 'followStop'))
    return env
}

test('following walks next to the person, keeps up as they move and tells them', async (t) => {
    const env = await following(t)
    assert.deepEqual(plain(env.emitted.find(([name]) => name === 'followStart')), ['followStart', { targetUid: 'bia' }])
    assert.deepEqual(plain(env.signals.filter(signal => signal.event === 'followState').at(-1).value), { name: 'Bia' })
    assert.deepEqual(plain(env.app.player.currentTilePosition), { x: 9, y: 5 })
    env.handlers.get('playerMoved')({ uid: 'bia', x: 11, y: 5 })
    assert.deepEqual(plain(env.app.player.currentTilePosition), { x: 10, y: 5 }, 'takes the tile she just left')
    const walks = env.app.player.walks.length
    env.advance(900)
    assert.equal(env.app.player.walks.length, walks, 'no new paths while already next to her')
    env.signalHandlers.get('followStop')()
    assert.deepEqual(env.notices(), ['Você parou de seguir Bia.'])
    assert.deepEqual(env.stops(), [['followStop', { targetUid: 'bia' }]])
    assert.deepEqual(plain(env.signals.filter(signal => signal.event === 'followState').at(-1).value), { name: null })
})

test('the person taking the stairs is followed through the same passage', async (t) => {
    const env = await following(t)
    env.handlers.get('playerMoved')({ uid: 'bia', x: 50, y: 26 })
    env.handlers.get('playerMoved')({ uid: 'bia', x: 51, y: 26 })
    env.handlers.get('playerLeftRoom')('bia')
    assert.deepEqual(plain(env.app.player.walks.at(-1)), { x: 51, y: 26 })
    assert.deepEqual(env.notices(), [])
    // Upstairs: the room's people are synced, then following resumes.
    env.app.currentRoomIndex = 1
    env.app.player.setPosition(10, 10)
    env.roomPlayers = [{ uid: 'bia', skin: '017', username: 'Bia', x: 10, y: 12 }]
    await env.app.syncOtherPlayers()
    env.app.resumeFollowAfterStairs()
    env.advance(300)
    assert.deepEqual(plain(env.app.player.currentTilePosition), { x: 10, y: 11 })
    assert.deepEqual(env.notices(), [])
    env.signalHandlers.get('followStop')()
})

test('arriving upstairs without the person stops with a notice', async (t) => {
    const env = await following(t)
    env.handlers.get('playerMoved')({ uid: 'bia', x: 51, y: 26 })
    env.handlers.get('playerLeftRoom')('bia')
    env.app.currentRoomIndex = 1
    env.roomPlayers = []
    await env.app.syncOtherPlayers()
    env.app.resumeFollowAfterStairs()
    assert.deepEqual(env.notices(), ['Bia saiu do escritório.'])
    assert.deepEqual(env.stops(), [])
})

test('a person leaving the office ends following without telling them', async (t) => {
    const env = await following(t)
    env.handlers.get('playerLeftRoom')('bia')
    assert.deepEqual(env.notices(), ['Bia saiu do escritório.'])
    assert.deepEqual(env.stops(), [])
})

test('three seconds without a way to the person stops following', async (t) => {
    const env = await following(t)
    env.walkable = () => false
    env.handlers.get('playerMoved')({ uid: 'bia', x: 20, y: 5 })
    env.advance(2700)
    assert.deepEqual(env.notices(), [])
    env.advance(600)
    assert.deepEqual(env.notices(), ['Não foi possível seguir Bia.'])
    assert.deepEqual(env.stops(), [['followStop', { targetUid: 'bia' }]])
})

test('a dropped connection stops following silently', async (t) => {
    const env = await following(t)
    env.handlers.get('disconnect')('transport close')
    assert.deepEqual(plain(env.signals.filter(signal => signal.event === 'followState').at(-1).value), { name: null })
    assert.ok(!env.notices().some(message => message.includes('Bia')))
    assert.deepEqual(env.stops(), [])
})
