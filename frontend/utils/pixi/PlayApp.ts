import { App } from './App'
import { Player } from './Player/Player'
import { Point, RealmData, SpriteMap, TilePoint } from './types'
import * as PIXI from 'pixi.js'
import { server } from '../backend/server'
import { defaultSkin } from './Player/skins'
import signal from '../signal'
import { createClient } from '../supabase/client'
import { gsap } from 'gsap'
import { isWithinMap, nearestObject } from './office/geometry'
import { InteractionLayer } from './office/InteractionLayer'
import type { OfficeSnapshot } from './office/types'
import { LightingLayer } from './office/LightingLayer'
import { AnnexLayer } from './office/AnnexLayer'
import { focusedUids, nearestFocused } from './office/focus'
import { FOLLOW_TICK_MS, departureStairs, followStopNotice, followStopTellsTarget, isNextTo, rankFollowTiles, sameTile, shouldReplan, trackFollowProgress, type FollowProgress, type FollowStopReason } from './office/follow'
import { isAnnexTrigger, shouldReveal } from './office/annex-reveal'
import { GamepadController, type GamepadInput } from './office/GamepadController'
import type { AvatarSnapshot } from './Player/avatar-actions'
import { zoomAtCursor } from './office/camera-zoom.mjs'
import { videoChat } from '../video-chat/video-chat'
import { setLocalMeetingUid, setMeeting, type MeetingSnapshot } from '../video-chat/meeting'

// After this long a pending avatar load is treated as stuck and tried again.
const SPAWN_STALE_MS = 12000

// Following someone: their last known tile (from the server), the walk planned towards
// them, and the stairs they took while the follower walks to the same passage.
type Follow = {
    uid: string, name: string, phase: 'follow' | 'stairs', stairs: Point | null,
    targetTile: Point | null, previousTile: Point | null, goal: Point | null, progress: FollowProgress,
}

export class PlayApp extends App {
    private scale: number = 1.5
    public player: Player
    public blocked: Set<TilePoint> = new Set()
    public keysDown: string[] = []
    private teleportLocation: Point | null = null
    private startRoomIndex: number | null = null
    private fadeOverlay: PIXI.Graphics = new PIXI.Graphics()
    private fadeDuration: number = 0.5
    public uid: string = ''
    public realmId: string = ''
    public players: { [key: string]: Player } = {}
    private disableInput: boolean = false

    private kicked: boolean = false

    private fadeTiles: SpriteMap = {}
    private fadeTileContainer: PIXI.Container = new PIXI.Container()
    private fadeAnimation: gsap.core.Tween | null = null
    private currentPrivateAreaTiles: TilePoint[] = []
    public proximityId: string | null = null
    private interactionLayer: InteractionLayer | null = null
    private pendingOfficeObjectId: string | null = null
    private officeSnapshot: OfficeSnapshot = { occupancy: {}, games: {} }
    private focusSelf = false
    private focusNearbyUid: string | null = null
    private cameraDrag: { pointerId: number, startX: number, startY: number, pivotX: number, pivotY: number } | null = null
    private cameraManuallyPanned = false
    private lightingLayer: LightingLayer | null = null
    private annexLayer: AnnexLayer | null = null
    private presentationFocused = false
    private gamepad: GamepadController | null = null
    private gamepadDirection: string | null = null
    private keyboardKeys = new Set<string>()
    private gamepadRunning = false
    private keyboardRunning = false
    private avatarSnapshot: AvatarSnapshot = {}
    private eventsRemoved = false
    private roomTransitioning = false
    private reconnecting = false
    private spawning = new Map<string, { promise: Promise<void>, startedAt: number, token: number }>()
    private spawnToken = 0
    private lastSync: { at: number, ok: boolean, listed: string[], error?: string } | null = null
    private diagnostics: HTMLDivElement | null = null
    private diagnosticsTimer: ReturnType<typeof setInterval> | null = null
    private departures = new Map<string, number>()
    private resyncTimer: ReturnType<typeof setTimeout> | null = null
    private resyncInterval: ReturnType<typeof setInterval> | null = null
    private follow: Follow | null = null
    private followTimer: ReturnType<typeof setInterval> | null = null
    private avatarMenu: { id: number, uid: string, x: number, y: number } | null = null
    private avatarMenuCount = 0
    private followers = new Set<string>()

    constructor(uid: string, realmId: string, realmData: RealmData, username: string, skin: string = defaultSkin) {
        super(realmData)
        if (realmData.rooms[realmData.spawnpoint.roomIndex]?.backgroundImage) {
            this.scale = 1
        }
        this.uid = uid
        setLocalMeetingUid(uid)
        this.realmId = realmId
        this.player = new Player(skin, this, username, true)
    }

    // Where the server placed this visitor on joining (their last tile after a quick reload).
    // Call before init(); without a usable position the visitor starts at the spawnpoint.
    public setStartPosition = (position?: { roomIndex: number, x: number, y: number }) => {
        if (!position || !this.realmData.rooms[position.roomIndex]) return
        this.startRoomIndex = position.roomIndex
        this.teleportLocation = { x: position.x, y: position.y }
    }

    override async loadRoom(index: number) {
        this.releaseMovement()
        this.closeAvatarMenu()
        // Only the stairs taken after the followed person keep following across rooms.
        if (this.follow?.phase !== 'stairs') this.stopFollowing('manual')
        for (const player of Object.values(this.players)) player.destroy()
        this.currentRoomIndex = index
        this.players = {}
        this.avatarSnapshot = {}
        this.officeSnapshot = { occupancy: {}, games: {} }
        await super.loadRoom(index)
        this.setUpLighting()
        this.setUpRoomInteractions()
        this.setUpAnnex()
        this.setUpBlockedTiles()
        this.setUpFadeTiles()
        await this.spawnLocalPlayer()
        this.player.applyAvatarState()
        this.player.setSeatedVisual(null)
        if (!this.roomTransitioning) await this.syncOtherPlayers()
        signal.emit('officeRoomChanged', { roomIndex: index, objects: this.realmData.rooms[index].interactions ?? [] })
        this.displayInitialChatMessage()
        this.updateFocus()
    }

    private setUpLighting = () => {
        this.lightingLayer?.destroy()
        const room = this.realmData.rooms[this.currentRoomIndex]
        this.lightingLayer = new LightingLayer(room.interactions ?? [], room.backgroundImage?.width ?? 1600, room.backgroundImage?.height ?? 960)
        this.lightingLayer.setPresentation(this.presentationFocused)
        // Keep world effects under both interaction hit areas and transition overlays.
        this.app.stage.addChildAt(this.lightingLayer.container, this.app.stage.getChildIndex(this.layers.object) + 1)
    }

    private setUpRoomInteractions = () => {
        if (this.interactionLayer) {
            this.app.stage.removeChild(this.interactionLayer.container)
            this.interactionLayer.destroy()
        }
        this.pendingOfficeObjectId = null
        const objects = this.realmData.rooms[this.currentRoomIndex].interactions ?? []
        this.interactionLayer = new InteractionLayer(
            objects,
            (id, event) => this.onObjectClicked(id, event),
            (object) => signal.emit('officeHover', { objectId: object?.id ?? null }),
        )
        this.interactionLayer.setOccupancy(this.officeSnapshot.occupancy)
        this.interactionLayer.setGames(this.officeSnapshot.games)
        this.app.stage.addChildAt(this.interactionLayer.container, this.app.stage.getChildIndex(this.lightingLayer!.container) + 1)
    }

