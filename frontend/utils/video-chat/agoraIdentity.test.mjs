import test from 'node:test'
import assert from 'node:assert/strict'
import { agoraUidForProfile } from './agoraIdentity.ts'

const uid = '123e4567-e89b-42d3-a456-426614174000'

test('Agora identity stays ASCII and stable when a visitor changes an accented name', () => {
  assert.equal(agoraUidForProfile(uid, 'João Matte'), uid)
  assert.equal(agoraUidForProfile(uid, '🌟 Ana'), uid)
  assert.match(agoraUidForProfile(uid, 'João Matte'), /^[\x00-\x7f]+$/)
})

test('Agora rejects a malformed user id before joining a channel', () => {
  assert.throws(() => agoraUidForProfile('usuário-inválido', 'Ana'))
})
