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
import { GamepadController, type GamepadInput } from './office/GamepadController'
import type { AvatarSnapshot } from './Player/avatar-actions'
import { zoomAtCursor } from './office/camera-zoom.mjs'

export class PlayApp extends App {
    private scale: number = 1.5
    public player: Player
    public blocked: Set<TilePoint> = new Set()
    public keysDown: string[] = []
    private teleportLocation: Point | null = null
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
    private cameraDrag: { pointerId: number, startX: number, startY: number, pivotX: number, pivotY: number } | null = null
    private cameraManuallyPanned = false
    private lightingLayer: LightingLayer | null = null
    private presentationFocused = false
    private gamepad: GamepadController | null = null
    private gamepadDirection: string | null = null
    private keyboardKeys = new Set<string>()
    private gamepadRunning = false
    private keyboardRunning = false
    private avatarSnapshot: AvatarSnapshot = {}
    private eventsRemoved = false
    private roomTransitioning = false

    constructor(uid: string, realmId: string, realmData: RealmData, username: string, skin: string = defaultSkin) {
        super(realmData)
        if (realmData.rooms[realmData.spawnpoint.roomIndex]?.backgroundImage) {
            this.scale = 1
        }
        this.uid = uid
        this.realmId = realmId
        this.player = new Player(skin, this, username, true)
    }

