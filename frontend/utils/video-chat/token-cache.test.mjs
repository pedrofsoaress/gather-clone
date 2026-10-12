import test from 'node:test'
import assert from 'node:assert/strict'
import { TOKEN_TRUST_MS, TokenCache } from './token-cache.ts'

test('a pushed token is used until it is 50 minutes old', () => {
    let now = 1_000
    const cache = new TokenCache(() => now)
    assert.equal(cache.get('abc'), null)
    cache.remember('abc', 'token-1')
    assert.equal(cache.get('abc'), 'token-1')
    assert.equal(cache.get('other'), null)
    now += TOKEN_TRUST_MS
    assert.equal(cache.get('abc'), 'token-1')
    now += 1
    assert.equal(cache.get('abc'), null, 'too close to expiring')
    cache.remember('abc', 'token-2')
    assert.equal(cache.get('abc'), 'token-2', 'a newer push replaces it')
    cache.forget('abc')
    assert.equal(cache.get('abc'), null)
})

test('waiting returns the cached token at once', async () => {
    const cache = new TokenCache()
    cache.remember('abc', 'token-1')
    const started = Date.now()
    assert.equal(await cache.wait('abc', 5_000), 'token-1')
    assert.ok(Date.now() - started < 100)
})

test('waiting resolves as soon as the token arrives, before the timeout', async () => {
    const cache = new TokenCache()
    const started = Date.now()
    const waiting = cache.wait('abc', 5_000)
    const other = cache.wait('abc', 5_000)
    setTimeout(() => cache.remember('other', 'token-x'), 5)
    setTimeout(() => cache.remember('abc', 'token-1'), 20)
    assert.equal(await waiting, 'token-1')
    assert.equal(await other, 'token-1')
    assert.ok(Date.now() - started < 1_000)
})

test('waiting gives up with null when no token arrives in time', async () => {
    const cache = new TokenCache()
    const started = Date.now()
    assert.equal(await cache.wait('abc', 30), null)
    assert.ok(Date.now() - started >= 25)
    cache.remember('abc', 'late')
    assert.equal(cache.get('abc'), 'late', 'a late push is still kept for the next join')
    cache.clear()
    assert.equal(await cache.wait('abc', 0), null)
})

test('a newer join cancels the pending wait at once', async () => {
    const cache = new TokenCache()
    const started = Date.now()
    const waiting = cache.wait('abc', 5_000)
    cache.cancelWaits()
    assert.equal(await waiting, null)
    assert.ok(Date.now() - started < 1_000)
    cache.remember('abc', 'token-1')
    assert.equal(await cache.wait('abc', 5_000), 'token-1', 'later waits still work')
})
