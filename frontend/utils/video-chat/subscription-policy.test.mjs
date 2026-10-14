import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldSubscribeVideo } from './subscription-policy.ts'

const host = '11111111-1111-4111-8111-111111111111'
const ana = '22222222-2222-4222-8222-222222222222'
const bia = '33333333-3333-4333-8333-333333333333'
const meeting = { moderators: [host] }

test('outside a meeting room every video is received', () => {
    assert.equal(shouldSubscribeVideo({ remoteUid: bia, localUid: ana, meeting: null }), true)
    assert.equal(shouldSubscribeVideo({ remoteUid: `${bia}-screen`, localUid: ana, meeting: null }), true)
})

test('the audience receives only the stage and shared screens', () => {
    assert.equal(shouldSubscribeVideo({ remoteUid: host, localUid: ana, meeting }), true)
    assert.equal(shouldSubscribeVideo({ remoteUid: bia, localUid: ana, meeting }), false)
    assert.equal(shouldSubscribeVideo({ remoteUid: `${bia}-screen`, localUid: ana, meeting }), true)
    assert.equal(shouldSubscribeVideo({ remoteUid: `${host}-screen`, localUid: ana, meeting }), true)
})

test('people on the stage receive everyone', () => {
    assert.equal(shouldSubscribeVideo({ remoteUid: bia, localUid: host, meeting }), true)
    assert.equal(shouldSubscribeVideo({ remoteUid: ana, localUid: host, meeting: { moderators: [host, ana] } }), true)
})

test('an empty stage leaves the audience with screens only', () => {
    assert.equal(shouldSubscribeVideo({ remoteUid: bia, localUid: ana, meeting: { moderators: [] } }), false)
    assert.equal(shouldSubscribeVideo({ remoteUid: `${bia}-screen`, localUid: ana, meeting: { moderators: [] } }), true)
})

test('a local uid not known yet counts as audience inside a meeting', () => {
    assert.equal(shouldSubscribeVideo({ remoteUid: bia, localUid: '', meeting }), false)
    assert.equal(shouldSubscribeVideo({ remoteUid: host, localUid: '', meeting }), true)
})
