import * as PIXI from 'pixi.js'

/** Lightweight world-space markers; they never change the avatar's scale or hit area. */
export class AvatarDecorations {
    readonly shadow = new PIXI.Graphics()
    readonly nameplate = new PIXI.Container()
    readonly focusBadge = new PIXI.Container()

    constructor(name: string, local: boolean) {
        this.shadow.ellipse(0, 0, 13, 4).fill({ color: 0x07101b, alpha: 0.38 })
        this.shadow.ellipse(0, 0, 8, 2.5).fill({ color: 0x07101b, alpha: 0.20 })
        this.shadow.eventMode = 'none'
        this.nameplate.eventMode = 'none'

        const text = new PIXI.Text({ text: name, style: { fontFamily: 'Nunito, Arial, sans-serif', fontSize: 11, fontWeight: '600', fill: 0xf8fafc, padding: 1 } })
        text.anchor.set(0.5)
        const maxTextWidth = 160
        if (text.width > maxTextWidth) text.scale.set(maxTextWidth / text.width)
        const width = Math.ceil(text.width) + 24
        const background = new PIXI.Graphics()
        background.roundRect(-width / 2, -10, width, 20, 6).fill({ color: 0x101b2b, alpha: 0.94 })
        background.roundRect(-width / 2, -10, width, 20, 6).stroke({ color: local ? 0x65e3c2 : 0xffffff, width: 1, alpha: local ? 0.8 : 0.22 })
        background.circle(-width / 2 + 8, 0, 2.5).fill(local ? 0x65e3c2 : 0xdce7f4)
        text.x = 4
        this.nameplate.addChild(background, text)

        const label = new PIXI.Text({ text: 'em foco', style: { fontFamily: 'Nunito, Arial, sans-serif', fontSize: 9, fontWeight: '700', fill: 0x0b1220, padding: 1 } })
        label.anchor.set(0.5)
        const badgeWidth = Math.ceil(label.width) + 12
        const pill = new PIXI.Graphics()
        pill.roundRect(-badgeWidth / 2, -7, badgeWidth, 14, 7).fill({ color: 0x65e3c2 })
        this.focusBadge.addChild(pill, label)
        this.focusBadge.eventMode = 'none'
        this.focusBadge.visible = false
        this.position(0, 0, false)
    }

    setFocus(on: boolean) { this.focusBadge.visible = on }

    position(x: number, y: number, seated: boolean) {
        this.shadow.position.set(x, y - 2)
        this.shadow.alpha = seated ? 0.5 : 1
        this.nameplate.position.set(x, y - 61)
        this.focusBadge.position.set(x, y - 61 - 14 - 10)
    }

    destroy() { this.shadow.destroy(); this.nameplate.destroy({ children: true }); this.focusBadge.destroy({ children: true }) }
}
