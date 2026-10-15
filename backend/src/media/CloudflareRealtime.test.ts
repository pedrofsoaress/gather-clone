import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CloudflareError, CloudflareRealtime, FetchLike, IceServerCache, IceServer } from './CloudflareRealtime'

const credentials = { appId: 'app', appSecret: 'secret-value', turnKeyId: 'key', turnApiToken: 'token-value' }
const BASE = 'https://rtc.live.cloudflare.com/v1/apps/app'

function fake(replies: { status?: number, json?: unknown }[]) {
    const calls: { url: string, method: string, headers: Record<string, string>, body: any }[] = []
    const queue = [...replies]
    const fetchImpl: FetchLike = async (url, init) => {
        calls.push({ url, method: init.method, headers: init.headers, body: init.body === undefined ? undefined : JSON.parse(init.body) })
        const reply = queue.shift() ?? { status: 200, json: {} }
        const status = reply.status ?? 200
        return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(reply.json ?? {}) }
    }
    return { calls, api: new CloudflareRealtime(credentials, fetchImpl) }
}

test('newSession and publish', async () => {
    const { calls, api } = fake([{ json: { sessionId: 's1' } }, { json: { tracks: [] } }])
    assert.equal(await api.newSession(), 's1')
    assert.equal(calls[0].url, `${BASE}/sessions/new`)
    assert.equal(calls[0].method, 'POST')
    assert.equal(calls[0].headers.Authorization, 'Bearer secret-value')
    await api.publish('s1', 'OFFER', [{ location: 'local', mid: '0', trackName: 'camera-1' }])
    assert.equal(calls[1].url, `${BASE}/sessions/s1/tracks/new`)
    assert.deepEqual(calls[1].body, { sessionDescription: { type: 'offer', sdp: 'OFFER' }, tracks: [{ location: 'local', mid: '0', trackName: 'camera-1' }] })
})

test('openSession starts a session from the page offer and returns its answer', async () => {
    const { calls, api } = fake([{ json: { sessionId: 's9', sessionDescription: { type: 'answer', sdp: 'ANSWER' } } }, { json: { sessionId: 's10' } }])
    assert.deepEqual(await api.openSession('DC-OFFER'), { sessionId: 's9', answer: 'ANSWER' })
    assert.equal(calls[0].url, `${BASE}/sessions/new`)
    assert.equal(calls[0].method, 'POST')
    assert.deepEqual(calls[0].body, { sessionDescription: { type: 'offer', sdp: 'DC-OFFER' } })
    await assert.rejects(api.openSession('DC-OFFER'), /sem SDP/)
})

test('pull, renegotiate, close, update', async () => {
    const { calls, api } = fake([{}, {}, {}, {}, {}])
    const simulcast = { preferredRid: 'q' as const, priorityOrdering: 'none' as const, ridNotAvailable: 'asciibetical' as const }
    await api.pull('s2', [{ location: 'remote', sessionId: 'p1', trackName: 'camera-1', simulcast }])
    assert.equal(calls[0].method, 'POST')
    assert.deepEqual(calls[0].body, { tracks: [{ location: 'remote', sessionId: 'p1', trackName: 'camera-1', simulcast }] })
    await api.renegotiate('s2', 'ANS')
    assert.equal(calls[1].method, 'PUT')
    assert.equal(calls[1].url, `${BASE}/sessions/s2/renegotiate`)
    assert.deepEqual(calls[1].body, { sessionDescription: { type: 'answer', sdp: 'ANS' } })
    await api.close('s2', ['5'], 'OFF')
    assert.equal(calls[2].url, `${BASE}/sessions/s2/tracks/close`)
    assert.deepEqual(calls[2].body, { tracks: [{ mid: '5' }], force: false, sessionDescription: { type: 'offer', sdp: 'OFF' } })
    await api.close('s2', ['5'])
    assert.deepEqual(calls[3].body, { tracks: [{ mid: '5' }], force: true })
    const track = { location: 'remote' as const, mid: '5', sessionId: 'p1', trackName: 'camera-1', simulcast }
    await api.update('s2', [track])
    assert.equal(calls[4].method, 'PUT')
    assert.equal(calls[4].url, `${BASE}/sessions/s2/tracks/update`)
    assert.deepEqual(calls[4].body, { tracks: [track] })
})

test('errors carry status and code and never leak secrets', async () => {
    const { api } = fake([{ status: 410, json: { errorCode: 'session_gone', errorDescription: 'gone' } }, { status: 410, json: {} }, { status: 200, json: { errorCode: 'bad' } }])
    await assert.rejects(api.newSession(), (e: unknown) => e instanceof CloudflareError && e.status === 410 && e.code === 'session_gone' && !e.message.includes('secret-value') && !e.message.includes('token-value'))
    await assert.rejects(api.newSession(), (e: unknown) => e instanceof CloudflareError && e.status === 410 && e.code === 'http_410')
    await assert.rejects(api.newSession(), (e: unknown) => e instanceof CloudflareError && e.code === 'bad')
})

test('iceServers drops port 53 urls and empty entries', async () => {
    const { calls, api } = fake([{ json: { iceServers: [
        { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
        { urls: ['turn:turn.cloudflare.com:53?transport=udp'], username: 'u', credential: 'c' },
        { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' },
    ] } }])
    const servers = await api.iceServers(600)
    assert.equal(calls[0].url, 'https://rtc.live.cloudflare.com/v1/turn/keys/key/credentials/generate-ice-servers')
    assert.equal(calls[0].headers.Authorization, 'Bearer token-value')
    assert.deepEqual(calls[0].body, { ttl: 600 })
    assert.deepEqual(servers, [
        { urls: ['stun:stun.cloudflare.com:3478'] },
        { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' },
    ])
})

test('IceServerCache shares one request and renews after half the lifetime', async () => {
    let requests = 0
    let clock = 1000
    const cache = new IceServerCache({ iceServers: async () => { requests++; return [{ urls: 'stun:x' }] as IceServer[] } }, () => clock)
    await Promise.all([cache.get(), cache.get()])
    assert.equal(requests, 1)
    clock += 13 * 3600 * 1000
    await cache.get()
    assert.equal(requests, 2)
})
