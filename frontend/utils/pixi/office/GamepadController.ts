import { sampleGamepad, gamepadLabels } from './gamepad.mjs'

export type GamepadInput = ReturnType<typeof sampleGamepad>
export type GamepadStatus = { connected: boolean, name?: string, actionLabel?: string, backLabel?: string, danceLabel?: string, runLabel?: string }

/** Owns one poll loop, with explicit release on blur, hide, disconnect and destroy. */
export class GamepadController {
    private frame = 0
    private held: number[] = []
    private id: string | null = null
    private stopped = false

    constructor(private readonly onInput: (input: GamepadInput) => void, private readonly onStatus: (status: GamepadStatus) => void) {
        window.addEventListener('blur', this.release)
        window.addEventListener('gamepaddisconnected', this.release)
        document.addEventListener('visibilitychange', this.release)
        this.frame = requestAnimationFrame(this.poll)
    }

    private poll = () => {
        if (this.stopped) return
        let pad: Gamepad | null = null
        if (!document.hidden && document.hasFocus()) {
            try { pad = Array.from(navigator.getGamepads?.() ?? []).find(item => item?.connected && item.mapping === 'standard') ?? null } catch { /* Permissions policy can disable gamepads in embedded browsers. */ }
        }
        const id = pad ? `${pad.index}:${pad.id}` : null
        if (id !== this.id) {
            this.held = []
            this.id = id
            const labels = gamepadLabels(pad?.id)
            this.onStatus({ connected: Boolean(pad), name: pad?.id, actionLabel: labels.action, backLabel: labels.back, danceLabel: labels.dance, runLabel: labels.run })
        }
        const input = sampleGamepad(pad, this.held)
        this.held = input.held
        this.onInput(input)
        this.frame = requestAnimationFrame(this.poll)
    }

    private release = () => {
        this.held = []
        this.onInput(sampleGamepad(null))
    }

    destroy() {
        this.stopped = true
        cancelAnimationFrame(this.frame)
        window.removeEventListener('blur', this.release)
        window.removeEventListener('gamepaddisconnected', this.release)
        document.removeEventListener('visibilitychange', this.release)
        this.release()
        this.onStatus({ connected: false })
    }
}
