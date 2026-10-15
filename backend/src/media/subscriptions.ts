import { PROXIMITY_RADIUS, type Session } from '../session'
import { conversationChannelFor, conversationGroupFor } from '../office/ConversationAuthorization'
import { areaAt, areaConfig, meetingStage } from '../office/areas'

export type MediaKind = 'mic' | 'camera' | 'screen' | 'speaker'
// One track a person publishes on their send session.
export type Publication = { uid: string, kind: MediaKind, objectId?: string, sessionId: string, trackName: string, mid: string, live: boolean, simulcast: boolean }
// prefetch: pulled ahead of a conversation (see PREFETCH_RADIUS), received at the lowest layer and never shown.
export type WantedPull = { key: string, fromUid: string, kind: MediaKind, objectId?: string, sessionId: string, trackName: string, simulcast: boolean, prefetch: boolean }
export type PeerState = { uid: string, mic: boolean, camera: boolean, screen: boolean }
export type PeersSnapshot = { self: string, conversation: string | null, peers: PeerState[], ownScreen: boolean }
// conversation: the channel of the person's verified tile (private area, else proximity group).
// moderators: the stage of the meeting room they are in, null outside one.
// open: their floor while they stand in the open office (see openFloor), else null.
// nearby: the prefetch candidates around them (see prefetchCandidates).
export type ViewPlayer = { conversation: string | null, moderators: string[] | null, speakers: Record<string, { ownerUid: string, volume: number }>, open: number | null, nearby: string[] }
export type MediaView = Map<string, ViewPlayer>
// Per person: whether a live mic, a live camera and a screen are published.
export type PublicationIndex = Map<string, { mic: boolean, camera: boolean, screen: boolean }>

export const pullKey = (publication: Pick<Publication, 'uid' | 'trackName'>) => `${publication.uid}|${publication.trackName}`

// Prefetch: the microphone and camera of someone this close are pulled before the conversation starts
// (camera at the lowest layer, nothing shown or played), so joining it only shows what is already arriving. Three
// tiles past the conversation reach. Never between two seated people: they cannot walk into each other, and within
// SEATED_PROXIMITY_RADIUS they already talk. At most PREFETCH_LIMIT people per person, the nearest.
export const PREFETCH_RADIUS = PROXIMITY_RADIUS + 3
export const PREFETCH_LIMIT = 6

// The floor of someone standing in the open office: outside every private area (their tile and their verified
// tile), meeting room and stage area, and not at a focus desk or in a focus call. Null anywhere else: nothing is
// prefetched across a closed door, inside a meeting room (its stage rules decide) or from someone focused.
export function openFloor(session: Session, uid: string): number | null {
    const player = session.getPlayer(uid)
    if (!player) return null
    const verified = session.featuresFor(uid).office.verifiedPosition(uid)
    if (!verified) return null
    const room = session.map_data.rooms[player.room]
    for (const { x, y } of [player, verified]) {
        if (room.tilemap[`${x}, ${y}`]?.privateAreaId) return null
        const config = areaConfig(room, areaAt(room, x, y))
        if (config?.meeting || config?.conversation === 'stage') return null
    }
    if (session.isFocused(uid) || session.focus.focusedOf(uid)) return null
    return player.room
}

// Per person, the PREFETCH_LIMIT nearest people (ties by uid) outside their conversation, in the open office of the
// same floor within PREFETCH_RADIUS, at least one of the two standing; sorted by uid. Not always symmetric once the limit applies.
export function prefetchCandidates(session: Session, open: Map<string, number | null> = openFloors(session)): Map<string, string[]> {
    const spots: { uid: string, room: number, x: number, y: number, seated: boolean, group: string | null }[] = []
    for (const [uid, room] of open) {
        if (room === null) continue
        const player = session.getPlayer(uid)
        const group = conversationGroupFor(session, uid)
        spots.push({ uid, room, x: player.x, y: player.y, seated: Boolean(session.roomFeatures[room].office.seatOf(uid)), group: group ? group.group : null })
    }
    const byUid = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
    const nearby = new Map<string, string[]>()
    for (const a of spots) {
        const around: { uid: string, distance: number }[] = []
        for (const b of spots) {
            if (b === a || b.room !== a.room || (a.seated && b.seated) || (a.group !== null && a.group === b.group)) continue
            const distance = (a.x - b.x) ** 2 + (a.y - b.y) ** 2
            if (distance <= PREFETCH_RADIUS ** 2) around.push({ uid: b.uid, distance })
        }
        if (!around.length) continue
        around.sort((p, q) => p.distance - q.distance || byUid(p.uid, q.uid))
        nearby.set(a.uid, around.slice(0, PREFETCH_LIMIT).map(other => other.uid).sort(byUid))
    }
    return nearby
}

