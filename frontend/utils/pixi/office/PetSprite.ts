import * as PIXI from 'pixi.js'
import { gsap } from 'gsap'

/** Caju is drawn here from original pixel shapes; it needs no third-party sprite. */
export class PetSprite {
    readonly container = new PIXI.Container()
    private readonly body = new PIXI.Graphics()
    private readonly tail = new PIXI.Graphics()
    private readonly heart = new PIXI.Text({ text: '♥', style: { fontFamily: 'Arial', fontSize: 17, fill: 0xfa9fc0 } })
    private affection: gsap.core.Timeline | null = null

    constructor() {
        const body = this.body
        body.rect(-10, -13, 20, 11).fill(0xe6a260)
        body.rect(-11, -23, 22, 14).fill(0xf0bb7b)
        body.rect(-11, -28, 7, 7).rect(4, -28, 7, 7).fill(0xe6a260)
        body.rect(-9, -26, 3, 4).rect(6, -26, 3, 4).fill(0xe99994)
        body.rect(-10, -4, 7, 4).rect(3, -4, 7, 4).fill(0xffddab)
        body.rect(-7, -20, 3, 3).rect(4, -20, 3, 3).fill(0x293346)
        body.rect(-1, -16, 2, 2).fill(0xb66465)
        body.rect(-3, -14, 6, 2).fill(0xffddab)
        body.rect(-2, -23, 4, 4).rect(-7, -10, 3, 5).rect(5, -10, 3, 5).fill(0xbe763c)
        this.tail.rect(8, -9, 8, 4).rect(13, -15, 4, 9).fill(0xd89550)
        this.tail.pivot.set(8, -7)
        this.tail.position.set(8, -7)
        this.heart.anchor.set(0.5)
        this.heart.position.set(0, -33)
        this.heart.alpha = 0
        this.container.addChild(this.tail, body, this.heart)
        this.container.scale.set(1.35)
        this.container.eventMode = 'none'
    }

    pet() {
        this.affection?.kill()
        this.body.scale.set(1)
        this.tail.rotation = 0
        this.heart.position.set(0, -33)
        this.heart.alpha = 0
        this.affection = gsap.timeline()
            .to(this.body.scale, { y: 0.88, duration: 0.3, repeat: 5, yoyo: true, ease: 'sine.inOut' }, 0)
            .to(this.tail, { rotation: 0.28, duration: 0.22, repeat: 7, yoyo: true, ease: 'sine.inOut' }, 0)
            .to(this.heart, { alpha: 1, duration: 0.2 }, 0)
            .to(this.heart, { y: -51, duration: 1.9 }, 0.2)
            .to(this.heart, { alpha: 0, duration: 0.3 }, 1.8)
    }

    destroy() { this.affection?.kill(); this.container.destroy({ children: true }) }
}