    // The annex wing starts dark on every visit; signs stay visible above the darkness.
    // Once the wing is lit the signs move just under the avatars so they never cover people or name tags.
    private setUpAnnex = () => {
        this.annexLayer?.destroy()
        this.annexLayer = null
        const room = this.realmData.rooms[this.currentRoomIndex]
        if (!room.annex && !room.signs?.length) return
        const layer: AnnexLayer = new AnnexLayer(room.annex, room.signs ?? [], () => this.placeSignsUnderAvatars(layer))
        this.annexLayer = layer
        const index = this.app.stage.getChildIndex(this.interactionLayer!.container) + 1
        this.app.stage.addChildAt(layer.darkness, index)
        this.app.stage.addChildAt(layer.signs, index + 1)
        if (layer.revealed) this.placeSignsUnderAvatars(layer)
    }

    private placeSignsUnderAvatars = (layer: AnnexLayer) => {
        if (layer.signs.destroyed || layer.signs.parent !== this.app.stage) return
        this.app.stage.setChildIndex(layer.signs, this.app.stage.getChildIndex(this.layers.object))
    }

    private onObjectClicked = (id: string, event: PIXI.FederatedPointerEvent) => {
        // Objects are drawn above the avatars: someone seated at a desk is still a click on them.
        const avatar = Object.entries(this.players)
            .filter(([, player]) => player.hitsGlobal(event.global))
            .sort(([, a], [, b]) => b.parent.y - a.parent.y)[0]
        if (avatar) { this.onAvatarClicked(avatar[0]); return }
        // The click that closes the "Seguir" button does nothing else.
        if (this.avatarMenu) { this.closeAvatarMenu(); return }
        this.requestOfficeObject(id)
    }

    public requestOfficeObject = (id: string): boolean => {
        if (this.disableInput || this.player.frozen) return false
        this.stopFollowing('manual')
        const room = this.realmData.rooms[this.currentRoomIndex]
        const object = room.interactions?.find((item) => item.id === id)
        if (!object) return false
        if (!room.tilemap[`${object.approach.x}, ${object.approach.y}`]) return false

        this.pendingOfficeObjectId = null
        this.keysDown = []
        this.player.setMovementMode('mouse')
        if (this.player.isAtTile(object.approach.x, object.approach.y)) {
            this.activateOfficeObject(id)
            return true
        }

        if (!this.player.moveToTile(object.approach.x, object.approach.y)) {
            signal.emit('officeFeedback', { message: 'Não consigo chegar até esse objeto.' })
            return false
        }
        this.pendingOfficeObjectId = id
        return true
    }

    public onLocalPlayerTileChanged = (position: Point) => {
        const annex = this.realmData.rooms[this.currentRoomIndex].annex
        if (this.annexLayer && shouldReveal(annex, position.x, position.y)) this.annexLayer.reveal(isAnnexTrigger(annex, position.x, position.y))
        const objects = this.realmData.rooms[this.currentRoomIndex].interactions ?? []
        const nearby = nearestObject(objects, position.x, position.y, 2)
        signal.emit('officeNearby', { objectId: nearby?.id ?? null })
        signal.emit('officePosition', { ...position, roomIndex: this.currentRoomIndex })
        this.updateFocus()
    }

    private onOfficeStateChanged = (snapshot: OfficeSnapshot) => {
        if (this.roomTransitioning) return
        if (!snapshot || !snapshot.occupancy) return
        this.officeSnapshot = snapshot
        this.interactionLayer?.setOccupancy(snapshot.occupancy)
        this.interactionLayer?.setGames(snapshot.games)
        const objects = this.realmData.rooms[this.currentRoomIndex].interactions ?? []
        for (const [uid, player] of [[this.uid, this.player] as const, ...Object.entries(this.players) as [string, Player][]]) {
            const occupiedId = Object.keys(snapshot.occupancy).find(id => snapshot.occupancy[id].uid === uid)
            const object = objects.find(item => item.id === occupiedId)
            player.setSeatedVisual(object?.seatVisual ?? null)
        }
        signal.emit('officeSnapshot', snapshot)
        this.updateFocus()
    }

    // Focus badges, the local focus state, and who the local visitor could knock on.
    private updateFocus() {
        const objects = this.realmData.rooms[this.currentRoomIndex]?.interactions ?? []
        const occupancy = this.officeSnapshot.occupancy
        const focused = focusedUids(objects, occupancy)
        this.player.setFocusBadge(focused.has(this.uid))
        for (const [uid, player] of Object.entries(this.players)) player.setFocusBadge(focused.has(uid))

        const selfFocused = focused.has(this.uid)
        if (selfFocused !== this.focusSelf) {
            this.focusSelf = selfFocused
            signal.emit('focusSelf', selfFocused)
            if (selfFocused) signal.emit('officeNotice', { message: 'Modo foco: ninguém te escuta. Quem quiser falar vai te chamar.', key: 'focus-on' })
        }

        // Only someone standing can knock: seated visitors (any seat or desk) get no offer.
        const seated = Object.values(occupancy).some(seat => seat.uid === this.uid)
        const nearby = seated ? null : nearestFocused(
            this.player.currentTilePosition,
            Object.entries(this.players).map(([uid, p]) => ({ uid, name: p.username, x: p.currentTilePosition.x, y: p.currentTilePosition.y })),
            focused,
        )
        if ((nearby?.uid ?? null) !== this.focusNearbyUid) {
            this.focusNearbyUid = nearby?.uid ?? null
            signal.emit('focusNearby', nearby)
        }
    }

    public onLocalPlayerStopped = () => {
        const id = this.pendingOfficeObjectId
        this.pendingOfficeObjectId = null
        if (!id) return
        const object = this.realmData.rooms[this.currentRoomIndex].interactions?.find((item) => item.id === id)
        if (object && this.player.isAtTile(object.approach.x, object.approach.y)) {
            this.activateOfficeObject(id)
        }
    }

    // Someone else's seat is taken one step before its approach tile (sitRange), and that
    // last step clears the seated pose: sit them down again once they stop on the approach.
    public onRemotePlayerStopped = (player: Player) => {
        const uid = Object.keys(this.players).find(id => this.players[id] === player)
        const occupiedId = uid ? Object.keys(this.officeSnapshot.occupancy).find(id => this.officeSnapshot.occupancy[id].uid === uid) : undefined
        const object = this.realmData.rooms[this.currentRoomIndex].interactions?.find(item => item.id === occupiedId)
        if (object?.seatVisual && player.isAtTile(object.approach.x, object.approach.y)) player.setSeatedVisual(object.seatVisual)
    }

    private activateOfficeObject(id: string) {
        const object = this.realmData.rooms[this.currentRoomIndex].interactions?.find(item => item.id === id)
        if (object?.kind === 'seat' || object?.kind === 'desk') {
            // Walking past another chair may have occupied it automatically.
            // The clicked chair wins once the verified path reaches its approach.
            server.socket.timeout(8000).emit('officeAction', { objectId: id, action: 'occupy' },
                (timeout: Error | null, result: { ok: boolean, error?: string }) => {
                    if (timeout || !result?.ok) signal.emit('officeFeedback', { message: result?.error || 'Não foi possível ocupar este lugar.' })
                })
        }
        signal.emit('officeOpen', { objectId: id })
    }

