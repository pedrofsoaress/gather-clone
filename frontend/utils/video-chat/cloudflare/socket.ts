import type { Socket } from 'socket.io-client'
import { server } from '../../backend/server'
import type { SignalingSocket } from './protocol'

export const REQUEST_TIMEOUT_MS = 8000

async function ask<T>(socket: Socket, event: string, payload: unknown, timeoutMs: number): Promise<T> {
    const reply = await socket.timeout(timeoutMs).emitWithAck(event, payload) as { ok?: boolean, error?: string } | undefined
    if (!reply?.ok) throw new Error(reply?.error || 'O servidor recusou o pedido de vídeo.')
    return reply as never
}

// The office socket, read on every call: a new visit replaces `server.socket`.
export function officeSocket(): SignalingSocket {
    return {
        on: (event, handler) => { server.socket.on(event, handler) },
        off: (event, handler) => { server.socket.off(event, handler) },
        request: (event, payload, timeoutMs = REQUEST_TIMEOUT_MS) => ask(server.socket, event, payload, timeoutMs),
    }
}

// The office socket of now, kept even after a new visit replaces `server.socket`: handlers added through it are
// removed from the socket they were added to.
export function pinnedOfficeSocket(): SignalingSocket {
    const socket = server.socket
    return {
        on: (event, handler) => { socket.on(event, handler) },
        off: (event, handler) => { socket.off(event, handler) },
        request: (event, payload, timeoutMs = REQUEST_TIMEOUT_MS) => ask(socket, event, payload, timeoutMs),
    }
}

// Which socket.io socket `officeSocket()` talks to right now; a new value means the office socket was replaced.
export function currentOfficeSocket(): unknown { return server.socket }