    override async loadRoom(index: number) {
        this.releaseMovement()
        for (const player of Object.values(this.players)) player.destroy()
        this.currentRoomIndex = index
        this.players = {}
        this.avatarSnapshot = {}
        this.officeSnapshot = { occupancy: {}, games: {} }
        await super.loadRoom(index)
        this.setUpLighting()
        this.setUpRoomInteractions()
        this.setUpBlockedTiles()
        this.setUpFadeTiles()
        await this.spawnLocalPlayer()
        this.player.applyAvatarState()
        this.player.setSeatedVisual(null)
        if (!this.roomTransitioning) await this.syncOtherPlayers()
        signal.emit('officeRoomChanged', { roomIndex: index, objects: this.realmData.rooms[index].interactions ?? [] })
        this.displayInitialChatMessage()
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
            (id) => this.requestOfficeObject(id),
            (object) => signal.emit('officeHover', { objectId: object?.id ?? null }),
        )
        this.interactionLayer.setOccupancy(this.officeSnapshot.occupancy)
        this.interactionLayer.setGames(this.officeSnapshot.games)
        this.app.stage.addChildAt(this.interactionLayer.container, this.app.stage.getChildIndex(this.lightingLayer!.container) + 1)
    }

    public requestOfficeObject = (id: string): boolean => {
        if (this.disableInput || this.player.frozen) return false
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
        const objects = this.realmData.rooms[this.currentRoomIndex].interactions ?? []
        const nearby = nearestObject(objects, position.x, position.y, 2)
        signal.emit('officeNearby', { objectId: nearby?.id ?? null })
        signal.emit('officePosition', { ...position, roomIndex: this.currentRoomIndex })
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
        const {data, error} = await server.getPlayersInRoom(this.currentRoomIndex)
        if (error) {
            console.error('Failed to get player positions in room:', error)
            return
        }

        await Promise.all(data.players.filter((player: { uid: string }) => player.uid !== this.uid).map((player: any) => this.updatePlayer(player.uid, player)))

        this.sortObjectsByY()
    }

    private async updatePlayer(uid: string, player: any) {
        if (uid in this.players) {
            if (this.players[uid].skin !== player.skin) {
                await this.players[uid].changeSkin(player.skin)
            }
            if (this.players[uid].currentTilePosition.x !== player.x || this.players[uid].currentTilePosition.y !== player.y) {
                this.players[uid].setPosition(player.x, player.y)
            }
        } else {
            await this.spawnPlayer(player.uid, player.skin, player.username, player.x, player.y)
        }
    }

    private async spawnPlayer(uid: string, skin: string, username: string, x: number, y: number) {
        const otherPlayer = new Player(skin, this, username)
        await otherPlayer.init()
        otherPlayer.setPosition(x, y)
        this.layers.object.addChild(otherPlayer.parent)
        this.players[uid] = otherPlayer
        otherPlayer.applyAvatarState(this.avatarSnapshot[uid])
        this.emitVideoProfile(uid)
        const occupiedId = Object.keys(this.officeSnapshot.occupancy).find(id => this.officeSnapshot.occupancy[id].uid === uid)
        const object = this.realmData.rooms[this.currentRoomIndex].interactions?.find(item => item.id === occupiedId)
        otherPlayer.setSeatedVisual(object?.seatVisual ?? null)
        this.sortObjectsByY()
    }

    public async init() {
        await super.init()
        await this.loadAssets()
        await this.loadRoom(this.realmData.spawnpoint.roomIndex)
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
        server.socket.emit('avatarGetSnapshot', (response: { ok: boolean, snapshot?: AvatarSnapshot }) => {
            if (response?.ok && response.snapshot) this.onAvatarState(response.snapshot)
        })
        server.socket.emit('officeGetSnapshot', (response: { ok: boolean, snapshot?: OfficeSnapshot }) => {
            if (response?.ok && response.snapshot) this.onOfficeStateChanged(response.snapshot)
        })

        this.fadeOut()
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
            if (this.player.frozen || this.disableInput) return  

            const clickPosition = e.getLocalPosition(this.app.stage)
            const { x, y } = this.convertScreenToTileCoordinates(clickPosition.x, clickPosition.y)
            const room = this.realmData.rooms[this.currentRoomIndex]
            if (room.backgroundImage && !isWithinMap(x, y, room.backgroundImage.width / 32, room.backgroundImage.height / 32)) return
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

    private destroyPlayers = () => {
        for (const player of Object.values(this.players)) {
            player.destroy()
        }
        this.player.destroy()
    }

    private onPlayerLeftRoom = (uid: string) => {
        if (this.players[uid]) {
            this.players[uid].destroy()
            this.layers.object.removeChild(this.players[uid].parent)
            delete this.players[uid]
        }
    }

    private onPlayerJoinedRoom = (playerData: any) => {
        if (this.roomTransitioning) return
        this.updatePlayer(playerData.uid, playerData)
        signal.emit('officeNotice', { message: `${playerData.username || 'Uma pessoa'} entrou no escritório.`, key: `joined:${playerData.uid}` })
    }

    private onPlayerMoved = (data: any) => {
        if (this.roomTransitioning) return
        if (this.blocked.has(`${data.x}, ${data.y}`)) return

        const player = this.players[data.uid]
        if (player) {
            player.moveToTile(data.x, data.y)
        }
    }

    private onPlayerTeleported = (data: any) => {
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
        if (!player) return
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
        this.removeEvents()
        signal.emit('showKickedModal', message)
    }

    private onDisconnect = () => {
        this.removeEvents()
        if (!this.kicked) {
            signal.emit('showDisconnectModal')
        }
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
        server.socket.on('playerLeftRoom', this.onPlayerLeftRoom)
        server.socket.on('playerJoinedRoom', this.onPlayerJoinedRoom)
        server.socket.on('playerMoved', this.onPlayerMoved)
        server.socket.on('playerTeleported', this.onPlayerTeleported)
        server.socket.on('playerChangedSkin', this.onPlayerChangedSkin)
        server.socket.on('receiveMessage', this.onReceiveMessage)
        server.socket.on('disconnect', this.onDisconnect)
        server.socket.on('kicked', this.onKicked)
        server.socket.on('proximityUpdate', this.onProximityUpdate)
    }

    private removeSocketEvents = () => {
        server.socket.off('avatarState', this.onAvatarState)
        server.socket.off('officeStateChanged', this.onOfficeStateChanged)
        server.socket.off('officeEffect', this.onOfficeEffect)
        server.socket.off('playerLeftRoom', this.onPlayerLeftRoom)
        server.socket.off('playerJoinedRoom', this.onPlayerJoinedRoom)
        server.socket.off('playerMoved', this.onPlayerMoved)
        server.socket.off('playerTeleported', this.onPlayerTeleported)
        server.socket.off('playerChangedSkin', this.onPlayerChangedSkin)
        server.socket.off('receiveMessage', this.onReceiveMessage)
        server.socket.off('disconnect', this.onDisconnect)
        server.socket.off('kicked', this.onKicked)
        server.socket.off('proximityUpdate', this.onProximityUpdate)
    }

    private removeEvents = () => {
        if (this.eventsRemoved) return
        this.eventsRemoved = true
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
        this.fadeAnimation?.kill()
        this.fadeAnimation = null
        PIXI.Ticker.shared.remove(this.fadeOutTicker)
        this.removeSocketEvents()
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