    private setUpFadeTiles = () => {
        this.fadeAnimation?.kill()
        this.fadeAnimation = null
        this.currentPrivateAreaTiles = []
        this.fadeTileContainer.alpha = 0
        this.fadeTiles = {}
        this.fadeTileContainer.removeChildren()

        for (const [key] of Object.entries(this.realmData.rooms[this.currentRoomIndex].tilemap)) {
            const [x, y] = key.split(',').map(Number)
            const screenCoordinates = this.convertTileToScreenCoordinates(x, y)
            const tile: PIXI.Sprite = new PIXI.Sprite(PIXI.Assets.get('/sprites/faded-tile.png'))
            tile.x = screenCoordinates.x
            tile.y = screenCoordinates.y
            this.fadeTileContainer.addChild(tile)
            this.fadeTiles[key as TilePoint] = tile
        }
    }

    public fadeInTiles = (privateAreaId: string) => {
        // Stop any ongoing fade animation
        if (this.fadeAnimation) {
            this.fadeAnimation.kill();
        }

        this.currentPrivateAreaTiles = []
        // get all tiles with privateAreaId
        const tiles = Object.entries(this.realmData.rooms[this.currentRoomIndex].tilemap).filter(([key, value]) => value.privateAreaId === privateAreaId)
        for (const [key] of tiles) {
            const tile = this.fadeTiles[key as TilePoint]
            tile.alpha = 0
            this.currentPrivateAreaTiles.push(key as TilePoint)
        }

        this.fadeAnimation = gsap.to(this.fadeTileContainer, { 
            alpha: 1, 
            duration: 0.25, 
            ease: 'power2.out',
            onComplete: () => {
                this.fadeAnimation = null
            }
        })
    }

    public fadeOutTiles = () => {
        // Stop any ongoing fade animation
        if (this.fadeAnimation) {
            this.fadeAnimation.kill()
        }

        this.fadeAnimation = gsap.to(this.fadeTileContainer, { 
            alpha: 0, 
            duration: 0.25, 
            ease: 'power2.in',
            onComplete: () => {
                for (const key of this.currentPrivateAreaTiles) {
                    const tile = this.fadeTiles[key]
                    tile.alpha = 1
                }
                this.fadeAnimation = null
            }
        })
    }

    private async loadAssets() {
        await Promise.all([
            PIXI.Assets.load('/fonts/silkscreen.ttf'),
            PIXI.Assets.load('/fonts/nunito.ttf'),
            PIXI.Assets.load('/sprites/faded-tile.png')
        ])
    }

    private async syncOtherPlayers() {
        const known = Object.keys(this.players)
        const departuresBefore = new Map(this.departures)
        const room = this.currentRoomIndex
        const {data, error} = await server.getPlayersInRoom(room)
        if (error) {
            console.error('Failed to get player positions in room:', error)
            this.lastSync = { at: Date.now(), ok: false, listed: [], error: String(error.message ?? error) }
            return
        }
        this.lastSync = { at: Date.now(), ok: true, listed: data.players.map((player: { username: string }) => player.username) }
        if (this.eventsRemoved || room !== this.currentRoomIndex) return

        // Drop avatars whose departure was missed, e.g. while this connection was down.
        const listed = new Set(data.players.map((player: { uid: string }) => player.uid))
        for (const uid of known) if (!listed.has(uid) && uid in this.players) this.onPlayerLeftRoom(uid)
        // Someone who left while the list was in flight stays gone.
        const current = data.players.filter((player: { uid: string }) => player.uid !== this.uid && (this.departures.get(player.uid) ?? 0) === (departuresBefore.get(player.uid) ?? 0))
        await Promise.all(current.map((player: any) => this.updatePlayer(player.uid, player)))

        this.sortObjectsByY()
    }

    // Ask the server for the room's players again when an event mentions someone this
    // screen never saw join; a single missed event must not hide a person all session.
    private scheduleResync = () => {
        if (this.resyncTimer || this.roomTransitioning || this.reconnecting) return
        this.resyncTimer = setTimeout(() => {
            this.resyncTimer = null
            if (!this.eventsRemoved) void this.syncOtherPlayers()
        }, 1000)
    }

    // A missed join is otherwise only noticed when that person moves; someone who
    // stays put (seated in a room) would stay invisible. Check the list regularly
    // and whenever the tab comes back to the front.
    private startPeriodicResync = () => {
        if (this.eventsRemoved || this.resyncInterval) return
        this.resyncInterval = setInterval(this.scheduleResync, 60000)
        document.addEventListener('visibilitychange', this.onVisibilityChange)
    }

    private onVisibilityChange = () => {
        if (document.visibilityState === 'visible') this.scheduleResync()
    }

    private isSpawning = (uid: string) => {
        const pending = this.spawning.get(uid)
        return Boolean(pending && Date.now() - pending.startedAt < SPAWN_STALE_MS)
    }

    // Opening the office with ?diag in the address shows what this screen knows about
    // the people in the room, so a missing avatar can be diagnosed from a screenshot.
    private startDiagnostics = () => {
        if (this.eventsRemoved || this.diagnostics || !new URLSearchParams(window.location.search).has('diag')) return
        const box = document.createElement('div')
        box.style.cssText = 'position:fixed;left:8px;top:8px;z-index:9999;max-width:420px;padding:8px 10px;border-radius:8px;background:rgba(2,6,23,.92);color:#e2e8f0;font:12px/1.4 ui-monospace,monospace;white-space:pre-wrap;pointer-events:none'
        box.dataset.followAvoid = ''
        document.body.appendChild(box)
        this.diagnostics = box
        const render = () => {
            const age = (at: number) => `${Math.round((Date.now() - at) / 1000)}s`
            const known = Object.entries(this.players).map(([uid, player]) => `  ${player.username} (${uid.slice(0, 4)}) ${player.currentTilePosition.x},${player.currentTilePosition.y}`)
            const spawning = [...this.spawning.entries()].map(([uid, pending]) => `  ${uid.slice(0, 4)} há ${age(pending.startedAt)}`)
            const sync = this.lastSync ? `${this.lastSync.ok ? 'ok' : 'ERRO ' + this.lastSync.error} há ${age(this.lastSync.at)}: ${this.lastSync.listed.join(', ')}` : 'nenhuma'
            box.textContent = [
                `eu: ${this.player.username} (${this.uid.slice(0, 4)}) ${this.player.currentTilePosition.x},${this.player.currentTilePosition.y}`,
                `conexão: ${server.socket.connected ? 'ok' : 'caiu'} · aba: ${document.visibilityState}${this.reconnecting ? ' · reconectando' : ''}`,
                `vejo (${known.length}):`, ...known,
                `carregando (${spawning.length}):`, ...spawning,
                `última lista do servidor: ${sync}`,
            ].join('\n')
        }
        render()
        this.diagnosticsTimer = setInterval(render, 1000)
    }

    private async updatePlayer(uid: string, player: any) {
        const pending = this.spawning.get(uid)
        // A spawn that has not finished in a while (an avatar image that never
        // arrived) must not block every later attempt for that person.
        if (pending && Date.now() - pending.startedAt < SPAWN_STALE_MS) await pending.promise
        else if (pending) this.spawning.delete(uid)
        if (this.eventsRemoved) return
        if (uid in this.players) {
            if (this.players[uid].skin !== player.skin) {
                await this.players[uid].changeSkin(player.skin)
            }
            if (this.players[uid].currentTilePosition.x !== player.x || this.players[uid].currentTilePosition.y !== player.y) {
                this.players[uid].setPosition(player.x, player.y)
            }
        } else {
            const token = ++this.spawnToken
            const spawn = this.spawnPlayer(player.uid, player.skin, player.username, player.x, player.y, token)
                .catch(error => console.error('Failed to show avatar', uid, error))
                .finally(() => { if (this.spawning.get(uid)?.token === token) this.spawning.delete(uid) })
            this.spawning.set(uid, { promise: spawn, startedAt: Date.now(), token })
            await spawn
        }
    }

