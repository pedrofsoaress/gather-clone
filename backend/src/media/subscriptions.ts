import type { Session } from '../session'
import { conversationChannelFor } from '../office/ConversationAuthorization'

export type MediaKind = 'mic' | 'camera' | 'screen' | 'speaker'
// One track a person publishes on their send session.
export type Publication = { uid: string, kind: MediaKind, objectId?: string, sessionId: string, trackName: string, mid: string, live: boolean, simulcast: boolean }
export type WantedPull = { key: string, fromUid: string, kind: MediaKind, objectId?: string, sessionId: string, trackName: string, simulcast: boolean }
export type PeerState = { uid: string, mic: boolean, camera: boolean, screen: boolean }
export type PeersSnapshot = { self: string, conversation: string | null, peers: PeerState[], ownScreen: boolean }
// conversation: the channel of the person's verified tile (private area, else proximity group).
// moderators: the stage of the meeting room they are in, null outside one.
export type ViewPlayer = { conversation: string | null, moderators: string[] | null, speakers: Record<string, { ownerUid: string, volume: number }> }
export type MediaView = Map<string, ViewPlayer>

export const pullKey = (publication: Pick<Publication, 'uid' | 'trackName'>) => `${publication.uid}|${publication.trackName}`

export function mediaView(session: Session): MediaView {
    const view: MediaView = new Map()
    for (const uid of session.getPlayerIds()) {
        const meeting = session.meetingOf(uid)
        view.set(uid, { conversation: conversationChannelFor(session, uid), moderators: meeting ? meeting.moderators : null, speakers: session.featuresFor(uid).speakers.snapshotFor(uid) })
    }
    return view
}

// What `uid` must receive now. The same rules that authorized an Agora call: the microphones and cameras of
// your conversation (in a meeting room the audience only gets the stage's cameras), the others' shared
// screens, and every lounge speaker in range. Nothing of your own, nothing from another floor.
export function desiredPulls(view: MediaView, uid: string, publications: Iterable<Publication>): Map<string, WantedPull> {
    const me = view.get(uid)
    const wanted = new Map<string, WantedPull>()
    if (!me) return wanted
    for (const publication of publications) {
        if (publication.uid === uid) continue
        if (publication.kind === 'speaker') {
            const speaker = publication.objectId ? me.speakers[publication.objectId] : undefined
            if (!speaker || speaker.ownerUid !== publication.uid || speaker.volume <= 0) continue
        } else {
            if (!me.conversation || view.get(publication.uid)?.conversation !== me.conversation) continue
            if (publication.kind === 'camera' && me.moderators && !me.moderators.includes(uid) && !me.moderators.includes(publication.uid)) continue
        }
        const key = pullKey(publication)
        const { uid: fromUid, kind, objectId, sessionId, trackName, simulcast } = publication
        wanted.set(key, { key, fromUid, kind, ...(objectId ? { objectId } : {}), sessionId, trackName, simulcast })
    }
    return wanted
}

// `failed`: pulls Cloudflare refused; not retried until the publisher republishes (new key).
export function diffPulls(current: ReadonlyMap<string, unknown>, wanted: ReadonlyMap<string, WantedPull>, failed: ReadonlySet<string> = new Set()): { add: WantedPull[], remove: string[] } {
    return {
        add: [...wanted.values()].filter(pull => !current.has(pull.key) && !failed.has(pull.key)),
        remove: [...current.keys()].filter(key => !wanted.has(key)),
    }
}

// The tiles the page shows: everyone in your conversation, even when their video is not received.
export function peersFor(view: MediaView, uid: string, publications: Publication[]): PeersSnapshot {
    const conversation = view.get(uid)?.conversation ?? null
    const has = (who: string, kind: MediaKind, live: boolean) => publications.some(p => p.uid === who && p.kind === kind && (!live || p.live))
    const peers = !conversation ? [] : [...view]
        .filter(([other, player]) => other !== uid && player.conversation === conversation)
        .map(([other]) => ({ uid: other, mic: has(other, 'mic', true), camera: has(other, 'camera', true), screen: has(other, 'screen', false) }))
        .sort((a, b) => a.uid.localeCompare(b.uid))
    return { self: uid, conversation, peers, ownScreen: Boolean(conversation) && has(uid, 'screen', false) }
}
