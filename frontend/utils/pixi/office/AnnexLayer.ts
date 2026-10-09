import * as PIXI from 'pixi.js'
import { gsap } from 'gsap'
import type { AnnexConfig, AnnexSign } from './annex-reveal'

const TILE = 32
const DARK = 0x05060a
const FEATHER_STRIPS = 12

// Per-visit darkness over the annex wing plus the door signs, which stay lit.
export class AnnexLayer {
    readonly darkness = new PIXI.Graphics()
    readonly signs = new PIXI.Container()
    private progress = 0
    private tween: gsap.core.Tween | null = null

    constructor(private readonly annex: AnnexConfig | undefined, signs: AnnexSign[]) {
        this.darkness.eventMode = 'none'
        this.signs.eventMode = 'none'
        for (const sign of signs) this.signs.addChild(createSign(sign))
        this.draw()
    }

    get revealed(): boolean {
        return !this.annex || this.progress >= 1
    }

    reveal(animate = true): void {
        if (this.revealed || this.tween) return
        if (!animate) {
            this.progress = 1
            this.draw()
            return
        }
        const state = { progress: this.progress }
        this.tween = gsap.to(state, {
            progress: 1, duration: 1.5, ease: 'power2.inOut',
            onUpdate: () => { this.progress = state.progress; this.draw() },
            onComplete: () => { this.tween = null },
        })
    }

    private draw(): void {
        this.darkness.clear()
        if (!this.annex || this.progress >= 1) return
        const { x, y, width, height } = this.annex.reveal
        const right = (x + width) * TILE
        const top = y * TILE
        const fullHeight = height * TILE
        let left = (x + width * this.progress) * TILE
        // A soft front while sweeping: strips get darker away from the passage.
        if (this.progress > 0) {
            const stripWidth = TILE / 4
            for (let strip = 0; strip < FEATHER_STRIPS && left < right; strip++) {
                this.darkness.rect(left, top, Math.min(stripWidth, right - left), fullHeight).fill({ color: DARK, alpha: (strip + 1) / (FEATHER_STRIPS + 1) })
                left += stripWidth
            }
        }
        if (left < right) this.darkness.rect(left, top, right - left, fullHeight).fill({ color: DARK, alpha: 1 })
    }

    destroy(): void {
        this.tween?.kill()
        this.tween = null
        this.darkness.destroy()
        this.signs.destroy({ children: true })
    }
}

function createSign(sign: AnnexSign): PIXI.Container {
    const container = new PIXI.Container()
    const text = new PIXI.Text({ text: sign.text, style: { fontFamily: 'Nunito, Arial, sans-serif', fontSize: 12, fontWeight: '700', fill: 0xffffff, padding: 1 } })
    text.anchor.set(0.5)
    const width = Math.ceil(text.width) + 20
    const plate = new PIXI.Graphics()
    plate.roundRect(-width / 2, -11, width, 22, 7).fill({ color: 0x101b2b, alpha: 0.94 })
    plate.roundRect(-width / 2, -11, width, 22, 7).stroke({ color: 0xffffff, width: 1, alpha: 0.25 })
    container.addChild(plate, text)
    container.position.set(sign.x * TILE, sign.y * TILE)
    return container
}