    private async spawnPlayer(uid: string, skin: string, username: string, x: number, y: number, token: number) {
        const departures = this.departures.get(uid) ?? 0
        const room = this.currentRoomIndex
        const otherPlayer = new Player(skin, this, username)
        await otherPlayer.init()
        // The person may have left, this screen changed rooms, or a newer attempt replaced this one while the avatar loaded.
        const replaced = this.spawning.get(uid)?.token !== token || uid in this.players
        if (this.eventsRemoved || room !== this.currentRoomIndex || departures !== (this.departures.get(uid) ?? 0) || replaced) {
            otherPlayer.destroy()
            return
        }
        otherPlayer.setPosition(x, y)
        otherPlayer.setClickable(() => this.onAvatarClicked(uid))
        this.layers.object.addChild(otherPlayer.parent)
        this.players[uid] = otherPlayer
        otherPlayer.applyAvatarState(this.avatarSnapshot[uid])
        this.emitVideoProfile(uid)
        const occupiedId = Object.keys(this.officeSnapshot.occupancy).find(id => this.officeSnapshot.occupancy[id].uid === uid)
        const object = this.realmData.rooms[this.currentRoomIndex].interactions?.find(item => item.id === occupiedId)
        otherPlayer.setSeatedVisual(object?.seatVisual ?? null)
        this.sortObjectsByY()
        this.updateFocus()
    }

    public async init() {
        await super.init()
        await this.loadAssets()
        await this.loadRoom(this.startRoomIndex ?? this.realmData.spawnpoint.roomIndex)
        this.app.stage.eventMode = 'static'
        this.setScale(this.scale)
        this.app.renderer.on('resize', this.resizeEvent)
        this.fadeTileContainer.alpha = 0
        this.fadeTileContainer.eventMode = 'none'
        this.app.stage.addChild(this.fadeTileContainer)
        this.clickEvents()
        this.setUpKeyboardEvents()
        this.setUpFadeOverlay()
        this.setUpSignalListeners()
        this.setUpSocketEvents()
        this.gamepad = new GamepadController(this.onGamepadInput, status => signal.emit('officeGamepad', status))
        signal.emit('officeNotice', { message: `Bem-vindo ao ${this.realmData.rooms[this.currentRoomIndex].name}.`, key: 'office-welcome' })
        this.requestSnapshots()
        // People who joined while the room was loading arrived before the socket listeners existed.
        await this.syncOtherPlayers()
        this.startPeriodicResync()
        this.startDiagnostics()

        this.fadeOut()
    }

    private requestSnapshots = () => {
        server.socket.emit('avatarGetSnapshot', (response: { ok: boolean, snapshot?: AvatarSnapshot }) => {
            if (response?.ok && response.snapshot) this.onAvatarState(response.snapshot)
        })
        server.socket.emit('officeGetSnapshot', (response: { ok: boolean, snapshot?: OfficeSnapshot }) => {
            if (response?.ok && response.snapshot) this.onOfficeStateChanged(response.snapshot)
        })
        server.socket.emit('meetingGetState', (response: { ok: boolean, snapshot?: MeetingSnapshot | null }) => {
            if (response?.ok) setMeeting(response.snapshot ?? null)
        })
    }

    private spawnLocalPlayer = async () => {
        await this.player.init()

        if (this.teleportLocation) {
            this.player.setPosition(this.teleportLocation.x, this.teleportLocation.y)
        } else {
            this.player.setPosition(this.realmData.spawnpoint.x, this.realmData.spawnpoint.y)
        }
        this.layers.object.addChild(this.player.parent)
        this.moveCameraToPlayer()
        this.onLocalPlayerTileChanged(this.player.currentTilePosition)
    }

    private setScale = (newScale: number) => {
        this.scale = newScale
        this.app.stage.scale.set(this.scale)
    }

    public moveCameraToPlayer = () => {
        if (this.cameraDrag) return
        this.cameraManuallyPanned = false
        const x = this.player.parent.x - (this.app.screen.width / 2) / this.scale
        const y = this.player.parent.y - (this.app.screen.height / 2) / this.scale
        this.app.stage.pivot.set(x, y)
        this.updateFadeOverlay(x, y)
    }

    private updateFadeOverlay = (x: number, y: number) => {
        this.fadeOverlay.clear()
        this.fadeOverlay.rect(0, 0, this.app.screen.width * (1 / this.scale), this.app.screen.height * (1 / this.scale))
        this.fadeOverlay.fill(0x0F0F0F)
        this.fadeOverlay.pivot.set(-x, -y)
    }

    private resizeEvent = () => {
        if (this.cameraManuallyPanned) this.updateFadeOverlay(this.app.stage.pivot.x, this.app.stage.pivot.y)
        else this.moveCameraToPlayer()
    }

    private setUpFadeOverlay = () => {
        this.fadeOverlay.eventMode = 'none'
        this.fadeOverlay.rect(0, 0, this.app.screen.width * (1 / this.scale), this.app.screen.height * (1 / this.scale))
        this.fadeOverlay.fill(0x0F0F0F)
        this.app.stage.addChild(this.fadeOverlay)
    }

    private setUpBlockedTiles = () => {
        this.blocked = new Set<TilePoint>()

        for (const [key, value] of Object.entries(this.realmData.rooms[this.currentRoomIndex].tilemap)) {
            if (value.impassable) {
                this.blocked.add(key as TilePoint)
            }
        }

        for (const [key, value] of Object.entries(this.collidersFromSpritesMap)) {
            if (value) {
                this.blocked.add(key as TilePoint)
            }
        }
    }

