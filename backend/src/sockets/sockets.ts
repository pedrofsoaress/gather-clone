import { Server } from 'socket.io'
import { JoinRealm, Disconnect, OnEventCallback, MovePlayer, Teleport, ChangedSkin, NewMessage, ChatMessage, OfficeStep, OfficeAction, OfficeReadNotes, OfficeAddNote, OfficeExternalGet, OfficeExternalSetRoom, PresentationTarget, PresentationSlide } from './socket-types'
import { z } from 'zod'
import { supabase } from '../supabase'
import { users } from '../Users'
import { sessionManager, Session } from '../session'
import { SpeakerTarget, AvatarAction, AvatarRun } from './socket-types'
import { removeExtraSpaces } from '../utils'
import { kickPlayer } from './helpers'
import { formatEmailToName } from '../utils'
import { OfficeNotes, validNoteObject, noteStorageKey } from '../office/OfficeNotes'
import { canReceiveNearbyChat } from '../office/chat'
import { randomUUID } from 'crypto'

const joiningInProgress = new Set<string>()
const officeNotes = new OfficeNotes(supabase)

function broadcastRoom(io: Server, session: Session, room: number, event: string, state: unknown) {
    for (const player of session.getPlayersInRoom(room)) io.to(player.socketId).emit(event, state)
}

function broadcastSpeakers(io: Server, session: Session, room?: number) {
    for (const player of Object.values(session.players)) {
        if (room === undefined || player.room === room) io.to(player.socketId).emit('speakerState', session.featuresFor(player.uid).speakers.snapshotFor(player.uid))
    }
}

function broadcastRoomFeatures(io: Server, session: Session, room: number) {
    const features = session.roomFeatures[room]
    broadcastRoom(io, session, room, 'officeStateChanged', features.office.snapshot())
    broadcastRoom(io, session, room, 'presentationState', features.presentations.snapshot())
    broadcastRoom(io, session, room, 'avatarState', features.avatars.snapshot())
    broadcastSpeakers(io, session, room)
}

function protectConnection(io: Server) {
    io.use(async (socket, next) => {
        const access_token = socket.handshake.headers['authorization']?.split(' ')[1]
        const uid = socket.handshake.query.uid as string
        if (!access_token || !uid) {
            const error = new Error("Invalid access token or uid.")
            return next(error)
        } else {
            const { data: user, error: error } = await supabase.auth.getUser(access_token)
            if (error) {
                return next(new Error("Invalid access token."))
            }
            if (!user || user.user.id !== uid) {
                return next(new Error("Invalid uid."))
            }
            users.addUser(uid, user.user)
            next()
        }
    })
}


