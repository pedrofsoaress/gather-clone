import * as PIXI from 'pixi.js'
import playerSpriteSheetData from './PlayerSpriteSheetData'
import { Point, Coordinate, AnimationState, Direction } from '../types'
import { PlayApp } from '../PlayApp'
import { findWalkablePath } from '../office/walkable-path'
import { MovementAuthority } from './movement-authority'
import { server } from '../../backend/server'
import { defaultSkin, skins } from './skins'
import signal from '@/utils/signal'
import { videoChat } from '@/utils/video-chat/video-chat'
import { agoraUidForProfile } from '@/utils/video-chat/agoraIdentity'
import { gsap } from 'gsap'
import { actionFrames, actionPose, movementSpeed, type AvatarActionState } from './avatar-actions'
const AVATAR_SCALE = 1.5
function formatText(message: string, maxLength: number): string {
    message = message.trim()
    const words = message.split(' ')
    const lines: string[] = []
    let currentLine = ''

    for (const word of words) {
        if (word.length > maxLength) {
            if (currentLine) {
                lines.push(currentLine.trim());
                currentLine = ''
            }
            for (let i = 0; i < word.length; i += maxLength) {
                lines.push(word.substring(i, i + maxLength))
            }
        } else if (currentLine.length + word.length + 1 > maxLength) {
            lines.push(currentLine.trim())
            currentLine = word + ' '
        } else {
            currentLine += word + ' '
        }
    }

    if (currentLine.trim()) {
        lines.push(currentLine.trim())
    }

    const text = lines.join('\n')

    return text
}


export class Player {

    public skin: string = defaultSkin
    public username: string = ''
    public parent: PIXI.Container = new PIXI.Container()
    private textMessage: PIXI.Text = new PIXI.Text({})
    private usernameText: PIXI.Text | null = null
    private textTimeout: NodeJS.Timeout | null = null

    private animationState: AnimationState = 'idle_down'
    private direction: Direction = 'down'
    private animationSpeed: number = 0.1
    private movementSpeed: number = movementSpeed(false)
    public currentTilePosition: Point = { x: 0, y: 0 }
    private isLocal: boolean = false
    private playApp: PlayApp
    private targetPosition: { x: number, y: number } | null = null
    private path: Coordinate[] = []
    private pathIndex: number = 0
    private sheet: any = null
    private movementMode: 'keyboard' | 'mouse' = 'mouse'
    public frozen: boolean = false
    private initialized: boolean = false
    private strikes: number = 0

    private currentChannel: string = 'local'
    private seatTween: gsap.core.Tween | null = null
    private directionBeforeSeat: Direction | null = null
    private currentSeatKey: string | null = null
    private seatOffset: Point = { x: 0, y: 0 }
    private activeSeatVisual: { x: number, y: number, facing?: Direction } | null = null
    private seatedTextures: Partial<Record<Direction, PIXI.Texture>> = {}
    private pendingSeatVisual: { x: number, y: number, facing?: Direction } | null = null
    private avatarAction: AvatarActionState = { action: 'idle', running: false, expiresAt: null }
    private actionStartedAt = 0
    private actionRemainingMs = 0
    private runRequest = 0
    private readonly movementAuthority = new MovementAuthority()
    public get verifiedPosition(): Point { return this.movementAuthority.position }

    constructor(skin: string, playApp: PlayApp, username: string, isLocal: boolean = false) {
        this.skin = skin
        this.playApp = playApp
        this.username = username
        this.isLocal = isLocal
    }

    private async loadAnimations() {
        const src = `/sprites/characters/Character_${this.skin}.png`
        await PIXI.Assets.load(src)

        const spriteSheetData = JSON.parse(JSON.stringify(playerSpriteSheetData))
        spriteSheetData.meta.image = src

        this.sheet = new PIXI.Spritesheet(PIXI.Texture.from(src), spriteSheetData)
        await this.sheet.parse()

        const animatedSprite = new PIXI.AnimatedSprite(this.sheet.animations['idle_down'])
        animatedSprite.scale.set(AVATAR_SCALE)
        animatedSprite.animationSpeed = this.animationSpeed
        animatedSprite.play()

        if (!this.initialized) {
            this.parent.addChild(animatedSprite)
        }
    }

