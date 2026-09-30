type Position = { x: number, y: number }

export class MovementAuthority {
    position: Position = { x: 0, y: 0 }
    private epoch = 0
    private pending = 0
    private recovering = false
    reset(position: Position) { this.epoch++; this.pending = 0; this.recovering = false; this.position = { ...position } }
    begin(): number { this.pending++; return this.epoch }
    settle(epoch: number, ok: boolean, position?: Position): { recovering: boolean, settled: boolean } | null {
        if (epoch !== this.epoch) return null
        this.pending = Math.max(0, this.pending - 1)
        if (position) this.position = { ...position }
        if (!ok) this.recovering = true
        return { recovering: this.recovering, settled: this.pending === 0 }
    }
}