export function sockets(io: Server) {
    protectConnection(io)

    setInterval(() => {
        for (const session of sessionManager.activeSessions()) {
            session.roomFeatures.forEach((features, room) => {
                if (features.office.expire()) broadcastRoom(io, session, room, 'officeStateChanged', features.office.snapshot())
                if (features.speakers.expire()) broadcastSpeakers(io, session, room)
            })
        }
    }, 250).unref()

    // Handle a connection
    io.on('connection', (socket) => {

        function on(eventName: string, schema: z.ZodTypeAny, callback: OnEventCallback) {
            socket.on(eventName, (data: any) => {
                const success = schema.safeParse(data).success
                if (!success) return

                const session = sessionManager.getPlayerSession(socket.handshake.query.uid as string)
                if (!session || (eventName !== 'disconnect' && session.getPlayer(socket.handshake.query.uid as string)?.socketId !== socket.id)) {
                    return
                }
                callback({ session, data })
            })
        }

        function emit(eventName: string, data: any) {
            const session = sessionManager.getPlayerSession(socket.handshake.query.uid as string)
            if (!session) {
                return
            }

            const room = session.getPlayerRoom(socket.handshake.query.uid as string)
            const players = session.getPlayersInRoom(room)

            for (const player of players) {
                if (player.socketId === socket.id) continue

                io.to(player.socketId).emit(eventName, data)
            }
        }

        function emitToSocketIds(socketIds: string[], eventName: string, data: any) {
            for (const socketId of socketIds) {
                io.to(socketId).emit(eventName, data)
            }
        }

        socket.on('joinRealm', async (realmData: z.infer<typeof JoinRealm>) => {
            const uid = socket.handshake.query.uid as string
            const rejectJoin = (reason: string) => {
                socket.emit('failedToJoinRoom', reason)
                joiningInProgress.delete(uid)
            }

            const joinRequest = JoinRealm.safeParse(realmData)
            if (!joinRequest.success) {
                return rejectJoin('Invalid request data.')
            }

            if (joiningInProgress.has(uid)) {
                socket.emit('failedToJoinRoom', 'Already joining a space.')
                return
            }
            joiningInProgress.add(uid)

            const session = sessionManager.getSession(realmData.realmId)
            if (session) {
                const playerCount = session.getPlayerCount()
                if (playerCount >= 30) {
                    return rejectJoin("Space is full. It's 30 players max.")
                } 
            }

            const { data, error } = await supabase.from('realms').select('owner_id, share_id, map_data, only_owner').eq('id', realmData.realmId).single()

            if (error || !data) {
                return rejectJoin('Space not found.')
            }
            const { data: profile, error: profileError } = await supabase.from('profiles').select('skin').eq('id', uid).single()
            if (profileError) {
                return rejectJoin('Failed to get profile.')
            }

            const realm = data

            const join = async () => {
                if (!sessionManager.getSession(realmData.realmId)) {
                    sessionManager.createSession(realmData.realmId, data.map_data)
                }

                const currentSession = sessionManager.getPlayerSession(uid)
                if (currentSession) {
                    kickPlayer(uid, 'You have logged in from another location.')
                }

                const user = users.getUser(uid)!
                const username = joinRequest.data.displayName ?? formatEmailToName(user.user_metadata.email)
                sessionManager.addPlayerToSession(socket.id, realmData.realmId, uid, username, profile.skin)
                const newSession = sessionManager.getPlayerSession(uid)
                const player = newSession.getPlayer(uid)   

                socket.join(realmData.realmId)
                socket.emit('joinedRealm')
                emit('playerJoinedRoom', player)
                joiningInProgress.delete(uid)
            }

            if (realm.owner_id === socket.handshake.query.uid) {
                return join()
            }

            if (realm.only_owner) {
                return rejectJoin('This realm is private right now. Come back later!')
            }

            if (realm.share_id === realmData.shareId) {
                return join()
            } else {
                return rejectJoin('The share link has been changed.')
            }
        })

        // Handle a disconnection
        on('disconnect', Disconnect, ({ session, data }) => {
            const uid = socket.handshake.query.uid as string
            const room = session.getPlayerRoom(uid)
            const socketIds = sessionManager.getSocketIdsInRoom(session.id, room)
            const success = sessionManager.logOutBySocketId(socket.id)
            if (success) {
                emitToSocketIds(socketIds, 'playerLeftRoom', uid)
                users.removeUser(uid)
                broadcastRoomFeatures(io, session, room)
                for (const changedUid of session.setProximityIdsWithPlayer(uid)) {
                    const player = session.getPlayer(changedUid)
                    io.to(player.socketId).emit('proximityUpdate', { proximityId: player.proximityId })
                }
            }
        })

        socket.on('officeGetSnapshot', (ack: unknown) => {
            if (typeof ack !== 'function') return
            const uid = socket.handshake.query.uid as string
            const session = sessionManager.getPlayerSession(uid)
            if (!session || session.getPlayer(uid)?.socketId !== socket.id) return ack({ ok: false, error: 'Fora do escritório.' })
            const changed = new Set([uid, ...session.setProximityIdsWithPlayer(uid)])
            for (const changedUid of changed) {
                const player = session.getPlayer(changedUid)
                io.to(player.socketId).emit('proximityUpdate', { proximityId: player.proximityId })
            }
            ack({ ok: true, snapshot: session.featuresFor(uid).office.snapshot() })
        })

        let officeStepQueue = Promise.resolve()
        let lastOfficeStepAt = -Infinity
        socket.on('officeStep', (raw: unknown, ack: unknown) => {
            officeStepQueue = officeStepQueue.then(async () => {
                const uid = socket.handshake.query.uid as string
                const parsed = OfficeStep.safeParse(raw)
                const session = sessionManager.getPlayerSession(uid)
                if (!parsed.success || !session || session.getPlayer(uid)?.socketId !== socket.id) {
                    if (typeof ack === 'function') ack({ ok: false, error: 'Posição inválida.' })
                    return
                }

                const features = session.featuresFor(uid)
                const stepMs = features.avatars.minimumStepMs(uid)
                const waitMs = Math.max(0, lastOfficeStepAt + stepMs - Date.now())
                if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs))
                if (session.getPlayer(uid)?.socketId !== socket.id) {
                    if (typeof ack === 'function') ack({ ok: false, error: 'Visitante desconectado.' })
                    return
                }
                const result = features.office.step(uid, parsed.data, stepMs)
                if (result.ok) {
                    lastOfficeStepAt = Date.now()
                    features.avatars.stopAction(uid)
                    if (Object.values(features.office.snapshot().occupancy).some(occupant => occupant.uid === uid)) features.avatars.setRunning(uid, false)
                    const changed = session.movePlayer(uid, parsed.data.x, parsed.data.y)
                    emit('playerMoved', { uid, ...parsed.data })
                    for (const changedUid of changed) {
                        const player = session.getPlayer(changedUid)
                        io.to(player.socketId).emit('proximityUpdate', { proximityId: player.proximityId })
                    }
                    broadcastRoom(io, session, session.getPlayerRoom(uid), 'avatarState', features.avatars.snapshot())
                }
                if (typeof ack === 'function') ack({ ...result, roomIndex: session.getPlayerRoom(uid), verifiedPosition: features.office.verifiedPosition(uid) })
                if (result.ok && result.changed) broadcastRoom(io, session, session.getPlayerRoom(uid), 'officeStateChanged', session.featuresFor(uid).office.snapshot())
                if (result.ok) {
                    if (features.speakers.expire()) broadcastSpeakers(io, session, session.getPlayerRoom(uid))
                    else socket.emit('speakerState', features.speakers.snapshotFor(uid))
                }
            }).catch(error => {
                console.error('officeStep failed', error)
                if (typeof ack === 'function') ack({ ok: false, error: 'Não foi possível mover.' })
            })
        })

        socket.on('officeAction', async (raw: unknown, ack: unknown) => {
            if (typeof ack !== 'function') return
            await officeStepQueue
            const uid = socket.handshake.query.uid as string
            const parsed = OfficeAction.safeParse(raw)
            const session = sessionManager.getPlayerSession(uid)
            if (!parsed.success || !session || session.getPlayer(uid)?.socketId !== socket.id) return ack({ ok: false, error: 'Ação inválida.' })
            const result = session.featuresFor(uid).office.apply(uid, parsed.data)
            if (result.ok && parsed.data.action === 'occupy') {
                session.featuresFor(uid).avatars.stopAction(uid)
                session.featuresFor(uid).avatars.setRunning(uid, false)
                broadcastRoom(io, session, session.getPlayerRoom(uid), 'avatarState', session.featuresFor(uid).avatars.snapshot())
            }
            ack(result.ok ? result : { ...result, verifiedPosition: session.featuresFor(uid).office.verifiedPosition(uid) })
            if (result.changed) broadcastRoom(io, session, session.getPlayerRoom(uid), 'officeStateChanged', session.featuresFor(uid).office.snapshot())
            if (result.ok && result.effect) broadcastRoom(io, session, session.getPlayerRoom(uid), 'officeEffect', {
                objectId: parsed.data.objectId, effect: result.effect, uid, name: session.getPlayer(uid).username,
            })
        })

        socket.on('speakerGetSnapshot', (ack: unknown) => {
            if (typeof ack !== 'function') return
            const uid = socket.handshake.query.uid as string
            const session = sessionManager.getPlayerSession(uid)
            ack(session?.getPlayer(uid)?.socketId === socket.id ? { ok: true, snapshot: session.featuresFor(uid).speakers.snapshotFor(uid) } : { ok: false })
        })

        socket.on('avatarGetSnapshot', (ack: unknown) => {
            if (typeof ack !== 'function') return
            const uid = socket.handshake.query.uid as string
            const session = sessionManager.getPlayerSession(uid)
            ack(session?.getPlayer(uid)?.socketId === socket.id ? { ok: true, snapshot: session.featuresFor(uid).avatars.snapshot() } : { ok: false })
        })

        for (const event of ['avatarAction', 'avatarRun'] as const) socket.on(event, async (raw: unknown, ack: unknown) => {
            await officeStepQueue
            const uid = socket.handshake.query.uid as string
            const session = sessionManager.getPlayerSession(uid)
            const action = AvatarAction.safeParse(raw)
            const run = AvatarRun.safeParse(raw)
            if (!session || session.getPlayer(uid)?.socketId !== socket.id || (event === 'avatarAction' ? !action.success : !run.success)) return
            const avatars = session.featuresFor(uid).avatars
            const result = event === 'avatarAction' && action.success ? avatars.setAction(uid, action.data.action, action.data.objectId) : run.success ? avatars.setRunning(uid, run.data.running) : { ok: false }
            if (typeof ack === 'function') ack(result)
            if (result.ok) broadcastRoom(io, session, session.getPlayerRoom(uid), 'avatarState', avatars.snapshot())
        })

        for (const event of ['speakerStart', 'speakerStop'] as const) socket.on(event, async (raw: unknown, ack: unknown) => {
            if (typeof ack !== 'function') return
            await officeStepQueue
            const parsed = SpeakerTarget.safeParse(raw)
            const uid = socket.handshake.query.uid as string
            const session = sessionManager.getPlayerSession(uid)
            if (!parsed.success || session?.getPlayer(uid)?.socketId !== socket.id) return ack({ ok: false, error: 'Sessão inválida.' })
            const result = event === 'speakerStart' ? session.featuresFor(uid).speakers.start(uid, parsed.data.objectId) : session.featuresFor(uid).speakers.stop(uid, parsed.data.objectId)
            ack(result)
            if (result.ok) broadcastSpeakers(io, session)
        })

        const externalTarget = (objectId: string) => {
            const uid = socket.handshake.query.uid as string
            const session = sessionManager.getPlayerSession(uid)
            const player = session?.getPlayer(uid)
            if (!session || !player || player.socketId !== socket.id) return null
            return { uid, session, objectId, room: player.room }
        }

        socket.on('officeExternalGet', async (raw: unknown, ack: unknown) => {
            if (typeof ack !== 'function') return
            await officeStepQueue
            const parsed = OfficeExternalGet.safeParse(raw)
            const target = parsed.success ? externalTarget(parsed.data.objectId) : null
            ack(target ? target.session.featuresFor(target.uid).external.get(target.uid, target.objectId) : { ok: false, error: 'Aproxime-se do quadro.' })
        })

        socket.on('officeExternalSetRoom', async (raw: unknown, ack: unknown) => {
            if (typeof ack !== 'function') return
            await officeStepQueue
            const parsed = OfficeExternalSetRoom.safeParse(raw)
            const target = parsed.success ? externalTarget(parsed.data.objectId) : null
            if (!target || !parsed.success) return ack({ ok: false, error: 'Aproxime-se do quadro.' })
            const result = target.session.featuresFor(target.uid).external.setRoom(target.uid, target.objectId, parsed.data.url, parsed.data.revision)
            ack(result)
            if (result.ok) emitToSocketIds(sessionManager.getSocketIdsInRoom(target.session.id, target.room), 'officeExternalState', { objectId: target.objectId, url: result.url, revision: result.revision })
        })

        const presentationTarget = (objectId: string) => {
            const uid = socket.handshake.query.uid as string
            const session = sessionManager.getPlayerSession(uid)
            const player = session?.getPlayer(uid)
            if (!session || !player || player.socketId !== socket.id) return null
            return { uid, session, objectId, room: player.room }
        }

        const broadcastPresentations = (session: Session, room: number) => broadcastRoom(io, session, room, 'presentationState', session.roomFeatures[room].presentations.snapshot())

        socket.on('presentationGetSnapshot', (ack: unknown) => {
            if (typeof ack !== 'function') return
            const uid = socket.handshake.query.uid as string
            const session = sessionManager.getPlayerSession(uid)
            const player = session?.getPlayer(uid)
            ack(session && player?.socketId === socket.id ? { ok: true, snapshot: session.featuresFor(uid).presentations.snapshot() } : { ok: false, error: 'Fora da sala.' })
        })

        socket.on('presentationStart', async (raw: unknown, ack: unknown) => {
            if (typeof ack !== 'function') return
            await officeStepQueue
            const parsed = PresentationTarget.safeParse(raw)
            const target = parsed.success ? presentationTarget(parsed.data.objectId) : null
            if (!target) return ack({ ok: false, error: 'Aproxime-se da apresentação.' })
            const result = target.session.featuresFor(target.uid).presentations.start(target.uid, target.objectId)
            ack(result)
            if (result.ok) broadcastPresentations(target.session, target.room)
        })

        socket.on('presentationSlide', (raw: unknown, ack: unknown) => {
            if (typeof ack !== 'function') return
            const parsed = PresentationSlide.safeParse(raw)
            const target = parsed.success ? presentationTarget(parsed.data.objectId) : null
            if (!target || !parsed.success) return ack({ ok: false, error: 'Comando inválido.' })
            const result = target.session.featuresFor(target.uid).presentations.slide(target.uid, target.objectId, parsed.data.index, parsed.data.revision)
            ack(result)
            if (result.ok) broadcastPresentations(target.session, target.room)
        })

        socket.on('presentationRaiseHand', (raw: unknown, ack: unknown) => {
            if (typeof ack !== 'function') return
            const parsed = PresentationTarget.safeParse(raw)
            const target = parsed.success ? presentationTarget(parsed.data.objectId) : null
            if (!target) return ack({ ok: false, error: 'Fora da sala.' })
            const result = target.session.featuresFor(target.uid).presentations.raiseHand(target.uid, target.objectId)
            ack(result)
            if (result.ok) broadcastPresentations(target.session, target.room)
        })

        socket.on('presentationEnd', (raw: unknown, ack: unknown) => {
            if (typeof ack !== 'function') return
            const parsed = PresentationTarget.safeParse(raw)
            const target = parsed.success ? presentationTarget(parsed.data.objectId) : null
            if (!target) return ack({ ok: false, error: 'Fora da sala.' })
            const result = target.session.featuresFor(target.uid).presentations.end(target.uid, target.objectId)
            ack(result)
            if (result.ok) broadcastPresentations(target.session, target.room)
        })

        const noteTarget = (objectId: string) => {
            const uid = socket.handshake.query.uid as string
            const session = sessionManager.getPlayerSession(uid)
            const player = session?.getPlayer(uid)
            if (!session || !player || player.socketId !== socket.id) return null
            const room = session.map_data.rooms[player.room]
            if (!room || !validNoteObject(room, objectId) || !session.featuresFor(uid).office.isNear(uid, objectId)) return null
            const object = session.featuresFor(uid).office.getObject(objectId)
            if (!object || !['board', 'desk', 'guestbook'].includes(object.kind)) return null
            return { session, player, object, roomIndex: player.room, storageKey: noteStorageKey(player.room, session.map_data.spawnpoint.roomIndex, object.id) }
        }

        socket.on('officeReadNotes', async (raw: unknown, ack: unknown) => {
            if (typeof ack !== 'function') return
            await officeStepQueue
            const parsed = OfficeReadNotes.safeParse(raw)
            const target = parsed.success ? noteTarget(parsed.data.objectId) : null
            if (!parsed.success || !target) return ack({ ok: false, error: 'Aproxime-se do objeto para usá-lo.' })
            try {
                const notes = await officeNotes.list(target.session.id, target.storageKey)
                ack({ ok: true, notes: notes.map(note => ({ ...note, objectId: target.object.id })) })
            } catch {
                ack({ ok: false, error: 'Não foi possível carregar os recados.' })
            }
        })

        socket.on('officeAddNote', async (raw: unknown, ack: unknown) => {
            if (typeof ack !== 'function') return
            await officeStepQueue
            const parsed = OfficeAddNote.safeParse(raw)
            const target = parsed.success ? noteTarget(parsed.data.objectId) : null
            if (!parsed.success || !target) return ack({ ok: false, error: 'Aproxime-se do objeto para usá-lo.' })
            try {
                const result = await officeNotes.add({
                    realmId: target.session.id,
                    objectId: target.storageKey,
                    uid: target.player.uid,
                    author: target.player.username,
                    kind: target.object.kind as 'board' | 'desk' | 'guestbook',
                    body: parsed.data.body,
                })
                const resultForRoom = result.note ? { ...result, note: { ...result.note, objectId: target.object.id } } : result
                ack(resultForRoom)
                if (resultForRoom.ok && resultForRoom.note) broadcastRoom(io, target.session, target.roomIndex, 'officeNoteCreated', resultForRoom.note)
            } catch {
                ack({ ok: false, error: 'Não foi possível salvar o recado.' })
            }
        })

        // Movement and proximity use only the route steps accepted above.
        socket.on('teleport', async (raw: unknown, ack: unknown) => {
            if (typeof ack !== 'function') return
            await officeStepQueue
            const uid = socket.handshake.query.uid as string
            const session = sessionManager.getPlayerSession(uid)
            const player = session?.getPlayer(uid)
            if (!session || !player || player.socketId !== socket.id) return ack({ ok: false, error: 'Sessão inválida.' })
            const oldRoom = player.room
            const position = session.featuresFor(uid).office.verifiedPosition(uid)
            const parsed = Teleport.safeParse(raw)
            const reject = () => ack({ ok: false, error: 'Passagem indisponível.', roomIndex: oldRoom, verifiedPosition: position })
            if (!parsed.success) return reject()
            const data = parsed.data
            const source = position ? session.map_data.rooms[oldRoom].tilemap[`${position.x}, ${position.y}`]?.teleporter : undefined
            const destination = session.map_data.rooms[data.roomIndex]?.tilemap[`${data.x}, ${data.y}`]
            if (!source || source.roomIndex !== data.roomIndex || source.x !== data.x || source.y !== data.y || !destination || destination.impassable) return reject()
            if (oldRoom !== data.roomIndex) emit('playerLeftRoom', uid)
            const changedPlayers = session.changeRoom(uid, data.roomIndex, data.x, data.y)
            ack({ ok: true, proximityId: player.proximityId, roomIndex: player.room, verifiedPosition: session.featuresFor(uid).office.verifiedPosition(uid) })
            if (oldRoom !== data.roomIndex) emit('playerJoinedRoom', player)
            else emit('playerTeleported', { uid, x: player.x, y: player.y })
            broadcastRoomFeatures(io, session, oldRoom)
            if (oldRoom !== data.roomIndex) broadcastRoomFeatures(io, session, data.roomIndex)
            for (const changedUid of changedPlayers) {
                const changedPlayer = session.getPlayer(changedUid)
                io.to(changedPlayer.socketId).emit('proximityUpdate', { proximityId: changedPlayer.proximityId })
            }
        })

        on('changedSkin', ChangedSkin, ({ session, data }) => {
            const uid = socket.handshake.query.uid as string
            const player = session.getPlayer(uid)
            player.skin = data
            emit('playerChangedSkin', { uid, skin: player.skin })
        })

        on('sendMessage', NewMessage, ({ session, data }) => {
            // cannot exceed 300 characters
            if (data.length > 300 || data.trim() === '') return

            const message = removeExtraSpaces(data)

            const uid = socket.handshake.query.uid as string
            emit('receiveMessage', { uid, message })
        })

        let lastChatAt = 0
        socket.on('sendChatMessage', async (raw: unknown, ack: unknown) => {
            if (typeof ack !== 'function') return
            await officeStepQueue
            const parsed = ChatMessage.safeParse(raw)
            const uid = socket.handshake.query.uid as string
            const session = sessionManager.getPlayerSession(uid)
            const sender = session?.getPlayer(uid)
            if (!parsed.success || !session || !sender || sender.socketId !== socket.id) {
                return ack({ ok: false, error: 'Mensagem inválida.' })
            }
            if (Date.now() - lastChatAt < 500) return ack({ ok: false, error: 'Aguarde um instante antes de enviar outra mensagem.' })
            const { channel } = parsed.data
            const text = removeExtraSpaces(parsed.data.text)
            const senderPosition = session.featuresFor(uid).office.verifiedPosition(uid)
            const recipients = session.getPlayersInRoom(sender.room).filter(recipient => {
                if (channel === 'public') return true
                return canReceiveNearbyChat(senderPosition, session.featuresFor(recipient.uid).office.verifiedPosition(recipient.uid))
            })
            if (channel === 'nearby' && recipients.length < 2) {
                return ack({ ok: false, error: 'Não há ninguém perto para receber esta mensagem.' })
            }
            const message = { id: randomUUID(), channel, text, uid, name: sender.username, sentAt: Date.now() }
            lastChatAt = Date.now()
            emitToSocketIds(recipients.map(recipient => recipient.socketId), 'receiveChatMessage', message)
            ack({ ok: true })
        })
    })
}