    public changeSkin = async (skin: string) => {
        if (!skins.includes(skin)) return

        const previousSeatedTextures = Object.values(this.seatedTextures)
        this.seatedTextures = {}
        this.skin = skin
        await this.loadAnimations()
        // refresh animations
        this.changeAnimationState(this.animationState, true)
        if (this.activeSeatVisual) {
            const sprite = this.parent.children[0] as PIXI.AnimatedSprite
            sprite.textures = [this.getSeatedTexture(this.direction)]
            sprite.gotoAndStop(0)
        }
        previousSeatedTextures.forEach(texture => texture.destroy())
        if (this.avatarAction.action !== 'idle') this.startActionVisual()
    }

    private addUsername() {
        const text = new PIXI.Text({
            text: this.username,
            style: {
                fontFamily: 'silkscreen',
                fontSize: 128,
                fill: 0xFFFFFF,
            }
        })
        text.anchor.set(0.5)
        text.scale.set(0.07)
        text.y = 8
        this.parent.addChild(text)
        this.usernameText = text
    }

    public setMessage(message: string) {
        if (this.textTimeout) {
            clearTimeout(this.textTimeout)
        }

        if (this.textMessage) {
            this.parent.removeChild(this.textMessage)
        }

        message = formatText(message, 40)

        const text = new PIXI.Text({
            text: message,
            style: {
                fontFamily: 'silkscreen',
                fontSize: 128,
                fill: 0xFFFFFF,
                align: 'center'
            }
        })
        text.anchor.x = 0.5
        text.anchor.y = 0
        text.scale.set(0.07)
        text.x = this.seatOffset.x
        text.y = this.seatOffset.y - text.height - 42
        this.parent.addChild(text)
        this.textMessage = text

        signal.emit('newMessage', {
            content: message,
            username: this.username
        })

        this.textTimeout = setTimeout(() => {
            if (this.textMessage) {
                this.parent.removeChild(this.textMessage)
            }
        }, 10000)
    }

    public async init() {
        if (this.initialized) return
        await this.loadAnimations()
        this.addUsername()
        this.initialized = true
    }

    public setPosition(x: number, y: number) {
        PIXI.Ticker.shared.remove(this.move)
        this.targetPosition = null
        this.path = []
        this.pendingSeatVisual = null
        this.movementAuthority.reset({ x, y })
        const pos = this.convertTilePosToPlayerPos(x, y)
        this.parent.x = pos.x
        this.parent.y = pos.y
        this.currentTilePosition = { x, y }
    }

    public isAtTile(x: number, y: number): boolean {
        const position = this.convertTilePosToPlayerPos(x, y)
        return this.targetPosition === null &&
            Math.abs(this.parent.x - position.x) < 1 &&
            Math.abs(this.parent.y - position.y) < 1
    }

    private convertTilePosToPlayerPos = (x: number, y: number) => {
        return {
            x: (x * 32) + 16,
            y: (y * 32) + 24
        }
    }

    private convertPlayerPosToTilePos = (x: number, y: number) => {
        return {
            x: Math.floor(x / 32),
            y: Math.floor(y / 32)
        }
    }

    public moveToTile = (x: number, y: number): boolean => {
        if (this.strikes > 25) return false

        const start: Coordinate = [this.currentTilePosition.x, this.currentTilePosition.y]
        const end: Coordinate = [x, y]

        const path: Coordinate[] | null = findWalkablePath(start, end, this.playApp.realmData.rooms[this.playApp.currentRoomIndex].tilemap, this.playApp.blocked)
        if (!path || path.length === 0) {
            if (!path && !this.isLocal) {
                this.strikes++
            }
            return false
        }

        this.stopActionVisual()
        this.setSeatedVisual(null)

        PIXI.Ticker.shared.remove(this.move)

        this.path = path
        this.pathIndex = 0
        this.targetPosition = this.convertTilePosToPlayerPos(this.path[this.pathIndex][0], this.path[this.pathIndex][1])
        PIXI.Ticker.shared.add(this.move)

        return true
    }

