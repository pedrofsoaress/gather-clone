import io, { Socket } from 'socket.io-client'
import { createClient } from '../supabase/client'
import { request } from './requests'

type ConnectionResponse = {
    success: boolean
    errorMessage: string
}

const backend_url: string = process.env.NEXT_PUBLIC_BACKEND_URL as string

class Server {
    public socket: Socket = {} as Socket
    private connected: boolean = false

    public async connect(realmId: string, uid: string, shareId: string, access_token: string) {
        this.socket = io(backend_url, {
        reconnection: true,
        autoConnect: false,
        reconnectionAttempts: 30,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 5000,
        transportOptions: {
            polling: {
                extraHeaders: {
                    'Authorization': `Bearer ${access_token}`
                }
            }
        },
        query: {
            uid
        }
    })

        return new Promise<ConnectionResponse>((resolve) => {
            let settled = false
            const finish = (success: boolean, errorMessage = '') => {
                if (settled) return
                settled = true
                clearTimeout(deadline)
                this.socket.off('connect_error', onConnectError)
                this.socket.io.off('reconnect_failed', onReconnectFailed)
                if (!success) this.disconnect()
                resolve({ success, errorMessage })
            }

            const onConnectError = (err: Error) => {
                console.warn('Connection attempt failed:', err.message)
                if (/^Invalid (access token|uid)/.test(err.message)) {
                    finish(false, err.message)
                }
            }

            const onReconnectFailed = () => {
                finish(false, 'The server is unavailable. Please try again shortly.')
            }

            const deadline = setTimeout(() => {
                finish(false, 'The server took too long to start. Please try again.')
            }, 150000)

            this.socket.on('connect', () => {
                this.connected = true

                this.socket.emit('joinRealm', {
                    realmId,
                    shareId
                })
            })

            this.socket.on('disconnect', () => { this.connected = false })
            this.socket.once('joinedRealm', () => finish(true))

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
