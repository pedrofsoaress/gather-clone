import { Server } from 'socket.io'
import { JoinRealm, Disconnect, OnEventCallback, MovePlayer, Teleport, ChangedSkin, NewMessage, ChatMessage, OfficeStep, OfficeAction, OfficeReadNotes, OfficeAddNote, OfficeExternalGet, OfficeExternalSetRoom } from './socket-types'
import { z } from 'zod'
import { supabase } from '../supabase'
import { users } from '../Users'
import { sessionManager } from '../session'
import { removeExtraSpaces } from '../utils'
import { kickPlayer } from './helpers'
import { formatEmailToName } from '../utils'
import { OfficeNotes, validNoteObject } from '../office/OfficeNotes'
import { canReceiveNearbyChat } from '../office/chat'
import { randomUUID } from 'crypto'

const joiningInProgress = new Set<string>()
const officeNotes = new OfficeNotes(supabase)

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
            if (session.officeState.expire()) io.to(session.id).emit('officeStateChanged', session.officeState.snapshot())
        }
    }, 250).unref()

    // Handle a connection
    io.on('connection', (socket) => {

        function on(eventName: string, schema: z.ZodTypeAny, callback: OnEventCallback) {
            socket.on(eventName, (data: any) => {
                const success = schema.safeParse(data).success
                if (!success) return

                const session = sessionManager.getPlayerSession(socket.handshake.query.uid as string)
                if (!session) {
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
            const socketIds = sessionManager.getSocketIdsInRoom(session.id, session.getPlayerRoom(uid))
            const success = sessionManager.logOutBySocketId(socket.id)
            if (success) {
                emitToSocketIds(socketIds, 'playerLeftRoom', uid)
                users.removeUser(uid)
                io.to(session.id).emit('officeStateChanged', session.officeState.snapshot())
            }
        })

        socket.on('officeGetSnapshot', (ack: unknown) => {
            if (typeof ack !== 'function') return
            const uid = socket.handshake.query.uid as string
            const session = sessionManager.getPlayerSession(uid)
            ack(session ? { ok: true, snapshot: session.officeState.snapshot() } : { ok: false, error: 'Fora do escritório.' })
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

                const waitMs = Math.max(0, lastOfficeStepAt + 80 - Date.now())
                if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs))
                if (session.getPlayer(uid)?.socketId !== socket.id) {
                    if (typeof ack === 'function') ack({ ok: false, error: 'Visitante desconectado.' })
                    return
                }
                const result = session.officeState.step(uid, parsed.data)
                if (result.ok) lastOfficeStepAt = Date.now()
                if (typeof ack === 'function') ack(result)
                if (result.ok && result.changed) io.to(session.id).emit('officeStateChanged', session.officeState.snapshot())
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
            const result = session.officeState.apply(uid, parsed.data)
            ack(result.ok ? result : { ...result, verifiedPosition: session.officeState.verifiedPosition(uid) })
            if (result.changed) io.to(session.id).emit('officeStateChanged', session.officeState.snapshot())
            if (result.ok && result.effect) io.to(session.id).emit('officeEffect', {
                objectId: parsed.data.objectId, effect: result.effect, uid, name: session.getPlayer(uid).username,
            })
        })

        const externalTarget = (objectId: string) => {
            const uid = socket.handshake.query.uid as string
            const session = sessionManager.getPlayerSession(uid)
            const player = session?.getPlayer(uid)
            if (!session || !player || player.socketId !== socket.id || player.room !== session.map_data.spawnpoint.roomIndex) return null
            return { uid, session, objectId, room: player.room }
        }

        socket.on('officeExternalGet', async (raw: unknown, ack: unknown) => {
            if (typeof ack !== 'function') return
            await officeStepQueue
            const parsed = OfficeExternalGet.safeParse(raw)
            const target = parsed.success ? externalTarget(parsed.data.objectId) : null
            ack(target ? target.session.externalObjects.get(target.uid, target.objectId) : { ok: false, error: 'Aproxime-se do quadro.' })
        })

        socket.on('officeExternalSetRoom', async (raw: unknown, ack: unknown) => {
            if (typeof ack !== 'function') return
            await officeStepQueue
            const parsed = OfficeExternalSetRoom.safeParse(raw)
            const target = parsed.success ? externalTarget(parsed.data.objectId) : null
            if (!target || !parsed.success) return ack({ ok: false, error: 'Aproxime-se do quadro.' })
            const result = target.session.externalObjects.setRoom(target.uid, target.objectId, parsed.data.url, parsed.data.revision)
            ack(result)
            if (result.ok) emitToSocketIds(sessionManager.getSocketIdsInRoom(target.session.id, target.room), 'officeExternalState', { objectId: target.objectId, url: result.url, revision: result.revision })
        })

        const noteTarget = (objectId: string) => {
            const uid = socket.handshake.query.uid as string
            const session = sessionManager.getPlayerSession(uid)
            const player = session?.getPlayer(uid)
            if (!session || !player || player.socketId !== socket.id) return null
            const room = session.map_data.rooms[player.room]
            if (!room || !validNoteObject(room, objectId) || !session.officeState.isNear(uid, objectId)) return null
            const object = session.officeState.getObject(objectId)
            if (!object || !['board', 'desk', 'guestbook'].includes(object.kind)) return null
            return { session, player, object }
        }

        socket.on('officeReadNotes', async (raw: unknown, ack: unknown) => {
            if (typeof ack !== 'function') return
            await officeStepQueue
            const parsed = OfficeReadNotes.safeParse(raw)
            const target = parsed.success ? noteTarget(parsed.data.objectId) : null
            if (!parsed.success || !target) return ack({ ok: false, error: 'Aproxime-se do objeto para usá-lo.' })
            try {
                const notes = await officeNotes.list(target.session.id, target.object.id)
                ack({ ok: true, notes })
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
                    objectId: target.object.id,
                    uid: target.player.uid,
                    author: target.player.username,
                    kind: target.object.kind as 'board' | 'desk' | 'guestbook',
                    body: parsed.data.body,
                })
                ack(result)
                if (result.ok && result.note) io.to(target.session.id).emit('officeNoteCreated', result.note)
            } catch {
                ack({ ok: false, error: 'Não foi possível salvar o recado.' })
            }
        })

        on('movePlayer', MovePlayer, ({ session, data }) => {  
            const player = session.getPlayer(socket.handshake.query.uid as string)
            const changedPlayers = session.movePlayer(player.uid, data.x, data.y)

            emit('playerMoved', {
                uid: player.uid,
                x: player.x,
                y: player.y
            })

            for (const uid of changedPlayers) {
                const changedPlayerData = session.getPlayer(uid)

                emitToSocketIds([changedPlayerData.socketId], 'proximityUpdate', {
                    proximityId: changedPlayerData.proximityId
                })
            }
        })  

        on('teleport', Teleport, ({ session, data }) => {
            const uid = socket.handshake.query.uid as string
            const player = session.getPlayer(uid)
            if (player.room !== data.roomIndex) {
                emit('playerLeftRoom', uid)
                const session = sessionManager.getPlayerSession(uid)
                const changedPlayers = session.changeRoom(uid, data.roomIndex, data.x, data.y)
                emit('playerJoinedRoom', player)

                for (const uid of changedPlayers) {
                    const changedPlayerData = session.getPlayer(uid)

                    emitToSocketIds([changedPlayerData.socketId], 'proximityUpdate', {
                        proximityId: changedPlayerData.proximityId
                    })
                }
            } else {
                const changedPlayers = session.movePlayer(player.uid, data.x, data.y)
                emit('playerTeleported', { uid, x: player.x, y: player.y })

                for (const uid of changedPlayers) {
                    const changedPlayerData = session.getPlayer(uid)

                    emitToSocketIds([changedPlayerData.socketId], 'proximityUpdate', {
                        proximityId: changedPlayerData.proximityId
                    })
                }
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
            const senderPosition = session.officeState.verifiedPosition(uid)
            const recipients = session.getPlayersInRoom(sender.room).filter(recipient => {
                if (channel === 'public') return true
                return canReceiveNearbyChat(senderPosition, session.officeState.verifiedPosition(recipient.uid))
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
