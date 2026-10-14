export type PresenceEntry = { uid: string, name: string, room: number, areaId: string | null }

// Who is in the office and where (floor and area), for the "Quem está online" list.
// One per session. Walking inside an area or along a corridor changes nothing here, so
// a new snapshot only goes out when someone arrives, leaves, changes floor or area.
export class PresenceTracker {
    private readonly entries = new Map<string, PresenceEntry>()
    private changed = false

    // Records where the person is now. True when that differs from what everyone was last told.
    public set(entry: PresenceEntry): boolean {
        const current = this.entries.get(entry.uid)
        if (current && current.name === entry.name && current.room === entry.room && current.areaId === entry.areaId) return false
        this.entries.set(entry.uid, { uid: entry.uid, name: entry.name, room: entry.room, areaId: entry.areaId })
        this.changed = true
        return true
    }

    public remove(uid: string): boolean {
        if (!this.entries.delete(uid)) return false
        this.changed = true
        return true
    }

    public snapshot(): PresenceEntry[] {
        return [...this.entries.values()].map(entry => ({ ...entry }))
    }

    // True once after any change: the caller then sends the snapshot to everyone.
    public takeChange(): boolean {
        const changed = this.changed
        this.changed = false
        return changed
    }
}
