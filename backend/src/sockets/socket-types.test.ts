import assert from 'node:assert/strict'
import test from 'node:test'
import { JoinRealm } from './socket-types'

const realm = { realmId: 'realm-id', shareId: 'share-id' }

test('visitor name is accepted and normalized before joining', () => {
    const parsed = JoinRealm.parse({ ...realm, displayName: '  Ana Matte  ' })
    assert.equal(parsed.displayName, 'Ana Matte')
})

test('blank, oversized, or control-character names cannot be used', () => {
    for (const displayName of ['   ', 'x'.repeat(33), 'Ana\nOutra']) {
        assert.equal(JoinRealm.safeParse({ ...realm, displayName }).success, false)
    }
})
