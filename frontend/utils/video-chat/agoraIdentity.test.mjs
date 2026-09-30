import test from 'node:test'
import assert from 'node:assert/strict'
import { agoraUidForProfile, isConversationTokenRequest } from './agoraIdentity.ts'

test('conversation tokens cannot impersonate another user or authorize a speaker channel', () => {
  const uid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  assert.equal(isConversationTokenRequest('0123456789abcdef', uid, uid), true)
  assert.equal(isConversationTokenRequest('0123456789abcdef', `${uid}-screen`, uid), true)
  assert.equal(isConversationTokenRequest('speaker-secret', uid, uid), false)
  assert.equal(isConversationTokenRequest('0123456789abcdef', 'another-user', uid), false)
})

const uid = '123e4567-e89b-42d3-a456-426614174000'

test('Agora identity stays ASCII and stable when a visitor changes an accented name', () => {
  assert.equal(agoraUidForProfile(uid, 'João Matte'), uid)
  assert.equal(agoraUidForProfile(uid, '🌟 Ana'), uid)
  assert.match(agoraUidForProfile(uid, 'João Matte'), /^[\x00-\x7f]+$/)
})

test('Agora rejects a malformed user id before joining a channel', () => {
  assert.throws(() => agoraUidForProfile('usuário-inválido', 'Ana'))
})
