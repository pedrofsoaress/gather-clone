import * as PIXI from 'pixi.js'
import playerSpriteSheetData from './PlayerSpriteSheetData'
import { Point, Coordinate, AnimationState, Direction } from '../types'
import { PlayApp } from '../PlayApp'
import { bfs } from '../pathfinding'
import { server } from '../../backend/server'
import { defaultSkin, skins } from './skins'
import signal from '@/utils/signal'
import { videoChat } from '@/utils/video-chat/video-chat'
import { agoraUidForProfile } from '@/utils/video-chat/agoraIdentity'
import { gsap } from 'gsap'
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
    private movementSpeed: number = 3.5
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

        const path: Coordinate[] | null = bfs(start, end, this.playApp.blocked)
        if (!path || path.length === 0) {
            if (!path && !this.isLocal) {
                this.strikes++
            }
            return false
        }

        this.setSeatedVisual(null)

        PIXI.Ticker.shared.remove(this.move)

        this.path = path
        this.pathIndex = 0
        this.targetPosition = this.convertTilePosToPlayerPos(this.path[this.pathIndex][0], this.path[this.pathIndex][1])
        PIXI.Ticker.shared.add(this.move)

        if (this.isLocal) {
            server.socket.emit('movePlayer', { x, y })
        }
        return true
    }

    private move = ({ deltaTime }: { deltaTime: number }) => {
        if (!this.targetPosition) return

        const currentPos = this.convertPlayerPosToTilePos(this.parent.x, this.parent.y)
        this.checkIfShouldJoinChannel(currentPos)

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
                server.socket.emit('officeStep', this.currentTilePosition)
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
                    this.moveToTile(newTilePosition.x, newTilePosition.y)
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
                videoChat.joinChannel(tile.privateAreaId, agoraUidForProfile(this.playApp.uid, this.username), this.playApp.realmId)
                this.playApp.fadeInTiles(tile.privateAreaId)
            }
        } else {
            if (this.playApp.proximityId) {
                if (this.playApp.proximityId !== this.currentChannel) {
                    this.currentChannel = this.playApp.proximityId
                    videoChat.joinChannel(this.playApp.proximityId, agoraUidForProfile(this.playApp.uid, this.username), this.playApp.realmId)
                    this.playApp.fadeOutTiles()
                }
            } else if (this.currentChannel !== 'local') {
                this.currentChannel = 'local'
                videoChat.leaveChannel()
                this.playApp.fadeOutTiles()
            }
        }
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
        animatedSprite.play()
    }

    public setSeatedVisual = (visual: { x: number, y: number, facing?: Direction } | null) => {
        if (!this.initialized) return
        this.pendingSeatVisual = visual && this.targetPosition ? visual : null
        if (this.pendingSeatVisual) return
        const seatKey = visual ? `${visual.x},${visual.y},${visual.facing ?? ''},${this.currentTilePosition.x},${this.currentTilePosition.y}` : null
        if (seatKey === this.currentSeatKey) return
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
        const movementInput = { x: 0, y: 0 }
        if (event.key === 'ArrowUp' || event.key === 'w') {
            movementInput.y -= 1
        } else if (event.key === 'ArrowDown' || event.key === 's') {
            movementInput.y += 1
        } else if (event.key === 'ArrowLeft' || event.key === 'a') {
            movementInput.x -= 1
        } else if (event.key === 'ArrowRight' || event.key === 'd') {
            movementInput.x += 1
        }

        this.moveToTile(this.currentTilePosition.x + movementInput.x, this.currentTilePosition.y + movementInput.y)
    }

    public setMovementMode = (mode: 'keyboard' | 'mouse') => {
        this.movementMode = mode
    }

    private getMovementInput = () => {
        const movementInput = { x: 0, y: 0 }
        const latestKey = this.playApp.keysDown[this.playApp.keysDown.length - 1]
        if (latestKey === 'ArrowUp' || latestKey === 'w') {
            movementInput.y -= 1
        } else if (latestKey === 'ArrowDown' || latestKey === 's') {
            movementInput.y += 1
        } else if (latestKey === 'ArrowLeft' || latestKey === 'a') {
            movementInput.x -= 1
        } else if (latestKey === 'ArrowRight' || latestKey === 'd') {
            movementInput.x += 1
        }

        return movementInput
    }

    public setFrozen = (frozen: boolean) => {
        this.frozen = frozen
    }

    public destroy() {
        PIXI.Ticker.shared.remove(this.move)
        this.seatTween?.kill()
        Object.values(this.seatedTextures).forEach(texture => texture.destroy())
        this.seatedTextures = {}
    }
}
