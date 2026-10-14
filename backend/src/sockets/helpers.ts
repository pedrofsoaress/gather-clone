import { sessionManager, Session } from '../session'
import { io } from '..'

// Pushes the Agora token of the conversation `uid` is in now, so the client
// has it before deciding to join. Nothing when it is unchanged or the server has no credentials.
export function sendConversationToken(session: Session, uid: string) {
    const player = session.getPlayer(uid)
    if (!player) return
    const next = session.conversationTokens.next(session, uid)
    if (next) io.to(player.socketId).emit('conversationToken', next)
}

// Tells each player in `changed` which proximity call they are in now.
export function sendProximity(session: Session, changed: Iterable<string>) {
    for (const changedUid of changed) {
        const player = session.getPlayer(changedUid)
        if (!player) continue
        sendConversationToken(session, changedUid)
        io.to(player.socketId).emit('proximityUpdate', { proximityId: player.proximityId })
    }
}

// Sends the meeting `uid` is in to all of its members.
export function sendMeeting(session: Session, uid: string) {
    const meeting = session.meetingOf(uid)
    if (!meeting) return
    const snapshot = meeting.state.snapshot(meeting.areaId, meeting.moderators)
    for (const member of meeting.members) io.to(session.getPlayer(member).socketId).emit('meetingState', snapshot)
}

// `uid` left `meeting` (read before they moved or logged out): the rest get the new state, an empty one resets.
export function leaveMeeting(session: Session, uid: string, meeting: ReturnType<Session['meetingOf']>) {
    if (!meeting) return
    const remaining = session.leaveMeeting(uid, meeting)
    if (remaining) sendMeeting(session, remaining)
}

// Everyone in the session (every floor) gets the full list of who is online and where,
// only when it changed: someone arrived, left, or moved to another floor or area.
export function sendPresence(session: Session) {
    if (!session.presence.takeChange()) return
    const snapshot = session.presence.snapshot()
    for (const player of Object.values(session.players)) io.to(player.socketId).emit('presence', snapshot)
}

// `sessionEnding`: everyone is being kicked (the realm changed or was deleted), so nobody
// needs the shrinking online list, one snapshot per remaining person per kick.
export function kickPlayer(uid: string, reason: string, { sessionEnding = false }: { sessionEnding?: boolean } = {}) {
    const session = sessionManager.getPlayerSession(uid)
    const room = session.getPlayerRoom(uid)
    const players = session.getPlayersInRoom(room)
    const meeting = session.meetingOf(uid)

    for (const player of players) {
        if (player.uid === uid) {
            io.to(player.socketId).emit('kicked', reason)
        } else {
            io.to(player.socketId).emit('playerLeftRoom', uid)
        }
    }

    const player = session.getPlayer(uid)
    io.sockets.sockets.get(player.socketId)?.leave(session.id)
    // player is already in session, kick them
    sessionManager.logOutPlayer(uid)
    if (!sessionEnding) sendPresence(session)
    leaveMeeting(session, uid, meeting)
    sendProximity(session, session.setProximityIdsWithPlayer(uid))
    const features = session.roomFeatures[room]
    for (const remaining of session.getPlayersInRoom(room)) {
        io.to(remaining.socketId).emit('presentationState', features.presentations.snapshot())
        io.to(remaining.socketId).emit('speakerState', features.speakers.snapshotFor(remaining.uid))
        io.to(remaining.socketId).emit('avatarState', features.avatars.snapshot())
        io.to(remaining.socketId).emit('officeStateChanged', features.office.snapshot())
    }
}
