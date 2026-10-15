import type { Layer } from './protocol'

export const LAYER_DEBOUNCE_MS = 250
const RANK: Record<Layer, number> = { q: 0, h: 1, f: 2 }

// Every tile showing someone asks for the layer it needs; the biggest wins. q is what the server sends by default.
export class LayerRequests {
    private readonly requests = new Map<string, Map<number, Layer>>()
    private readonly onChange: (uid: string, layer: Layer) => void
    private next = 0

    constructor(onChange: (uid: string, layer: Layer) => void) { this.onChange = onChange }

    current(uid: string): Layer | null {
        let best: Layer | null = null
        for (const layer of this.requests.get(uid)?.values() ?? []) if (!best || RANK[layer] > RANK[best]) best = layer
        return best
    }

    request(uid: string, layer: Layer): () => void {
        const id = ++this.next
        this.change(uid, () => {
            if (!this.requests.has(uid)) this.requests.set(uid, new Map())
            this.requests.get(uid)!.set(id, layer)
        })
        return () => this.change(uid, () => {
            const mine = this.requests.get(uid)
            mine?.delete(id)
            if (mine && !mine.size) this.requests.delete(uid)
        })
    }

    clear(): void { this.requests.clear() }

    private change(uid: string, edit: () => void) {
        const before = this.current(uid) ?? 'q'
        edit()
        const after = this.current(uid) ?? 'q'
        if (after !== before) this.onChange(uid, after)
    }
}
