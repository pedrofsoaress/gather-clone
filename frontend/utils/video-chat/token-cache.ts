// The server pushes a conversation's Agora token before the client joins it (it
// expires after 60 minutes); older entries are left to the server action.
export const TOKEN_TRUST_MS = 50 * 60 * 1000

export class TokenCache {
    private readonly tokens = new Map<string, { token: string, at: number }>()
    private readonly waiters = new Map<string, Set<(token: string | null) => void>>()
    private readonly now: () => number
    // Until the first push, the server has no Agora credentials as far as this page knows: nothing to wait for.
    private pushedTokensSeen = false

    constructor(now: () => number = Date.now) {
        this.now = now
    }

    public remember(channel: string, token: string) {
        this.pushedTokensSeen = true
        const at = this.now()
        for (const [key, entry] of this.tokens) if (at - entry.at > TOKEN_TRUST_MS) this.tokens.delete(key)
        this.tokens.set(channel, { token, at })
        const waiting = this.waiters.get(channel)
        this.waiters.delete(channel)
        waiting?.forEach(resolve => resolve(token))
    }

    public get(channel: string): string | null {
        const entry = this.tokens.get(channel)
        return entry && this.now() - entry.at <= TOKEN_TRUST_MS ? entry.token : null
    }

    // The cached token, or the one pushed within `timeoutMs` (resolved as soon as it is
    // remembered); null when none arrives in time, and at once before any push was seen.
    public wait(channel: string, timeoutMs: number): Promise<string | null> {
        const cached = this.get(channel)
        if (cached || timeoutMs <= 0 || !this.pushedTokensSeen) return Promise.resolve(cached)
        return new Promise(resolve => {
            const settle = (token: string | null) => {
                clearTimeout(timer)
                const waiting = this.waiters.get(channel)
                waiting?.delete(settle)
                if (waiting?.size === 0) this.waiters.delete(channel)
                resolve(token)
            }
            const timer = setTimeout(() => settle(null), timeoutMs)
            if (!this.waiters.has(channel)) this.waiters.set(channel, new Set())
            this.waiters.get(channel)!.add(settle)
        })
    }

    // A newer join or a leave supersedes every pending wait: they resolve null at once.
    public cancelWaits() {
        const waiting = [...this.waiters.values()].flatMap(set => [...set])
        this.waiters.clear()
        for (const settle of waiting) settle(null)
    }

    public forget(channel: string) {
        this.tokens.delete(channel)
    }

    public clear() {
        this.tokens.clear()
    }
}