    private clickEvents = () => {
        this.app.stage.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
            if (e.button !== 0) return
            // The click that closes the "Seguir" button does not walk.
            if (this.avatarMenu) { this.closeAvatarMenu(); return }
            if (this.player.frozen || this.disableInput) return  

            const clickPosition = e.getLocalPosition(this.app.stage)
            const { x, y } = this.convertScreenToTileCoordinates(clickPosition.x, clickPosition.y)
            const room = this.realmData.rooms[this.currentRoomIndex]
            if (room.backgroundImage && !isWithinMap(x, y, room.backgroundImage.width / 32, room.backgroundImage.height / 32)) return
            this.stopFollowing('manual')
            this.pendingOfficeObjectId = null
            this.player.moveToTile(x, y)
            this.player.setMovementMode('mouse')
        })
        const canvas = this.app.canvas
        canvas.addEventListener('contextmenu', this.preventCanvasContextMenu)
        canvas.addEventListener('pointerdown', this.startCameraDrag)
        canvas.addEventListener('pointermove', this.moveCameraDrag)
        canvas.addEventListener('pointerup', this.endCameraDrag)
        canvas.addEventListener('pointercancel', this.endCameraDrag)
        canvas.addEventListener('wheel', this.zoomCamera, { passive: false })
        window.addEventListener('blur', this.cancelCameraDrag)
        window.addEventListener('blur', this.releaseMovement)
    }

    private preventCanvasContextMenu = (event: MouseEvent) => event.preventDefault()

    private zoomCamera = (event: WheelEvent) => {
        if (this.disableInput || this.player.frozen || this.roomTransitioning || !event.deltaY) return
        const bounds = this.app.canvas.getBoundingClientRect()
        if (!bounds.width || !bounds.height) return
        // Listen only on the canvas: wheel events on chat, menus and video never
        // reach this handler. Pixi's screen units can differ from CSS pixels.
        event.preventDefault()
        this.closeAvatarMenu()
        const cursor = {
            x: (event.clientX - bounds.left) * this.app.screen.width / bounds.width,
            y: (event.clientY - bounds.top) * this.app.screen.height / bounds.height,
        }
        const next = zoomAtCursor({ scale: this.scale, pivot: this.app.stage.pivot }, cursor, event.deltaY, event.deltaMode, this.app.screen.height)
        if (next.scale === this.scale) return
        this.setScale(next.scale)
        this.app.stage.pivot.set(next.pivot.x, next.pivot.y)
        this.cameraManuallyPanned = true
        this.updateFadeOverlay(next.pivot.x, next.pivot.y)
        if (this.cameraDrag) {
            // Keep right-button dragging continuous if the wheel is used while held.
            this.cameraDrag.startX = event.clientX
            this.cameraDrag.startY = event.clientY
            this.cameraDrag.pivotX = next.pivot.x
            this.cameraDrag.pivotY = next.pivot.y
        }
    }

    private startCameraDrag = (event: PointerEvent) => {
        if (event.button !== 2 || this.disableInput) return
        event.preventDefault()
        this.closeAvatarMenu()
        this.cameraDrag = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            pivotX: this.app.stage.pivot.x,
            pivotY: this.app.stage.pivot.y,
        }
        this.cameraManuallyPanned = true
        this.app.canvas.style.cursor = 'grabbing'
        this.app.canvas.setPointerCapture(event.pointerId)
    }

    private moveCameraDrag = (event: PointerEvent) => {
        const drag = this.cameraDrag
        if (!drag || event.pointerId !== drag.pointerId) return
        if (!(event.buttons & 2)) { this.endCameraDrag(event); return }
        const x = drag.pivotX - (event.clientX - drag.startX) / this.scale
        const y = drag.pivotY - (event.clientY - drag.startY) / this.scale
        this.app.stage.pivot.set(x, y)
        this.updateFadeOverlay(x, y)
    }

    private endCameraDrag = (event: PointerEvent) => {
        if (!this.cameraDrag || event.pointerId !== this.cameraDrag.pointerId) return
        this.cancelCameraDrag()
    }

    private cancelCameraDrag = () => {
        const pointerId = this.cameraDrag?.pointerId
        this.cameraDrag = null
        this.app.canvas.style.cursor = ''
        if (pointerId !== undefined && this.app.canvas.hasPointerCapture(pointerId)) this.app.canvas.releasePointerCapture(pointerId)
    }

    private setUpKeyboardEvents = () => {
        document.addEventListener('keydown', this.keydown)
        document.addEventListener('keyup', this.keyup)
    }

    private keydown = (event: KeyboardEvent) => {
        const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
        if (event.repeat || this.keysDown.includes(key) || this.disableInput) return
        const target = event.target
        if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return

        if (event.key.toLowerCase() === 'z') { this.player.requestDance(); return }
        if (event.key === 'Shift') {
            this.keyboardRunning = true
            this.player.requestRunning(true)
            return
        }
        if (event.key.toLowerCase() === 'e') {
            const position = this.player.currentTilePosition
            const object = nearestObject(this.realmData.rooms[this.currentRoomIndex].interactions ?? [], position.x, position.y, 2)
            if (object) this.requestOfficeObject(object.id)
            return
        }

        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(key)) return
        event.preventDefault()
        this.stopFollowing('manual')
        this.pendingOfficeObjectId = null
        this.player.keydown(event)
        this.keyboardKeys.add(key)
        this.keysDown.push(key)
    }

    private keyup = (event: KeyboardEvent) => {
        if (event.key === 'Shift') {
            this.keyboardRunning = false
            this.player.requestRunning(this.gamepadRunning)
        }
        const released = event.key.length === 1 ? event.key.toLowerCase() : event.key
        this.keyboardKeys.delete(released)
        if (this.gamepadDirection !== released) this.keysDown = this.keysDown.filter((key) => key !== released)
    }

    private onGamepadInput = (input: GamepadInput) => {
        if (input.back && !document.hidden) signal.emit('officeClose')
        const target = document.activeElement
        const editing = target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
        const blocked = this.disableInput || this.player.frozen || editing
        const running = !blocked && input.running
        if (running !== this.gamepadRunning) {
            this.gamepadRunning = running
            this.player.requestRunning(this.keyboardRunning || running)
        }
        if (!blocked && input.dance) this.player.requestDance()
        const direction = blocked ? null : input.direction
        if (direction !== this.gamepadDirection) {
            if (this.gamepadDirection && !this.keyboardKeys.has(this.gamepadDirection)) this.keysDown = this.keysDown.filter(key => key !== this.gamepadDirection)
            this.gamepadDirection = direction
            if (direction) {
                this.stopFollowing('manual')
                this.pendingOfficeObjectId = null
                this.keysDown = this.keysDown.filter(key => key !== direction)
                this.keysDown.push(direction)
                this.player.keydown(new KeyboardEvent('keydown', { key: direction }))
            }
        }
        if (!blocked && input.action) {
            const position = this.player.currentTilePosition
            const object = nearestObject(this.realmData.rooms[this.currentRoomIndex].interactions ?? [], position.x, position.y, 2)
            if (object) this.requestOfficeObject(object.id)
        }
    }

    private releaseMovement = () => {
        if (this.keyboardRunning || this.gamepadRunning) this.player.requestRunning(false)
        this.keyboardRunning = false
        this.gamepadRunning = false
        this.keyboardKeys.clear()
        this.gamepadDirection = null
        this.keysDown = []
    }

    public teleportIfOnTeleportSquare = (x: number, y: number) => {
        const tile = `${x}, ${y}` as TilePoint
        const teleport = this.realmData.rooms[this.currentRoomIndex].tilemap[tile]?.teleporter
        if (teleport) {
            this.teleport(teleport.roomIndex, teleport.x, teleport.y)
            return true
        }
        return false
    }

    private teleport = async (roomIndex: number, x: number, y: number) => {
        if (this.roomTransitioning) return
        this.roomTransitioning = true
        this.player.setFrozen(true)
        this.releaseMovement()
        await this.fadeIn()
        type Result = { ok: boolean, error?: string, proximityId?: string | null, roomIndex?: number, verifiedPosition?: Point }
        const result = await new Promise<Result>(resolve => server.socket.timeout(8000).emit('teleport', { x, y, roomIndex }, (timeout: Error | null, response: Result) => resolve(timeout ? { ok: false, error: 'Não foi possível atravessar a passagem.' } : response)))
        if (!result?.ok) {
            if (result?.verifiedPosition) this.player.setPosition(result.verifiedPosition.x, result.verifiedPosition.y)
            signal.emit('officeFeedback', { message: result?.error ?? 'Passagem indisponível.' })
            if (this.follow?.phase === 'stairs') this.stopFollowing('unreachable')
        } else {
            this.player.resetConversation()
            if (this.currentRoomIndex === roomIndex) {
                this.player.setPosition(x, y)
                this.moveCameraToPlayer()
            } else {
                this.teleportLocation = { x, y }
                this.player.changeAnimationState('idle_down')
                await this.loadRoom(roomIndex)
            }
            this.proximityId = result.proximityId ?? null
        }
        this.roomTransitioning = false
        if (result?.ok) {
            await this.syncOtherPlayers()
            this.resumeFollowAfterStairs()
            server.socket.emit('officeGetSnapshot', (response: { ok: boolean, snapshot?: OfficeSnapshot }) => { if (response?.ok && response.snapshot) this.onOfficeStateChanged(response.snapshot) })
            server.socket.emit('avatarGetSnapshot', (response: { ok: boolean, snapshot?: AvatarSnapshot }) => { if (response?.ok && response.snapshot) this.onAvatarState(response.snapshot) })
            signal.emit('officeRoomReady')
            this.player.checkIfShouldJoinChannel(this.player.verifiedPosition)
        }
        this.player.setFrozen(false)
        this.fadeOut()
    }

    public hasTeleport = (x: number, y: number) => {
        const tile = `${x}, ${y}` as TilePoint
        return this.realmData.rooms[this.currentRoomIndex].tilemap[tile]?.teleporter
    }

    private fadeIn = () => {
        PIXI.Ticker.shared.remove(this.fadeOutTicker)
        this.fadeOverlay.alpha = 0
        return new Promise<void>((resolve) => {
            const fadeTicker = ({ deltaTime }: { deltaTime: number }) => {
                this.fadeOverlay.alpha += (deltaTime / 60) / this.fadeDuration
                if (this.fadeOverlay.alpha >= 1) {
                    this.fadeOverlay.alpha = 1
                    PIXI.Ticker.shared.remove(fadeTicker)
                    resolve()
                }
            }

            PIXI.Ticker.shared.add(fadeTicker)
        })
    }

    private fadeOut = () => {
        PIXI.Ticker.shared.add(this.fadeOutTicker)
    }

    private fadeOutTicker = ({ deltaTime }: { deltaTime: number }) => {
        this.fadeOverlay.alpha -= (deltaTime / 60) / this.fadeDuration
        if (this.fadeOverlay.alpha <= 0) {
            this.fadeOverlay.alpha = 0
            PIXI.Ticker.shared.remove(this.fadeOutTicker)
        }
    }

    // Clicking someone offers "Seguir {nome}" next to their avatar (in page coordinates).
    private onAvatarClicked = (uid: string) => {
        const player = this.players[uid]
        if (!player || this.disableInput || this.player.frozen || this.roomTransitioning) return
        this.closeAvatarMenu()
        if (this.follow?.uid === uid) return
        this.avatarMenu = { id: ++this.avatarMenuCount, uid, x: NaN, y: NaN }
        PIXI.Ticker.shared.add(this.watchAvatarMenu)
        this.watchAvatarMenu()
    }

    // The button moves with the avatar (walking, the camera following the visitor). It closes
    // when the person leaves, the room changes, the camera is dragged or zoomed, or on a click elsewhere.
    private watchAvatarMenu = () => {
        const menu = this.avatarMenu
        if (!menu) return
        const player = this.players[menu.uid]
        if (!player) { this.closeAvatarMenu(); return }
        const bounds = this.app.canvas.getBoundingClientRect()
        const point = player.parent.toGlobal(player.menuAnchor)
        const x = bounds.left + point.x * bounds.width / this.app.screen.width
        const y = bounds.top + point.y * bounds.height / this.app.screen.height
        if (Math.abs(x - menu.x) < 0.5 && Math.abs(y - menu.y) < 0.5) return
        menu.x = x
        menu.y = y
        signal.emit('avatarMenu', { id: menu.id, uid: menu.uid, name: player.username, screenX: x, screenY: y })
    }

    private closeAvatarMenu = () => {
        if (!this.avatarMenu) return
        this.avatarMenu = null
        PIXI.Ticker.shared.remove(this.watchAvatarMenu)
        signal.emit('avatarMenu', null)
    }

    // Who follows this visitor: following them back would make both walk around each other.
    private onFollowNotice = (notice: { uid?: unknown, following?: unknown }) => {
        if (typeof notice?.uid !== 'string') return
        if (notice.following) this.followers.add(notice.uid)
        else this.followers.delete(notice.uid)
    }

    private onFollowStart = ({ uid }: { uid: string }) => {
        this.closeAvatarMenu()
        const target = this.players[uid]
        if (!target || uid === this.uid || this.follow?.uid === uid || this.eventsRemoved || this.reconnecting) return
        if (this.followers.has(uid)) {
            signal.emit('officeNotice', { message: `${target.username} já está te seguindo.`, key: `follow-mutual:${uid}` })
            return
        }
        this.stopFollowing('switched')
        this.follow = {
            uid, name: target.username, phase: 'follow', stairs: null,
            targetTile: { ...target.currentTilePosition }, previousTile: null, goal: null,
            progress: { since: Date.now(), position: { ...this.player.verifiedPosition } },
        }
        server.socket.emit('followStart', { targetUid: uid })
        signal.emit('followState', { name: target.username })
        this.followTimer = setInterval(this.followTick, FOLLOW_TICK_MS)
        this.planFollow()
    }

    private onFollowStopRequest = () => this.stopFollowing('stopped')

    private stopFollowing = (reason: FollowStopReason) => {
        const follow = this.follow
        if (!follow) return
        this.follow = null
        if (this.followTimer) clearInterval(this.followTimer)
        this.followTimer = null
        if (followStopTellsTarget(reason)) server.socket.emit('followStop', { targetUid: follow.uid })
        const message = followStopNotice(reason, follow.name)
        if (message) signal.emit('officeNotice', { message, key: `follow-stop:${follow.uid}:${reason}` })
        signal.emit('followState', { name: null })
    }

    private followPaused = () => this.player.frozen || this.roomTransitioning || this.reconnecting

    // Walks towards a free tile next to the person (or to the stairs they took) with the
    // normal movement, so the server sees ordinary steps. Plans only when needed.
    private planFollow = () => {
        const follow = this.follow
        // Never walk towards someone who is following this visitor.
        if (!follow || this.followPaused() || this.followers.has(follow.uid)) return
        const at = this.player.movingTo ?? this.player.currentTilePosition
        const moving = Boolean(this.player.movingTo)
        const candidates = follow.phase === 'stairs' ? (follow.stairs ? [follow.stairs] : []) : follow.targetTile ? rankFollowTiles({
            target: follow.targetTile, previous: follow.previousTile, self: at,
            tilemap: this.realmData.rooms[this.currentRoomIndex].tilemap, blocked: this.blocked,
            occupied: Object.entries(this.players).filter(([uid]) => uid !== follow.uid).map(([, player]) => player.currentTilePosition),
        }) : []
        if (!shouldReplan({ candidates, lastGoal: follow.goal, moving, at })) return
        this.pendingOfficeObjectId = null
        this.player.setMovementMode('mouse')
        follow.goal = candidates.find(tile => this.player.moveToTile(tile.x, tile.y)) ?? null
    }

    private followTick = () => {
        const follow = this.follow
        if (!follow) return
        if (this.followPaused()) {
            follow.progress = { since: Date.now(), position: { ...this.player.verifiedPosition } }
            return
        }
        this.planFollow()
        const settled = this.followers.has(follow.uid) || (follow.phase === 'follow' && !this.player.movingTo && Boolean(follow.targetTile && isNextTo(this.player.currentTilePosition, follow.targetTile)))
        const { stuck, ...progress } = trackFollowProgress(follow.progress, { now: Date.now(), position: this.player.verifiedPosition, settled })
        follow.progress = progress
        if (stuck) this.stopFollowing('unreachable')
    }

    private onFollowedMoved = (tile: Point) => {
        const follow = this.follow
        if (!follow || follow.phase !== 'follow' || sameTile(follow.targetTile, tile)) return
        follow.previousTile = follow.targetTile
        follow.targetTile = tile
        this.planFollow()
    }

    // Gone from this room: through a passage the follower takes the same one, otherwise they left.
    private onFollowedLeft = () => {
        const follow = this.follow
        if (!follow || follow.phase !== 'follow') return
        const stairs = departureStairs(this.realmData.rooms[this.currentRoomIndex].tilemap, follow.targetTile)
        if (!stairs) { this.stopFollowing('left'); return }
        Object.assign(follow, { phase: 'stairs', stairs, goal: null, progress: { since: Date.now(), position: { ...this.player.verifiedPosition } } })
        this.planFollow()
    }

    // After the stairs, the new room's people are known: find the person again.
    private resumeFollowAfterStairs = () => {
        const follow = this.follow
        if (!follow || follow.phase !== 'stairs') return
        // Not in the new room's list (or the list could not be fetched).
        const target = this.players[follow.uid]
        if (!target) { this.stopFollowing('lost'); return }
        Object.assign(follow, {
            phase: 'follow', stairs: null, targetTile: { ...target.currentTilePosition }, previousTile: null, goal: null,
            progress: { since: Date.now(), position: { ...this.player.verifiedPosition } },
        })
    }

    private destroyPlayers = () => {
        for (const player of Object.values(this.players)) {
            player.destroy()
        }
        this.player.destroy()
    }

    private onPlayerLeftRoom = (uid: string) => {
        this.departures.set(uid, (this.departures.get(uid) ?? 0) + 1)
        if (this.follow?.uid === uid) this.onFollowedLeft()
        if (this.avatarMenu?.uid === uid) this.closeAvatarMenu()
        if (this.players[uid]) {
            this.players[uid].destroy()
            this.layers.object.removeChild(this.players[uid].parent)
            delete this.players[uid]
            this.updateFocus()
        }
    }

    private onPlayerJoinedRoom = (playerData: any) => {
        if (this.roomTransitioning) return
        // Came back before the follower reached the stairs: keep following here.
        const follow = this.follow
        if (follow && follow.uid === playerData.uid && follow.phase === 'stairs') {
            Object.assign(follow, { phase: 'follow', stairs: null, targetTile: { x: playerData.x, y: playerData.y }, previousTile: null, goal: null })
        }
        this.updatePlayer(playerData.uid, playerData)
        signal.emit('officeNotice', { message: `${playerData.username || 'Uma pessoa'} entrou no escritório.`, key: `joined:${playerData.uid}` })
    }

    private onPlayerMoved = (data: any) => {
        if (this.roomTransitioning) return
        if (this.blocked.has(`${data.x}, ${data.y}`)) return
        if (this.follow?.uid === data.uid) this.onFollowedMoved({ x: data.x, y: data.y })

        const player = this.players[data.uid]
        if (player) {
            player.moveToTile(data.x, data.y)
            this.updateFocus()
        } else if (!this.isSpawning(data.uid)) {
            this.scheduleResync()
        }
    }

    private onPlayerTeleported = (data: any) => {
        if (this.follow?.uid === data.uid) this.onFollowedMoved({ x: data.x, y: data.y })
        const player = this.players[data.uid]
        if (player) {
            player.setPosition(data.x, data.y)
        }
    }

    private onPlayerChangedSkin = (data: any) => {
        const player = this.players[data.uid]
        if (player) {
            player.changeSkin(data.skin)
        }
        signal.emit('video-skin', {
            skin: data.skin,
            uid: data.uid,
            name: player?.username,
        })
    }

    private setUpSignalListeners = () => {
        signal.on('requestSkin', this.onRequestSkin)
        signal.on('switchSkin', this.onSwitchSkin)
        signal.on('disableInput', this.onDisableInput)
        signal.on('message', this.onMessage)
        signal.on('getSkinForUid', this.getSkinForUid)
        signal.on('officeRequest', this.onOfficeRequest)
        signal.on('officeResync', this.onOfficeResync)
        signal.on('officePresentationFocus', this.onPresentationFocus)
        signal.on('officeLightPreference', this.onLightPreference)
        signal.on('followStart', this.onFollowStart)
        signal.on('followStop', this.onFollowStopRequest)
        signal.on('avatarMenuDismiss', this.closeAvatarMenu)
    }

    private removeSignalListeners = () => {
        signal.off('requestSkin', this.onRequestSkin)
        signal.off('switchSkin', this.onSwitchSkin)
        signal.off('disableInput', this.onDisableInput)
        signal.off('message', this.onMessage)
        signal.off('getSkinForUid', this.getSkinForUid)
        signal.off('officeRequest', this.onOfficeRequest)
        signal.off('officeResync', this.onOfficeResync)
        signal.off('officePresentationFocus', this.onPresentationFocus)
        signal.off('officeLightPreference', this.onLightPreference)
        signal.off('followStart', this.onFollowStart)
        signal.off('followStop', this.onFollowStopRequest)
        signal.off('avatarMenuDismiss', this.closeAvatarMenu)
    }

    private onPresentationFocus = ({ active }: { active: boolean }) => {
        this.presentationFocused = active
        this.lightingLayer?.setPresentation(active)
    }

    private onLightPreference = ({ objectId, enabled }: { objectId: string, enabled: boolean }) => {
        this.lightingLayer?.setLightEnabled(objectId, enabled)
    }

    private onOfficeRequest = ({ objectId }: { objectId: string }) => {
        this.requestOfficeObject(objectId)
    }

    private onOfficeResync = ({ objectId, position }: { objectId: string, position: Point }) => {
        this.player.setPosition(position.x, position.y)
        this.onLocalPlayerTileChanged(position)
        requestAnimationFrame(() => this.requestOfficeObject(objectId))
    }

    private onRequestSkin = () => {
        signal.emit('skin', this.player.skin)
    }

    private onSwitchSkin = (skin: string) => {
        this.player.changeSkin(skin)
        server.socket.emit('changedSkin', skin)
    }

    private getSkinForUid = (uid: string) => {
        const player = this.players[uid]
        if (!player) {
            // A video from someone this screen has no avatar for: the join was missed.
            if (uid !== this.uid && !this.isSpawning(uid)) this.scheduleResync()
            return
        }
        this.emitVideoProfile(uid)
    }

    private emitVideoProfile = (uid: string) => {
        const player = this.players[uid]
        if (!player) return
        signal.emit('video-skin', {
            skin: player.skin,
            uid: uid,
            name: player.username,
        })
    }

    private onDisableInput = (disable: boolean) => {
        this.disableInput = disable
        this.releaseMovement()
    }

    private onKicked = (message: string) => {
        this.kicked = true
        this.stopFollowing('silent')
        this.removeEvents()
        void videoChat.leaveChannel()
        signal.emit('showKickedModal', message)
    }

    // A dropped connection keeps the office open while Socket.IO reconnects; the
    // video call stays up so a short network blip does not end the conversation.
    private onDisconnect = (reason: string) => {
        if (this.kicked || reason === 'io client disconnect') return
        if (!server.socket.active) return this.endSession()
        if (this.reconnecting) return
        this.reconnecting = true
        // The server tells the followed person once this connection is gone.
        this.stopFollowing('silent')
        this.closeAvatarMenu()
        this.releaseMovement()
        this.player.setFrozen(true)
        signal.emit('officeNotice', { message: 'A conexão caiu. Reconectando ao escritório...', key: 'office-reconnecting' })
    }

    private onRejoined = async (joined?: { roomIndex: number, x: number, y: number }) => {
        if (!this.reconnecting) return
        if (!joined) {
            // Older servers do not report the position; keep the local one.
            await this.syncOtherPlayers()
        } else if (joined.roomIndex !== this.currentRoomIndex) {
            this.teleportLocation = { x: joined.x, y: joined.y }
            await this.loadRoom(joined.roomIndex)
        } else {
            this.player.setSeatedVisual(null)
            this.player.setPosition(joined.x, joined.y)
            this.moveCameraToPlayer()
            await this.syncOtherPlayers()
        }
        if (this.eventsRemoved) return
        this.reconnecting = false
        this.requestSnapshots()
        this.player.setFrozen(false)
        signal.emit('officeNotice', { message: 'Conexão restabelecida.', key: 'office-reconnected' })
    }

    private onRejoinFailed = () => {
        if (this.reconnecting) this.endSession()
    }

    private endSession = () => {
        this.removeEvents()
        void videoChat.leaveChannel()
        signal.emit('showDisconnectModal')
    }

    private onMessage = (message: string) => {
        this.player.setMessage(message)
        server.socket.emit('sendMessage', message)
    }

    private onReceiveMessage = (data: any) => {
        const player = this.players[data.uid]
        if (player) {
            player.setMessage(data.message)
        }
    }

    private displayInitialChatMessage = async () => {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        let channelName = ''

        signal.emit('newRoomChat', {
            name: this.realmData.rooms[this.currentRoomIndex].name,
            channelId: channelName
        })
    }

    private onProximityUpdate = (data: any) => {
        if (this.roomTransitioning) return
        this.proximityId = data.proximityId
        this.player.checkIfShouldJoinChannel(this.player.verifiedPosition)
    }

    // Pushed by the server as soon as this visitor's conversation changes, ahead of the join.
    private onConversationToken = (data: { channel?: unknown, token?: unknown }) => {
        if (typeof data?.channel === 'string' && typeof data.token === 'string') videoChat.rememberToken(data.channel, data.token)
    }

    private onAvatarState = (snapshot: AvatarSnapshot) => {
        if (this.roomTransitioning) return
        if (!snapshot || typeof snapshot !== 'object') return
        const previous = this.avatarSnapshot
        this.avatarSnapshot = snapshot
        this.player.applyAvatarState(snapshot[this.uid])
        for (const [uid, player] of Object.entries(this.players)) player.applyAvatarState(snapshot[uid])
        for (const [uid, state] of Object.entries(snapshot)) {
            if (state.action === 'pet' && state.objectId && state.expiresAt !== previous[uid]?.expiresAt) this.interactionLayer?.playPetEffect(state.objectId)
        }
    }

    private onMeetingState = (snapshot: MeetingSnapshot | null) => setMeeting(snapshot ?? null)

    private onMeetingForce = (force: { mic?: false, camera?: false }) => signal.emit('meetingForce', force)

    private onOfficeEffect = (event: { objectId: string, effect: 'coffee' | 'water' | 'snack', name: string }) => {
        this.interactionLayer?.playEffect(event.objectId, event.effect)
        signal.emit('officeFeedback', {
            message: `${event.name} pegou ${event.effect === 'coffee' ? 'café' : event.effect === 'water' ? 'água' : 'um snack'}.`,
        })
    }

    private setUpSocketEvents = () => {
        server.socket.on('avatarState', this.onAvatarState)
        server.socket.on('officeStateChanged', this.onOfficeStateChanged)
        server.socket.on('officeEffect', this.onOfficeEffect)
        server.socket.on('meetingState', this.onMeetingState)
        server.socket.on('meetingForce', this.onMeetingForce)
        server.socket.on('playerLeftRoom', this.onPlayerLeftRoom)
        server.socket.on('playerJoinedRoom', this.onPlayerJoinedRoom)
        server.socket.on('playerMoved', this.onPlayerMoved)
        server.socket.on('playerTeleported', this.onPlayerTeleported)
        server.socket.on('playerChangedSkin', this.onPlayerChangedSkin)
        server.socket.on('receiveMessage', this.onReceiveMessage)
        server.socket.on('disconnect', this.onDisconnect)
        server.socket.on('joinedRealm', this.onRejoined)
        server.socket.on('failedToJoinRoom', this.onRejoinFailed)
        server.socket.io.on('reconnect_failed', this.onRejoinFailed)
        server.socket.on('kicked', this.onKicked)
        server.socket.on('proximityUpdate', this.onProximityUpdate)
        server.socket.on('conversationToken', this.onConversationToken)
        server.socket.on('followNotice', this.onFollowNotice)
    }

    private removeSocketEvents = () => {
        server.socket.off('avatarState', this.onAvatarState)
        server.socket.off('officeStateChanged', this.onOfficeStateChanged)
        server.socket.off('officeEffect', this.onOfficeEffect)
        server.socket.off('meetingState', this.onMeetingState)
        server.socket.off('meetingForce', this.onMeetingForce)
        server.socket.off('playerLeftRoom', this.onPlayerLeftRoom)
        server.socket.off('playerJoinedRoom', this.onPlayerJoinedRoom)
        server.socket.off('playerMoved', this.onPlayerMoved)
        server.socket.off('playerTeleported', this.onPlayerTeleported)
        server.socket.off('playerChangedSkin', this.onPlayerChangedSkin)
        server.socket.off('receiveMessage', this.onReceiveMessage)
        server.socket.off('disconnect', this.onDisconnect)
        server.socket.off('joinedRealm', this.onRejoined)
        server.socket.off('failedToJoinRoom', this.onRejoinFailed)
        server.socket.io?.off('reconnect_failed', this.onRejoinFailed)
        server.socket.off('kicked', this.onKicked)
        server.socket.off('proximityUpdate', this.onProximityUpdate)
        server.socket.off('conversationToken', this.onConversationToken)
        server.socket.off('followNotice', this.onFollowNotice)
    }

    private removeEvents = () => {
        if (this.eventsRemoved) return
        this.eventsRemoved = true
        this.stopFollowing('silent')
        this.closeAvatarMenu()
        if (this.initialized) {
            this.cancelCameraDrag()
            this.app.canvas.removeEventListener('contextmenu', this.preventCanvasContextMenu)
            this.app.canvas.removeEventListener('pointerdown', this.startCameraDrag)
            this.app.canvas.removeEventListener('pointermove', this.moveCameraDrag)
            this.app.canvas.removeEventListener('pointerup', this.endCameraDrag)
            this.app.canvas.removeEventListener('pointercancel', this.endCameraDrag)
            this.app.canvas.removeEventListener('wheel', this.zoomCamera)
            this.app.renderer.off('resize', this.resizeEvent)
            window.removeEventListener('blur', this.cancelCameraDrag)
            window.removeEventListener('blur', this.releaseMovement)
        }
        this.gamepad?.destroy()
        this.gamepad = null
        this.lightingLayer?.destroy()
        this.lightingLayer = null
        this.interactionLayer?.destroy()
        this.interactionLayer = null
        this.annexLayer?.destroy()
        this.annexLayer = null
        this.fadeAnimation?.kill()
        this.fadeAnimation = null
        PIXI.Ticker.shared.remove(this.fadeOutTicker)
        if (this.resyncTimer) clearTimeout(this.resyncTimer)
        this.resyncTimer = null
        if (this.resyncInterval) clearInterval(this.resyncInterval)
        this.resyncInterval = null
        if (this.diagnosticsTimer) clearInterval(this.diagnosticsTimer)
        this.diagnosticsTimer = null
        this.diagnostics?.remove()
        this.diagnostics = null
        document.removeEventListener('visibilitychange', this.onVisibilityChange)
        this.removeSocketEvents()
        setMeeting(null)
        this.destroyPlayers()
        server.disconnect()

        this.removeSignalListeners()
        document.removeEventListener('keydown', this.keydown)
        document.removeEventListener('keyup', this.keyup)
    }

    public destroy() {
        this.removeEvents()
        super.destroy()
    }
}
