import * as PIXI from 'pixi.js'
import type { OfficeObject } from '../types'
import type { OfficeSnapshot } from './types'
import { gsap } from 'gsap'

const TILE_SIZE = 32

export class InteractionLayer {
    public readonly container = new PIXI.Container()
    private readonly outline = new PIXI.Graphics()
    private readonly label = new PIXI.Text({
        text: '',
        style: { fontFamily: 'nunito', fontSize: 15, fontWeight: 'bold', fill: 0xffffff },
    })
    private readonly badges = new Map<string, PIXI.Graphics>()
    private readonly gameBalls = new Map<string, PIXI.Graphics>()
    private readonly gameTweens = new Map<string, gsap.core.Tween>()
    private occupancy: Record<string, { uid: string, name: string }> = {}
    private hovered: OfficeObject | null = null

    constructor(
        private readonly objects: OfficeObject[],
        onActivate: (id: string) => void,
        onHover: (object: OfficeObject | null) => void,
    ) {
        this.container.eventMode = 'passive'
        this.outline.eventMode = 'none'
        this.label.eventMode = 'none'
        this.label.visible = false

        for (const object of objects) {
            const { x, y, width, height } = object.bounds
            const hitArea = new PIXI.Graphics()
            hitArea.rect(x * TILE_SIZE, y * TILE_SIZE, width * TILE_SIZE, height * TILE_SIZE)
            hitArea.fill({ color: 0x62e2c7, alpha: 0.001 })
            hitArea.eventMode = 'static'
            hitArea.cursor = 'pointer'
            hitArea.on('pointerdown', (event) => {
                event.stopPropagation()
                onActivate(object.id)
            })
            hitArea.on('pointerover', () => {
                this.showObject(object)
                onHover(object)
            })
            hitArea.on('pointerout', () => {
                this.hovered = null
                this.outline.clear()
                this.label.visible = false
                onHover(null)
            })
            this.container.addChild(hitArea)

            const badge = new PIXI.Graphics()
            badge.circle((x + width / 2) * TILE_SIZE, y * TILE_SIZE + 5, 7)
            badge.fill({ color: 0x1cae9b, alpha: 0.9 })
            badge.circle((x + width / 2) * TILE_SIZE, y * TILE_SIZE + 5, 3)
            badge.fill(0xffffff)
            badge.eventMode = 'none'
            this.container.addChild(badge)
            this.badges.set(object.id, badge)

            if (object.kind === 'pingpong') {
                const ball = new PIXI.Graphics()
                ball.circle(0, 0, 6)
                ball.fill(0xfff3ac)
                ball.position.set((x + width / 2) * TILE_SIZE, (y + height / 2) * TILE_SIZE)
                ball.visible = false
                ball.eventMode = 'none'
                this.container.addChild(ball)
                this.gameBalls.set(object.id, ball)
            }
        }

        this.container.addChild(this.outline)
        this.container.addChild(this.label)
    }

    private showObject(object: OfficeObject) {
        this.hovered = object
        const { x, y, width, height } = object.bounds
        this.outline.clear()
        this.outline.rect(x * TILE_SIZE, y * TILE_SIZE, width * TILE_SIZE, height * TILE_SIZE)
        this.outline.stroke({ width: 2, color: 0x62e2c7, alpha: 0.95 })
        const occupant = this.occupancy[object.id]
        this.label.text = occupant ? `${object.label} · ${occupant.name}` : object.label
        this.label.position.set(x * TILE_SIZE, Math.max(0, y * TILE_SIZE - 24))
        this.label.visible = true
    }

    public setOccupancy(occupancy: Record<string, { uid: string, name: string }>) {
        this.occupancy = occupancy
        for (const [id, badge] of this.badges) {
            const object = this.objects.find(item => item.id === id)
            if (!object) continue
            const { x, y, width } = object.bounds
            badge.clear()
            badge.circle((x + width / 2) * TILE_SIZE, y * TILE_SIZE + 5, 7)
            badge.fill({ color: occupancy[id] ? 0xf2a64b : 0x1cae9b, alpha: 0.95 })
            badge.circle((x + width / 2) * TILE_SIZE, y * TILE_SIZE + 5, 3)
            badge.fill(0xffffff)
        }
        if (this.hovered) this.showObject(this.hovered)
    }

    public setGames(games: OfficeSnapshot['games']) {
        for (const [id, ball] of this.gameBalls) {
            const playing = games[id]?.status === 'playing'
            ball.visible = playing
            if (playing && !this.gameTweens.has(id)) {
                const baseX = ball.x
                const baseY = ball.y
                const tween = gsap.to(ball, {
                    x: baseX + 24, y: baseY - 28, duration: 0.55,
                    ease: 'sine.inOut', repeat: -1, yoyo: true,
                })
                this.gameTweens.set(id, tween)
            } else if (!playing) {
                this.gameTweens.get(id)?.kill()
                this.gameTweens.delete(id)
            }
        }
    }

    public playEffect(objectId: string, effect: 'coffee' | 'water' | 'snack') {
        const object = this.objects.find(item => item.id === objectId)
        if (!object) return
        const { x, y, width } = object.bounds
        const sparkle = new PIXI.Text({
            text: effect === 'coffee' ? '☕' : effect === 'water' ? '💧' : '★',
            style: { fontFamily: 'Arial', fontSize: 27, fill: 0xffeeaa, fontWeight: 'bold' },
        })
        sparkle.anchor.set(0.5)
        sparkle.position.set((x + width / 2) * TILE_SIZE, y * TILE_SIZE)
        sparkle.eventMode = 'none'
        this.container.addChild(sparkle)
        gsap.to(sparkle, {
            y: sparkle.y - 45, alpha: 0, duration: 1.8,
            onComplete: () => { this.container.removeChild(sparkle); sparkle.destroy() },
        })
    }

    public destroy() {
        for (const tween of this.gameTweens.values()) tween.kill()
        gsap.killTweensOf(this.container.children)
        this.container.destroy({ children: true })
    }
}
