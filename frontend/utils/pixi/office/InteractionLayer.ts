import * as PIXI from 'pixi.js'
import type { OfficeObject } from '../types'
import type { OfficeSnapshot } from './types'
import { gsap } from 'gsap'
import { PetSprite } from './PetSprite'

const TILE_SIZE = 32

export class InteractionLayer {
    public readonly container = new PIXI.Container()
    private readonly hoverRing = new PIXI.Graphics()
    private readonly badges = new Map<string, PIXI.Graphics>()
    private readonly gameBalls = new Map<string, PIXI.Graphics>()
    private readonly gameTweens = new Map<string, gsap.core.Tween>()
    private readonly pets = new Map<string, PetSprite>()
    private occupancy: Record<string, { uid: string, name: string }> = {}
    private hovered: OfficeObject | null = null

    constructor(
        private readonly objects: OfficeObject[],
        onActivate: (id: string) => void,
        onHover: (object: OfficeObject | null) => void,
    ) {
        this.container.eventMode = 'passive'
        this.hoverRing.eventMode = 'none'

        for (const object of objects) {
            const { x, y, width, height } = object.bounds
            const hitArea = new PIXI.Graphics()
            hitArea.rect(x * TILE_SIZE, y * TILE_SIZE, width * TILE_SIZE, height * TILE_SIZE)
            hitArea.fill({ color: 0x62e2c7, alpha: 0.001 })
            hitArea.eventMode = 'static'
            hitArea.cursor = 'pointer'
            hitArea.on('pointerdown', (event) => {
                if (event.button !== 0) return
                event.stopPropagation()
                onActivate(object.id)
            })
            hitArea.on('pointerover', () => {
                this.showObject(object)
                onHover(object)
            })
            hitArea.on('pointerout', () => {
                this.hovered = null
                this.hoverRing.clear()
                this.updateBadgeVisibility()
                onHover(null)
            })
            this.container.addChild(hitArea)

            const badge = new PIXI.Graphics()
            badge.circle((x + width / 2) * TILE_SIZE, y * TILE_SIZE + 5, 7)
            badge.fill({ color: 0x1cae9b, alpha: 0.9 })
            badge.circle((x + width / 2) * TILE_SIZE, y * TILE_SIZE + 5, 3)
            badge.fill(0xffffff)
            badge.eventMode = 'none'
            badge.visible = object.kind !== 'seat' && object.kind !== 'desk'
            this.container.addChild(badge)
            this.badges.set(object.id, badge)

            if (object.kind === 'pet') {
                const pet = new PetSprite()
                pet.container.position.set((x + width / 2) * TILE_SIZE, (y + height / 2 + 0.4) * TILE_SIZE)
                this.container.addChild(pet.container)
                this.pets.set(object.id, pet)
            }

            if (object.kind === 'speaker') {
                const speaker = new PIXI.Graphics()
                speaker.roundRect(-11, -14, 22, 31, 3).fill(0x263248).stroke({ color: 0x6ddbc5, width: 2 })
                speaker.circle(0, -6, 4).fill(0x0d1423).stroke({ color: 0x738399, width: 1 })
                speaker.circle(0, 7, 7).fill(0x0d1423).stroke({ color: 0x738399, width: 1 })
                speaker.circle(0, 7, 3).fill(0x4a6078)
                speaker.position.set((x + width / 2) * TILE_SIZE, (y + height / 2) * TILE_SIZE)
                speaker.eventMode = 'none'
                this.container.addChild(speaker)
            }

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

        this.container.addChild(this.hoverRing)
    }

    private showObject(object: OfficeObject) {
        this.hovered = object
        this.updateBadgeVisibility()
        const { x, y, width } = object.bounds
        this.hoverRing.clear()
        this.hoverRing.circle((x + width / 2) * TILE_SIZE, y * TILE_SIZE + 5, 12)
        this.hoverRing.stroke({ width: 2, color: 0x62e2c7, alpha: 0.8 })
    }

    private updateBadgeVisibility() {
        for (const [id, badge] of this.badges) {
            const object = this.objects.find(item => item.id === id)
            if (!object) continue
            const isSeat = object.kind === 'seat' || object.kind === 'desk'
            badge.visible = !this.occupancy[id] && (!isSeat || this.hovered?.id === id)
        }
    }

    public setOccupancy(occupancy: Record<string, { uid: string, name: string }>) {
        this.occupancy = occupancy
        for (const [id, badge] of this.badges) {
            const object = this.objects.find(item => item.id === id)
            if (!object) continue
            // The occupied seat itself shows who is there. A badge at the top of
            // its hit area otherwise lands directly on the seated avatar's head.
            const { x, y, width } = object.bounds
            badge.clear()
            badge.circle((x + width / 2) * TILE_SIZE, y * TILE_SIZE + 5, 7)
            badge.fill({ color: occupancy[id] ? 0xf2a64b : 0x1cae9b, alpha: 0.95 })
            badge.circle((x + width / 2) * TILE_SIZE, y * TILE_SIZE + 5, 3)
            badge.fill(0xffffff)
        }
        this.updateBadgeVisibility()
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

    public playPetEffect(objectId: string) { this.pets.get(objectId)?.pet() }

    public destroy() {
        for (const tween of this.gameTweens.values()) tween.kill()
        for (const pet of this.pets.values()) pet.destroy()
        this.pets.clear()
        gsap.killTweensOf(this.container.children)
        this.container.destroy({ children: true })
    }
}