    private move = ({ deltaTime }: { deltaTime: number }) => {
        if (!this.targetPosition) return

        const arrivingTile = { x: this.path[this.pathIndex][0], y: this.path[this.pathIndex][1] }
        if (this.isLocal && this.playApp.hasTeleport(arrivingTile.x, arrivingTile.y) && this.movementMode === 'keyboard') {
            this.setFrozen(true)
        }

        const speed = this.movementSpeed * deltaTime

        const dx = this.targetPosition.x - this.parent.x
        const dy = this.targetPosition.y - this.parent.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance < speed) {
            this.parent.x = this.targetPosition.x
            this.parent.y = this.targetPosition.y
            this.currentTilePosition = arrivingTile

            if (this.isLocal) {
                this.playApp.onLocalPlayerTileChanged(this.currentTilePosition)
                const epoch = this.movementAuthority.begin()
                const room = this.playApp.currentRoomIndex
                server.socket.timeout(8000).emit('officeStep', this.currentTilePosition, (timeout: Error | null, result: { ok: boolean, error?: string, roomIndex?: number, verifiedPosition?: Point }) => {
                    if (!this.initialized || room !== this.playApp.currentRoomIndex) return
                    const confirmation = this.movementAuthority.settle(epoch, !timeout && result?.ok === true, result?.verifiedPosition)
                    if (!confirmation) return
                    if (confirmation.recovering) {
                        PIXI.Ticker.shared.remove(this.move)
                        this.targetPosition = null
                        this.playApp.keysDown = []
                        this.setFrozen(true)
                        if (confirmation.settled) {
                            this.setPosition(this.verifiedPosition.x, this.verifiedPosition.y)
                            this.setFrozen(false)
                            this.playApp.onLocalPlayerTileChanged(this.currentTilePosition)
                            signal.emit('officeFeedback', { message: result?.error ?? 'Posição ajustada. Tente caminhar novamente.' })
                        }
                    }
                    this.checkIfShouldJoinChannel(this.verifiedPosition)
                })
            }

            this.pathIndex++
            if (this.pathIndex < this.path.length) {
                this.targetPosition = this.convertTilePosToPlayerPos(this.path[this.pathIndex][0], this.path[this.pathIndex][1])
            } else {
                const movementInput = this.getMovementInput()
                const newTilePosition = { x: this.currentTilePosition.x + movementInput.x, y: this.currentTilePosition.y + movementInput.y }

                // Teleport
                const teleported = this.teleportIfOnTeleporter('keyboard')
                if (teleported) {
                    this.stop()
                    return
                }

                if ((movementInput.x !== 0 || movementInput.y !== 0) && !this.playApp.blocked.has(`${newTilePosition.x}, ${newTilePosition.y}`)) {
                    if (!this.moveToTile(newTilePosition.x, newTilePosition.y)) this.stop()
                } else {
                    this.stop()

                    // Teleport
                    const teleported = this.teleportIfOnTeleporter('mouse')
                    if (teleported) return
                }
            }
        } else {
            const angle = Math.atan2(dy, dx)
            this.parent.x += Math.cos(angle) * speed
            this.parent.y += Math.sin(angle) * speed

            // set direction
            if (Math.abs(dx) > Math.abs(dy)) {
                if (dx > 0) {
                    this.direction = 'right'
                } else {
                    this.direction = 'left'
                }
            } else {
                if (dy > 0) {
                    this.direction = 'down'
                } else {
                    this.direction = 'up'
                }
            }

            this.changeAnimationState(`walk_${this.direction}` as AnimationState)
        }

        this.playApp.sortObjectsByY()

