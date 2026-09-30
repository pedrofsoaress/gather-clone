import { sessionManager } from '../session'
import { io } from '..'

export function kickPlayer(uid: string, reason: string) {
    const session = sessionManager.getPlayerSession(uid)
    const room = session.getPlayerRoom(uid)
    const players = session.getPlayersInRoom(room)

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
    for (const changedUid of session.setProximityIdsWithPlayer(uid)) {
        const changed = session.getPlayer(changedUid)
        io.to(changed.socketId).emit('proximityUpdate', { proximityId: changed.proximityId })
    }
    const features = session.roomFeatures[room]
    for (const remaining of session.getPlayersInRoom(room)) {
        io.to(remaining.socketId).emit('presentationState', features.presentations.snapshot())
        io.to(remaining.socketId).emit('speakerState', features.speakers.snapshotFor(remaining.uid))
        io.to(remaining.socketId).emit('avatarState', features.avatars.snapshot())
        io.to(remaining.socketId).emit('officeStateChanged', features.office.snapshot())
    }
}
