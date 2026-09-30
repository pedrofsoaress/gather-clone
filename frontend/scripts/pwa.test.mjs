import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import vm from 'node:vm'
import manifest from '../app/manifest.ts'

test('install manifest launches the office entry point and declares actual PNG sizes', () => {
    const app = manifest()
    assert.equal(app.name, 'Matte Office')
    assert.equal(app.start_url, '/')
    assert.equal(app.scope, '/')
    assert.equal(app.display, 'standalone')
    assert.ok(app.icons.some(icon => icon.sizes === '192x192' && icon.purpose === 'any'))
    assert.ok(app.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'))
    for (const icon of [...app.icons, { src: '/pwa/apple-touch-icon.png', sizes: '180x180' }]) {
        const file = readFileSync(new URL(`../public${icon.src}`, import.meta.url))
        assert.deepEqual([...file.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
        const width = file.readUInt32BE(16)
        const height = file.readUInt32BE(20)
        assert.equal(`${width}x${height}`, icon.sizes)
        const data = []
        for (let offset = 8; offset < file.length;) {
            const length = file.readUInt32BE(offset)
            if (file.toString('ascii', offset + 4, offset + 8) === 'IDAT') data.push(file.subarray(offset + 8, offset + 8 + length))
            offset += length + 12
        }
        assert.equal(inflateSync(Buffer.concat(data)).length, height * (width * 4 + 1))
    }
})

test('install worker activates without intercepting or caching office traffic', async () => {
    const handlers = new Map()
    const calls = []
    const fail = () => { throw new Error('The install worker must not fetch or cache office content') }
    vm.runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
        self: {
            addEventListener: (type, callback) => handlers.set(type, callback),
            skipWaiting: async () => { calls.push('skipWaiting') },
            clients: { claim: async () => { calls.push('claim') } },
        },
        fetch: fail,
        caches: new Proxy({}, { get: fail }),
    })
    assert.deepEqual([...handlers.keys()].sort(), ['activate', 'install'])
    const pending = []
    for (const name of ['install', 'activate']) handlers.get(name)({ waitUntil: promise => pending.push(promise) })
    await Promise.all(pending)
    assert.deepEqual(calls, ['skipWaiting', 'claim'])
})
