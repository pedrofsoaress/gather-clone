export const FOLLOW_START_INTERVAL_MS = 1000

type Present = { username: string, socketId: string }
type Directory = { getPlayer(uid: string): Present | undefined }
export type FollowNotice = { socketId: string, notice: { name: string, following: boolean } }

// What one follower's socket tells the people it follows. Both must be in the same
// office session (any room) and only the follower's current socket can speak for it.
export class FollowRelay {
    private following: string | null = null
    private lastStartAt = -Infinity

    constructor(private readonly uid: string, private readonly socketId: string, private readonly now: () => number = Date.now) {}

    start(session: Directory | undefined, targetUid: string): FollowNotice[] {
        const at = this.now()
        if (at - this.lastStartAt < FOLLOW_START_INTERVAL_MS) return []
        this.lastStartAt = at
        const pair = this.pair(session, targetUid)
        if (!pair || this.following === targetUid) return []
        const notices = this.following ? this.stop(session, this.following) : []
        this.following = targetUid
        return [...notices, { socketId: pair.target.socketId, notice: { name: pair.me.username, following: true } }]
    }

    stop(session: Directory | undefined, targetUid: string): FollowNotice[] {
        if (this.following !== targetUid) return []
        this.following = null
        const pair = this.pair(session, targetUid)
        return pair ? [{ socketId: pair.target.socketId, notice: { name: pair.me.username, following: false } }] : []
    }

    // The follower's connection dropped: whoever it followed hears that it stopped.
    disconnect(session: Directory | undefined): FollowNotice[] {
        const followed = this.following ? session?.getPlayer(this.following) : undefined
        const me = session?.getPlayer(this.uid)
        this.following = null
        return followed && me ? [{ socketId: followed.socketId, notice: { name: me.username, following: false } }] : []
    }

    private pair(session: Directory | undefined, targetUid: string) {
        const me = session?.getPlayer(this.uid)
        if (!session || !me || me.socketId !== this.socketId || targetUid === this.uid) return null
        const target = session.getPlayer(targetUid)
        return target ? { me, target } : null
    }
}
