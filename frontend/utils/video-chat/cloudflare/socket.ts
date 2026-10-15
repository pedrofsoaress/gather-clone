import { server } from '../../backend/server'
import type { SignalingSocket } from './protocol'

export const REQUEST_TIMEOUT_MS = 8000

// The office socket, read on every call: a new visit replaces `server.socket`.
export function officeSocket(): SignalingSocket {
    return {
        on: (event, handler) => { server.socket.on(event, handler) },
        off: (event, handler) => { server.socket.off(event, handler) },
        request: async (event, payload, timeoutMs = REQUEST_TIMEOUT_MS) => {
            const reply = await server.socket.timeout(timeoutMs).emitWithAck(event, payload) as { ok?: boolean, error?: string } | undefined
            if (!reply?.ok) throw new Error(reply?.error || 'O servidor recusou o pedido de vídeo.')
            return reply as never
        },
    }
}
