import io, { Socket } from 'socket.io-client'
import { createClient } from '../supabase/client'
import { request } from './requests'

export type JoinedPosition = { roomIndex: number, x: number, y: number }

type ConnectionResponse = {
    success: boolean
    errorMessage: string
    // Where the server placed the visitor (their last tile after a quick reload); older servers send nothing.
    position?: JoinedPosition
}

function joinedPosition(joined: unknown): JoinedPosition | undefined {
    const value = joined as Partial<JoinedPosition> | null | undefined
    if (!value || !Number.isInteger(value.roomIndex) || !Number.isInteger(value.x) || !Number.isInteger(value.y)) return undefined
    return { roomIndex: value.roomIndex!, x: value.x!, y: value.y! }
}

const backend_url: string = process.env.NEXT_PUBLIC_BACKEND_URL as string

class Server {
    public socket: Socket = {} as Socket
    private connected: boolean = false

    public async connect(realmId: string, uid: string, shareId: string, displayName: string) {
        this.socket = io(backend_url, {
        reconnection: true,
        autoConnect: false,
        reconnectionAttempts: 30,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 5000,
        transports: ['websocket', 'polling'],
        tryAllTransports: true,
        auth: (callback) => {
            void createClient().auth.getSession().then(({ data, error }) => {
                callback({ token: !error && data.session?.user.id === uid ? data.session.access_token : '' })
            }).catch(() => callback({ token: '' }))
        },
        query: {
            uid
        }
    })

        return new Promise<ConnectionResponse>((resolve) => {
            let settled = false
            const finish = (success: boolean, errorMessage = '', position?: JoinedPosition) => {
                if (settled) return
                settled = true
                clearTimeout(deadline)
                this.socket.off('connect_error', onConnectError)
                this.socket.io.off('reconnect_failed', onReconnectFailed)
                if (!success) this.disconnect()
                resolve(position ? { success, errorMessage, position } : { success, errorMessage })
            }

            let lastConnectError = ''
            const onConnectError = (err: Error) => {
                console.warn('Connection attempt failed:', err.message)
                lastConnectError = err.message
                if (/^Invalid (access token|uid)/.test(err.message)) {
                    finish(false, 'Sua sessão expirou. Atualize a página e entre novamente.')
                }
            }

            const onReconnectFailed = () => {
                finish(false, 'The server is unavailable. Please try again shortly.')
            }

            const deadline = setTimeout(() => {
                finish(false, lastConnectError
                    ? `Não foi possível conectar ao servidor (${lastConnectError}). Tente novamente.`
                    : 'O servidor demorou demais para responder. Tente novamente.')
            }, 150000)

            this.socket.on('connect', () => {
                this.connected = true

                this.socket.emit('joinRealm', {
                    realmId,
                    shareId,
                    displayName,
                })
            })

            this.socket.on('disconnect', () => { this.connected = false })
            this.socket.once('joinedRealm', (joined?: unknown) => finish(true, '', joinedPosition(joined)))

            this.socket.once('failedToJoinRoom', (reason: string) => finish(false, reason))

            this.socket.on('connect_error', onConnectError)
            this.socket.io.on('reconnect_failed', onReconnectFailed)
            this.socket.connect()
        })
    }

    public disconnect() {
        this.connected = false
        this.socket.disconnect()
    }

    public async getPlayersInRoom(roomIndex: number) {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return { data: null, error: { message: 'No session provided' } }

        return request('/getPlayersInRoom', {
            roomIndex: roomIndex,
        }, session.access_token)
    }
}

const server = new Server()

export { server }
