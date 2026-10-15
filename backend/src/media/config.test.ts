import assert from 'node:assert/strict'
import { test } from 'node:test'
import { videoProviderFromEnv } from './config'

const all = { CLOUDFLARE_SFU_APP_ID: 'app', CLOUDFLARE_SFU_APP_SECRET: 'secret-value', CLOUDFLARE_TURN_KEY_ID: 'key', CLOUDFLARE_TURN_API_TOKEN: 'token-value' }

test('Agora unless VIDEO_PROVIDER says cloudflare', () => {
    assert.deepEqual(videoProviderFromEnv({ ...all }), { provider: 'agora' })
    assert.deepEqual(videoProviderFromEnv({ ...all, VIDEO_PROVIDER: 'zoom' }), { provider: 'agora' })
})

test('cloudflare with the four credentials', () => {
    assert.deepEqual(videoProviderFromEnv({ ...all, VIDEO_PROVIDER: ' Cloudflare ' }), { provider: 'cloudflare', credentials: { appId: 'app', appSecret: 'secret-value', turnKeyId: 'key', turnApiToken: 'token-value' } })
})

test('a missing credential falls back to agora and logs only the names', () => {
    const logs: string[] = []
    assert.deepEqual(videoProviderFromEnv({ ...all, VIDEO_PROVIDER: 'cloudflare', CLOUDFLARE_TURN_API_TOKEN: '' }, line => logs.push(line)), { provider: 'agora' })
    assert.deepEqual(logs, ['VIDEO_PROVIDER=cloudflare sem CLOUDFLARE_TURN_API_TOKEN; usando agora.'])
    assert.ok(!logs.join().includes('secret-value'))
})