function openFloors(session: Session): Map<string, number | null> {
    return new Map(session.getPlayerIds().map(uid => [uid, openFloor(session, uid)]))
}

export function mediaView(session: Session): MediaView {
    const view: MediaView = new Map()
    const open = openFloors(session)
    const nearby = prefetchCandidates(session, open)
    for (const uid of session.getPlayerIds()) {
        const meeting = session.meetingOf(uid)
        view.set(uid, { conversation: conversationChannelFor(session, uid), moderators: meeting ? meeting.moderators : null, speakers: session.featuresFor(uid).speakers.snapshotFor(uid), open: open.get(uid) ?? null, nearby: nearby.get(uid) ?? [] })
    }
    return view
}

// Everything mediaView depends on, without hashing or scanning the room per person: same string, same view.
// Per person: their socket, the conversation group of their verified tile, their meeting area and whether they
// stand on its stage (the moderators of a meeting are exactly its members on the stage), the speakers they hear, and
// whether they stand in the open office with whom around them to prefetch.
export function mediaFingerprint(session: Session): string {
    let fingerprint = ''
    const open = openFloors(session)
    const nearby = prefetchCandidates(session, open)
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
        const floor = open.get(uid)
        fingerprint += `${uid}\u0001${player.socketId}\u0001${group ? `${group.room}:${group.group}` : ''}\u0001${stage ? `${player.room}:${areaId}:${onStage ? 1 : 0}` : ''}\u0001${heard}\u0001${floor ?? ''}:${nearby.get(uid)?.join(',') ?? ''}\n`
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
// Then, flagged `prefetch`, the microphone and camera of the prefetch candidates around you (both in the open office,
// see openFloor) who are not in your conversation. Never a screen (full resolution, no q layer): it is pulled when the
// conversation starts.
export function desiredPulls(view: MediaView, uid: string, publications: Iterable<Publication>): Map<string, WantedPull> {
    const me = view.get(uid)
    const wanted = new Map<string, WantedPull>()
    if (!me) return wanted
    for (const publication of publications) {
        if (publication.uid === uid) continue
        let prefetch = false
        if (publication.kind === 'speaker') {
            const speaker = publication.objectId ? me.speakers[publication.objectId] : undefined
            if (!speaker || speaker.ownerUid !== publication.uid || speaker.volume <= 0) continue
        } else if (me.conversation && view.get(publication.uid)?.conversation === me.conversation) {
            if (publication.kind === 'camera' && me.moderators && !me.moderators.includes(uid) && !me.moderators.includes(publication.uid)) continue
        } else if (publication.kind !== 'screen' && me.open !== null && me.nearby.includes(publication.uid) && view.get(publication.uid)?.open === me.open) {
            prefetch = true
        } else continue
        const key = pullKey(publication)
        const pull: WantedPull = { key, fromUid: publication.uid, kind: publication.kind, sessionId: publication.sessionId, trackName: publication.trackName, simulcast: publication.simulcast, prefetch }
        if (publication.objectId) pull.objectId = publication.objectId
        wanted.set(key, pull)
    }
    return wanted
}

// `failed`: pulls Cloudflare refused; not retried until the publisher republishes (new key).
// `flip`: tracks already pulled that change between prefetch and active: the same pull, no close and pull again.
export function diffPulls(current: ReadonlyMap<string, { prefetch?: boolean }>, wanted: ReadonlyMap<string, WantedPull>, failed: ReadonlySet<string> = new Set()): { add: WantedPull[], remove: string[], flip: WantedPull[] } {
    const add: WantedPull[] = [], flip: WantedPull[] = []
    for (const pull of wanted.values()) {
        const pulled = current.get(pull.key)
        if (!pulled) { if (!failed.has(pull.key)) add.push(pull) }
        else if (Boolean(pulled.prefetch) !== pull.prefetch) flip.push(pull)
    }
    return { add, remove: [...current.keys()].filter(key => !wanted.has(key)), flip }
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
