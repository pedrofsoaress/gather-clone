import { randomUUID } from 'crypto'

export type Knock = { id: string, from: string, to: string, at: number }
export type FocusResult = { ok: true, knock: Knock } | { ok: false, error: string }

export const KNOCK_ANSWER_MS = 30_000
export const KNOCK_COOLDOWN_MS = 60_000

// Same circle as the proximity tiles (radius 2.5): close enough to talk.
export function withinReach(a: { x: number, y: number }, b: { x: number, y: number }): boolean {
    const dx = a.x - b.x
    const dy = a.y - b.y
    return dx * dx + dy * dy <= 6.25
}

// Knocks on people seated at focus desks, and the conversations they accepted.
// One pair per focused person: an accepted knock replaces any earlier pair.
export class FocusState {
    private readonly knocks = new Map<string, Knock>()
    private readonly pairs = new Map<string, string>() // focused uid -> knocker uid
    private readonly lastKnock = new Map<string, number>() // `${from}>${to}` -> time

    constructor(private readonly now: () => number = Date.now, private readonly newId: () => string = randomUUID) {}

    knock(from: string, to: string): FocusResult {
        if (from === to) return { ok: false, error: 'Chamada inválida.' }
        if (this.pairs.get(to) === from) return { ok: false, error: 'Vocês já estão conversando.' }
        const at = this.now()
        const last = this.lastKnock.get(`${from}>${to}`)
        if (last !== undefined && at - last < KNOCK_COOLDOWN_MS) return { ok: false, error: 'Aguarde um minuto para chamar de novo.' }
        const knock = { id: this.newId(), from, to, at }
        this.knocks.set(knock.id, knock)
        this.lastKnock.set(`${from}>${to}`, at)
        return { ok: true, knock }
    }

    answer(id: string, by: string, accept: boolean): FocusResult {
        const knock = this.knocks.get(id)
        if (!knock || knock.to !== by) return { ok: false, error: 'Chamada não encontrada.' }
        this.knocks.delete(id)
        if (this.now() - knock.at > KNOCK_ANSWER_MS) return { ok: false, error: 'A chamada expirou.' }
        if (accept) this.pairs.set(knock.to, knock.from)
        return { ok: true, knock }
    }

    // Closes a knock nobody answered; null when it was already answered.
    expire(id: string): Knock | null {
        const knock = this.knocks.get(id)
        if (!knock) return null
        this.knocks.delete(id)
        return knock
    }

    partnerOf(uid: string): string | null {
        const knocker = this.pairs.get(uid)
        if (knocker) return knocker
        for (const [focused, other] of this.pairs) if (other === uid) return focused
        return null
    }

    // The focused person of the pair `uid` is in (themselves when focused and paired).
    focusedOf(uid: string): string | null {
        if (this.pairs.has(uid)) return uid
        for (const [focused, knocker] of this.pairs) if (knocker === uid) return focused
        return null
    }

    // Keeps only the pairs `keep` approves (both present, still focused, still close).
    prune(keep: (focused: string, knocker: string) => boolean): void {
        for (const [focused, knocker] of [...this.pairs]) if (!keep(focused, knocker)) this.pairs.delete(focused)
    }
}
