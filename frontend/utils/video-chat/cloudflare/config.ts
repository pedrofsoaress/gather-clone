import type { IceServer, MediaConfig } from './protocol'

const iceUrl = (url: unknown) => typeof url === 'string' && /^(stun|turns?):/.test(url)

function iceServer(raw: unknown): IceServer | null {
    const value = raw as { urls?: unknown, username?: unknown, credential?: unknown } | null
    if (!value || typeof value !== 'object') return null
    const urls = Array.isArray(value.urls) ? value.urls : [value.urls]
    if (!urls.length || !urls.every(iceUrl)) return null
    if ((value.username !== undefined && typeof value.username !== 'string') || (value.credential !== undefined && typeof value.credential !== 'string')) return null
    return {
        urls: value.urls as string | string[],
        ...(value.username !== undefined ? { username: value.username as string } : {}),
        ...(value.credential !== undefined ? { credential: value.credential as string } : {}),
    }
}

// The server's word on the provider of this office. Malformed input is ignored: the page keeps what it has.
export function parseMediaConfig(raw: unknown): MediaConfig | null {
    const value = raw as { provider?: unknown, iceServers?: unknown, bootstrap?: unknown, generation?: unknown } | null
    if (value?.provider === 'agora') return { provider: 'agora' }
    if (value?.provider !== 'cloudflare' || !Array.isArray(value.iceServers) || typeof value.bootstrap !== 'boolean') return null
    const generation = value.generation
    if (typeof generation !== 'number' || !Number.isSafeInteger(generation) || generation < 0) return null
    const iceServers = value.iceServers.map(iceServer)
    if (!iceServers.length || iceServers.some(server => !server)) return null
    return { provider: 'cloudflare', iceServers: iceServers as IceServer[], bootstrap: value.bootstrap, generation }
}
