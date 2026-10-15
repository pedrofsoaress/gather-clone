import type { Session } from '../session'
import { conversationChannelFor, conversationGroupFor } from '../office/ConversationAuthorization'
import { areaAt, meetingStage } from '../office/areas'

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
// Per person: whether a live mic, a live camera and a screen are published.
export type PublicationIndex = Map<string, { mic: boolean, camera: boolean, screen: boolean }>

export const pullKey = (publication: Pick<Publication, 'uid' | 'trackName'>) => `${publication.uid}|${publication.trackName}`

export function mediaView(session: Session): MediaView {
    const view: MediaView = new Map()
    for (const uid of session.getPlayerIds()) {
        const meeting = session.meetingOf(uid)
        view.set(uid, { conversation: conversationChannelFor(session, uid), moderators: meeting ? meeting.moderators : null, speakers: session.featuresFor(uid).speakers.snapshotFor(uid) })
    }
    return view
}

// Everything mediaView depends on, without hashing or scanning the room per person: same string, same view.
// Per person: their socket, the conversation group of their verified tile, their meeting area and whether they
// stand on its stage (the moderators of a meeting are exactly its members on the stage), and the speakers they hear.
export function mediaFingerprint(session: Session): string {
    let fingerprint = ''
    for (const uid of session.getPlayerIds()) {
        const player = session.getPlayer(uid)
        const group = conversationGroupFor(session, uid)
        const room = session.map_data.rooms[player.room]
        const areaId = areaAt(room, player.x, player.y)
        const stage = meetingStage(room, areaId)
        const onStage = stage && player.x >= stage.x1 && player.x <= stage.x2 && player.y >= stage.y1 && player.y <= stage.y2
        const speakers = session.featuresFor(uid).speakers.snapshotFor(uid)
        let heard = ''
        for (const objectId in speakers) if (speakers[objectId].volume > 0) heard += `${objectId}>${speakers[objectId].ownerUid},`
        fingerprint += `${uid}\u0001${player.socketId}\u0001${group ? `${group.room}:${group.group}` : ''}\u0001${stage ? `${player.room}:${areaId}:${onStage ? 1 : 0}` : ''}\u0001${heard}\n`
    }
    return fingerprint
}

export function indexPublications(publications: Iterable<Publication>): PublicationIndex {
    const index: PublicationIndex = new Map()
    for (const publication of publications) {
        if (publication.kind === 'speaker') continue
        let entry = index.get(publication.uid)
        if (!entry) index.set(publication.uid, entry = { mic: false, camera: false, screen: false })
        if (publication.kind === 'screen') entry.screen = true
        else if (publication.live) entry[publication.kind] = true
    }
    return index
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
        const pull: WantedPull = { key, fromUid: publication.uid, kind: publication.kind, sessionId: publication.sessionId, trackName: publication.trackName, simulcast: publication.simulcast }
        if (publication.objectId) pull.objectId = publication.objectId
        wanted.set(key, pull)
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
// Pass the index when calling it for many people over the same publications.
export function peersFor(view: MediaView, uid: string, publications: Publication[], index: PublicationIndex = indexPublications(publications)): PeersSnapshot {
    const conversation = view.get(uid)?.conversation ?? null
    const none = { mic: false, camera: false, screen: false }
    const peers = !conversation ? [] : [...view]
        .filter(([other, player]) => other !== uid && player.conversation === conversation)
        .map(([other]) => { const has = index.get(other) ?? none; return { uid: other, mic: has.mic, camera: has.camera, screen: has.screen } })
        .sort((a, b) => a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0)
    return { self: uid, conversation, peers, ownScreen: Boolean(conversation) && Boolean(index.get(uid)?.screen) }
}
