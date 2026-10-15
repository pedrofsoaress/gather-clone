import test from 'node:test'
import assert from 'node:assert/strict'
import { parseMediaConfig } from './config.ts'

test('agora, and a well formed cloudflare config, are accepted as sent', () => {
    assert.deepEqual(parseMediaConfig({ provider: 'agora', extra: 1 }), { provider: 'agora' })
    const config = { provider: 'cloudflare', bootstrap: true, generation: 7, iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' }] }
    assert.deepEqual(parseMediaConfig(config), config)
    // Only the known fields are kept.
    assert.deepEqual(parseMediaConfig({ ...config, secret: 'x', iceServers: [{ urls: 'stun:x', extra: 1 }] }), { provider: 'cloudflare', bootstrap: true, generation: 7, iceServers: [{ urls: 'stun:x' }] })
})

test('anything malformed is ignored', () => {
    const stun = [{ urls: 'stun:x' }]
    for (const raw of [null, 'cloudflare', { provider: 'zoom' }, { provider: 'cloudflare', iceServers: [], bootstrap: true, generation: 1 }, { provider: 'cloudflare', iceServers: [{ urls: 'http://x' }], bootstrap: true, generation: 1 }, { provider: 'cloudflare', iceServers: stun, generation: 1 }, { provider: 'cloudflare', iceServers: [{ urls: 'turn:x', username: 3 }], bootstrap: false, generation: 1 }, { provider: 'cloudflare', iceServers: [{ urls: [] }], bootstrap: true, generation: 1 }, { provider: 'cloudflare', iceServers: [null], bootstrap: true, generation: 1 },
        // The generation is required: without it the page could not tell its negotiation steps from stale ones.
        { provider: 'cloudflare', iceServers: stun, bootstrap: true }, { provider: 'cloudflare', iceServers: stun, bootstrap: true, generation: '1' }, { provider: 'cloudflare', iceServers: stun, bootstrap: true, generation: -1 }, { provider: 'cloudflare', iceServers: stun, bootstrap: true, generation: 1.5 }])
        assert.equal(parseMediaConfig(raw), null, JSON.stringify(raw))
})
