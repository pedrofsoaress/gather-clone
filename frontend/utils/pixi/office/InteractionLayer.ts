import * as PIXI from 'pixi.js'
import type { OfficeObject } from '../types'

const TILE_SIZE = 32

export class InteractionLayer {
    public readonly container = new PIXI.Container()
    private readonly outline = new PIXI.Graphics()
    private readonly label = new PIXI.Text({
        text: '',
        style: { fontFamily: 'nunito', fontSize: 15, fontWeight: 'bold', fill: 0xffffff },
    })

    constructor(
        objects: OfficeObject[],
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
        }

        this.container.addChild(this.outline)
        this.container.addChild(this.label)
    }

    private showObject(object: OfficeObject) {
        const { x, y, width, height } = object.bounds
        this.outline.clear()
        this.outline.rect(x * TILE_SIZE, y * TILE_SIZE, width * TILE_SIZE, height * TILE_SIZE)
        this.outline.stroke({ width: 2, color: 0x62e2c7, alpha: 0.95 })
        this.label.text = object.label
        this.label.position.set(x * TILE_SIZE, Math.max(0, y * TILE_SIZE - 24))
        this.label.visible = true
    }

    public destroy() {
        this.container.destroy({ children: true })
    }
}
