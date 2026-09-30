import * as PIXI from 'pixi.js'
import type { OfficeObject } from '../types'
import { getLightDescriptors, lightingStrength } from './lighting.mjs'
import { isLightEnabled } from './light-preferences'

/** World-space lighting sits above avatars and below interaction highlights/UI. */
export class LightingLayer {
    readonly container = new PIXI.Container()
    private readonly shade = new PIXI.Graphics()
    private readonly glows = new PIXI.Container()
    private readonly texture: PIXI.Texture
    private lightCount = 0
    private readonly lamps = new Map<string, PIXI.Sprite>()

    constructor(objects: OfficeObject[], width: number, height: number) {
        this.container.eventMode = 'none'
        this.container.interactiveChildren = false
        this.shade.rect(0, 0, width, height).fill(0x11152d)
        this.container.addChild(this.shade, this.glows)
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 128
        const context = canvas.getContext('2d')!
        const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64)
        gradient.addColorStop(0, 'rgba(255,255,255,0.45)')
        gradient.addColorStop(0.35, 'rgba(255,255,255,0.20)')
        gradient.addColorStop(1, 'rgba(255,255,255,0)')
        context.fillStyle = gradient
        context.fillRect(0, 0, 128, 128)
        this.texture = PIXI.Texture.from(canvas)
        // A shared texture and no blur filters keeps each configured light to one sprite.
        for (const light of getLightDescriptors(objects)) {
            const glow = new PIXI.Sprite(this.texture)
            glow.anchor.set(0.5)
            glow.position.set(light.x, light.y)
            glow.width = glow.height = light.radius * 2
            glow.tint = light.color
            glow.alpha = light.intensity
            glow.blendMode = 'add'
            glow.visible = isLightEnabled(light.id)
            this.glows.addChild(glow)
            this.lamps.set(light.id, glow)
        }
        this.lightCount = this.glows.children.length
        this.setPresentation(false)
    }

    setPresentation(active: boolean) {
        const strength = lightingStrength(active, this.lightCount)
        this.shade.alpha = strength.shade
        this.glows.alpha = strength.glow
    }

    setLightEnabled(id: string, enabled: boolean) {
        const lamp = this.lamps.get(id)
        if (lamp) lamp.visible = enabled
    }

    destroy() {
        this.container.destroy({ children: true })
        this.texture.destroy(true)
    }
}