        if (this.isLocal) {
            this.playApp.moveCameraToPlayer()
        }
    }

    public checkIfShouldJoinChannel = (newTilePosition: Point) => {
        if (!this.isLocal) return

        const tile = this.playApp.realmData.rooms[this.playApp.currentRoomIndex].tilemap[`${newTilePosition.x}, ${newTilePosition.y}`]
        if (tile && tile.privateAreaId) {
            if (tile.privateAreaId !== this.currentChannel) {
                this.currentChannel = tile.privateAreaId
                videoChat.joinChannel(tile.privateAreaId, agoraUidForProfile(this.playApp.uid, this.username), this.playApp.realmId, this.playApp.currentRoomIndex)
                this.playApp.fadeInTiles(tile.privateAreaId)
            }
        } else {
            if (this.playApp.proximityId) {
                if (this.playApp.proximityId !== this.currentChannel) {
                    this.currentChannel = this.playApp.proximityId
                    videoChat.joinChannel(this.playApp.proximityId, agoraUidForProfile(this.playApp.uid, this.username), this.playApp.realmId, this.playApp.currentRoomIndex)
                    this.playApp.fadeOutTiles()
                }
            } else if (this.currentChannel !== 'local') {
                this.currentChannel = 'local'
                videoChat.leaveChannel()
                this.playApp.fadeOutTiles()
            }
        }
    }

    public resetConversation = () => {
        this.currentChannel = 'local'
        this.playApp.proximityId = null
        void videoChat.leaveChannel()
    }

    private stop = () => {
        PIXI.Ticker.shared.remove(this.move)
        this.targetPosition = null

        if (this.isLocal) {
            this.changeAnimationState(`idle_${this.direction}` as AnimationState)
            this.playApp.onLocalPlayerStopped()
        } else {
            // if player doesnt move for x secs, do idle animation
            setTimeout(() => {
                if (!this.targetPosition) {
                    this.changeAnimationState(`idle_${this.direction}` as AnimationState)
                }
            }, 100)
        }
        if (this.pendingSeatVisual) {
            const visual = this.pendingSeatVisual
            this.pendingSeatVisual = null
            this.setSeatedVisual(visual)
        }
    }

    private teleportIfOnTeleporter = (movementMode: 'keyboard' | 'mouse') => {
        if (this.isLocal && this.movementMode === movementMode) {
            const teleported = this.playApp.teleportIfOnTeleportSquare(this.currentTilePosition.x, this.currentTilePosition.y)
            return teleported
        }
        return false
    }

    public changeAnimationState = (state: AnimationState, force: boolean = false) => {
        if (this.animationState === state && !force) return

        this.animationState = state
        const animatedSprite = this.parent.children[0] as PIXI.AnimatedSprite
        animatedSprite.textures = this.sheet.animations[state]
        animatedSprite.animationSpeed = this.animationSpeed * (this.avatarAction.running && state.startsWith('walk_') ? 1.65 : 1)
        animatedSprite.play()
    }

    public applyAvatarState = (state?: AvatarActionState) => {
        const next: AvatarActionState = state ?? { action: 'idle', running: false, expiresAt: null }
        const repeated = next.action === this.avatarAction.action && next.expiresAt === this.avatarAction.expiresAt && next.objectId === this.avatarAction.objectId
        this.avatarAction = { ...next }
        this.movementSpeed = movementSpeed(next.running)
        if (!this.initialized) return
        const sprite = this.parent.children[0] as PIXI.AnimatedSprite
        sprite.animationSpeed = this.animationSpeed * (next.running ? 1.65 : 1)
        if (repeated) return
        if (next.action === 'idle' || this.activeSeatVisual || this.targetPosition) {
            this.stopActionVisual()
            return
        }
        this.actionRemainingMs = Math.max(0, Math.min(next.action === 'dance' ? 10000 : 2500, (next.expiresAt ?? Date.now()) - Date.now()))
        this.startActionVisual()
    }

    private startActionVisual = () => {
        if (!this.initialized || this.activeSeatVisual) return
        if (this.avatarAction.action === 'pet') {
            const object = this.playApp.realmData.rooms[this.playApp.currentRoomIndex].interactions?.find(item => item.id === this.avatarAction.objectId)
            if (object) {
                const dx = object.bounds.x + object.bounds.width / 2 - this.currentTilePosition.x
                const dy = object.bounds.y + object.bounds.height / 2 - this.currentTilePosition.y
                this.direction = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up'
            }
        }
        const sprite = this.parent.children[0] as PIXI.AnimatedSprite
        const frames = actionFrames<PIXI.Texture>(this.sheet.animations, this.avatarAction.action, this.direction)
        if (frames.length) { sprite.textures = frames; sprite.animationSpeed = this.avatarAction.action === 'dance' ? 0.14 : 0.06; sprite.play() }
        this.actionStartedAt = performance.now()
        PIXI.Ticker.shared.remove(this.animateAction)
        PIXI.Ticker.shared.add(this.animateAction)
    }

    private animateAction = () => {
        const elapsed = performance.now() - this.actionStartedAt
        if (this.activeSeatVisual || this.targetPosition || elapsed >= this.actionRemainingMs) { this.stopActionVisual(); return }
        const sprite = this.parent.children[0] as PIXI.AnimatedSprite
        const pose = actionPose(this.avatarAction.action, elapsed)
        sprite.position.set(pose.x, pose.y)
        sprite.rotation = pose.rotation
        sprite.scale.set(AVATAR_SCALE, AVATAR_SCALE * pose.scaleY)
    }

    private stopActionVisual = () => {
        PIXI.Ticker.shared.remove(this.animateAction)
        this.avatarAction = { action: 'idle', running: this.avatarAction.running, expiresAt: null }
        if (!this.initialized || this.activeSeatVisual) return
        const sprite = this.parent.children[0] as PIXI.AnimatedSprite
        sprite.position.set(0, 0)
        sprite.rotation = 0
        sprite.scale.set(AVATAR_SCALE)
        if (!this.targetPosition) this.changeAnimationState(`idle_${this.direction}` as AnimationState, true)
    }

    public requestDance = () => {
        if (!this.isLocal || this.frozen || this.targetPosition) return
        const action = this.avatarAction.action === 'dance' ? 'idle' : 'dance'
        server.socket.timeout(8000).emit('avatarAction', { action }, (error: Error | null, result: { ok: boolean, state?: AvatarActionState, error?: string }) => {
            if (error || !result?.ok) { signal.emit('officeFeedback', { message: result?.error ?? 'Não foi possível dançar agora.' }); return }
            this.applyAvatarState(result.state)
        })
    }

    public requestRunning = (running: boolean) => {
        if (!this.isLocal || (running && this.frozen)) return
        const request = ++this.runRequest
        // Releasing Shift slows down immediately; speeding up requires acknowledgement.
        if (!running) this.applyAvatarState({ ...this.avatarAction, running: false })
        server.socket.timeout(8000).emit('avatarRun', { running }, (error: Error | null, result: { ok: boolean, state?: AvatarActionState, error?: string }) => {
            if (request !== this.runRequest) return
            if (error || !result?.ok) { if (running) signal.emit('officeFeedback', { message: result?.error ?? 'Não foi possível correr agora.' }); return }
            this.applyAvatarState(result.state)
        })
    }

    public setSeatedVisual = (visual: { x: number, y: number, facing?: Direction } | null) => {
        if (!this.initialized) return
        this.pendingSeatVisual = visual && this.targetPosition ? visual : null
        if (this.pendingSeatVisual) return
        const seatKey = visual ? `${visual.x},${visual.y},${visual.facing ?? ''},${this.currentTilePosition.x},${this.currentTilePosition.y}` : null
        if (seatKey === this.currentSeatKey) return
        if (visual) {
            this.stopActionVisual()
            this.avatarAction.running = false
            this.movementSpeed = movementSpeed(false)
        }
        this.currentSeatKey = seatKey
        const sprite = this.parent.children[0] as PIXI.AnimatedSprite
        this.seatTween?.kill()
        this.seatTween = null
        if (!visual) {
            this.activeSeatVisual = null
            sprite.position.set(0, 0)
            sprite.anchor.set(0.5, 1)
            sprite.scale.set(AVATAR_SCALE)
            this.seatOffset = { x: 0, y: 0 }
            this.usernameText?.position.set(0, 8)
            this.textMessage.position.set(0, -this.textMessage.height - 42)
            if (this.directionBeforeSeat) {
                this.direction = this.directionBeforeSeat
                this.directionBeforeSeat = null
            }
            this.changeAnimationState(`idle_${this.direction}` as AnimationState, true)
            return
        }
        this.activeSeatVisual = visual
        const seatPosition = this.convertTilePosToPlayerPos(visual.x, visual.y)
        const x = seatPosition.x - this.parent.x
        const y = seatPosition.y - this.parent.y
        this.seatOffset = { x, y }
        if (!this.directionBeforeSeat) this.directionBeforeSeat = this.direction
        this.direction = visual.facing ?? this.direction
        this.changeAnimationState(`idle_${this.direction}` as AnimationState, true)
        this.seatTween = gsap.to(sprite.position, {
            x, y, duration: 0.22, ease: 'power2.out',
            onComplete: () => {
                sprite.textures = [this.getSeatedTexture(this.direction)]
                sprite.gotoAndStop(0)
                sprite.anchor.set(0.5, 1)
                sprite.scale.set(AVATAR_SCALE)
                this.usernameText?.position.set(x, y - 68)
                this.textMessage.position.set(x, y - this.textMessage.height - 78)
                this.seatTween = null
            }
        })
    }

    private getSeatedTexture(facing: Direction): PIXI.Texture {
        const cached = this.seatedTextures[facing]
        if (cached) return cached
        const canvas = document.createElement('canvas')
        canvas.width = 48
        canvas.height = 48
        const context = canvas.getContext('2d')!
        context.imageSmoothingEnabled = false
        const atlas = this.sheet.textureSource.resource as CanvasImageSource
        const row = { down: 0, left: 1, right: 2, up: 3 }[facing]
        const frameY = row * 48

        // Keep the original head and shoulders, then tuck the lower body into
        // the chair. The source sprite's legs occupy its last twelve pixels.
        context.drawImage(atlas, 48, frameY, 48, 36, 0, 0, 48, 36)
        const legShift = facing === 'left' ? -4 : facing === 'right' ? 4 : 0
        context.drawImage(atlas, 48, frameY + 36, 48, 12, legShift, 36, 48, 5)

        const texture = PIXI.Texture.from(canvas)
        this.seatedTextures[facing] = texture
        return texture
    }

    public keydown = (event: KeyboardEvent) => {
        if (this.frozen) return

        this.setMovementMode('keyboard')
        const key = event.key.toLowerCase()
        const movementInput = { x: 0, y: 0 }
        let facing: Direction | null = null
        if (key === 'arrowup' || key === 'w') {
            movementInput.y -= 1
            facing = 'up'
        } else if (key === 'arrowdown' || key === 's') {
            movementInput.y += 1
            facing = 'down'
        } else if (key === 'arrowleft' || key === 'a') {
            movementInput.x -= 1
            facing = 'left'
        } else if (key === 'arrowright' || key === 'd') {
            movementInput.x += 1
            facing = 'right'
        }

        if (!facing) return
        if (!this.activeSeatVisual) {
            this.direction = facing
            this.changeAnimationState(`idle_${facing}` as AnimationState)
        }
        this.moveToTile(this.currentTilePosition.x + movementInput.x, this.currentTilePosition.y + movementInput.y)
    }

    public setMovementMode = (mode: 'keyboard' | 'mouse') => {
        this.movementMode = mode
    }

    private getMovementInput = () => {
        const movementInput = { x: 0, y: 0 }
        const latestKey = this.playApp.keysDown[this.playApp.keysDown.length - 1]?.toLowerCase()
        if (latestKey === 'arrowup' || latestKey === 'w') {
            movementInput.y -= 1
        } else if (latestKey === 'arrowdown' || latestKey === 's') {
            movementInput.y += 1
        } else if (latestKey === 'arrowleft' || latestKey === 'a') {
            movementInput.x -= 1
        } else if (latestKey === 'arrowright' || latestKey === 'd') {
            movementInput.x += 1
        }

        return movementInput
    }

    public setFrozen = (frozen: boolean) => {
        this.frozen = frozen
    }

    public destroy() {
        PIXI.Ticker.shared.remove(this.move)
        PIXI.Ticker.shared.remove(this.animateAction)
        this.initialized = false
        this.runRequest++
        if (this.textTimeout) clearTimeout(this.textTimeout)
        this.seatTween?.kill()
        Object.values(this.seatedTextures).forEach(texture => texture.destroy())
        this.seatedTextures = {}
    }
}
