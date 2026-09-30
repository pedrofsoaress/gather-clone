import test from 'node:test'
import assert from 'node:assert/strict'
import { Session, type Room } from '../session'
import { authorizeConversation, conversationChannel } from './ConversationAuthorization'

test('conversation tokens require current authoritative room and group membership', () => {
  const room: Room = { name: 'Room', tilemap: { '0, 0': {}, '1, 0': {}, '2, 0': { privateAreaId: 'meeting' } } }
  const session = new Session('realm', { spawnpoint: { roomIndex: 0, x: 0, y: 0 }, rooms: [room, structuredClone(room)] })
  session.addPlayer('a', 'alice', 'Alice', '001')
  assert.equal(authorizeConversation(session, 'alice', '0123456789abcdef', 'alice'), null)
  session.addPlayer('b', 'bob', 'Bob', '001')
  session.setProximityIdsWithPlayer('alice')
  const publicChannel = conversationChannel('realm', 0, session.getPlayer('alice').proximityId!)
  assert.deepEqual(authorizeConversation(session, 'alice', publicChannel, 'alice-screen'), { channel: publicChannel, uid: 'alice-screen' })
  assert.equal(authorizeConversation(session, 'alice', publicChannel, 'bob'), null)
  assert.equal(authorizeConversation(undefined, 'alice', publicChannel, 'alice'), null)
  const privateChannel = conversationChannel('realm', 0, 'meeting')
  assert.equal(authorizeConversation(session, 'alice', privateChannel, 'alice'), null)
  session.changeRoom('alice', 1, 2, 0)
  const otherRoomChannel = conversationChannel('realm', 1, 'meeting')
  assert.notEqual(privateChannel, otherRoomChannel)
  assert.equal(authorizeConversation(session, 'alice', privateChannel, 'alice'), null)
  assert.deepEqual(authorizeConversation(session, 'alice', otherRoomChannel, 'alice'), { channel: otherRoomChannel, uid: 'alice' })
  session.removePlayer('alice')
  assert.equal(authorizeConversation(session, 'alice', otherRoomChannel, 'alice'), null)
})
