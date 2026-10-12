export type MeetingSnapshot = { areaId: string, locked: boolean, allowed: string[], raised: string[], moderators: string[] }

// Lock, allowed speakers and raised hands of one meeting area (the training room).
export class MeetingState {
    locked = false
    readonly allowed = new Set<string>()
    readonly raised = new Set<string>()

    canSpeak(uid: string, isModerator: boolean): boolean {
        return !this.locked || isModerator || this.allowed.has(uid)
    }

    leave(uid: string): void {
        this.allowed.delete(uid)
        this.raised.delete(uid)
    }

    // An emptied meeting starts over: unlocked, nobody allowed, no raised hands.
    reset(): void {
        this.locked = false
        this.allowed.clear()
        this.raised.clear()
    }

    snapshot(areaId: string, moderators: string[]): MeetingSnapshot {
        return { areaId, locked: this.locked, allowed: [...this.allowed].sort(), raised: [...this.raised].sort(), moderators: [...moderators].sort() }
    }
}
