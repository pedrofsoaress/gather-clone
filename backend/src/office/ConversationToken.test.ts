import test from 'node:test'
import assert from 'node:assert/strict'
import { Session, type Room } from '../session'
import { conversationChannel, conversationChannelFor } from './ConversationAuthorization'
import { ConversationTokens, mintConversationToken } from './ConversationToken'

const APP_ID = '0123456789abcdef0123456789abcdef'
const CERTIFICATE = 'fedcba9876543210fedcba9876543210'

function withAgoraEnv(appId: string | undefined, certificate: string | undefined, run: () => void) {
  const saved = { appId: process.env.AGORA_APP_ID, certificate: process.env.APP_CERTIFICATE }
  const set = (name: string, value: string | undefined) => { if (value === undefined) delete process.env[name]; else process.env[name] = value }
  set('AGORA_APP_ID', appId)
  set('APP_CERTIFICATE', certificate)
  try { run() } finally {
    set('AGORA_APP_ID', saved.appId)
    set('APP_CERTIFICATE', saved.certificate)
  }
}

function setup() {
  const tilemap: Room['tilemap'] = {}
  for (let x = 0; x < 20; x++) tilemap[`${x}, 0`] = {}
  tilemap['10, 0'].privateAreaId = 'meeting'
  const session = new Session('realm', { spawnpoint: { roomIndex: 0, x: 19, y: 0 }, rooms: [{ name: 'Office', tilemap }] })
  const place = (uid: string, x: number) => {
    if (!session.getPlayer(uid)) session.addPlayer(`socket-${uid}`, uid, uid, '009')
    session.changeRoom(uid, 0, x, 0)
  }
  return { session, place }
}

test('conversation tokens are minted only when the server has both Agora credentials', () => {
  withAgoraEnv(undefined, undefined, () => assert.equal(mintConversationToken('0123456789abcdef', 'alice'), null))
  withAgoraEnv(APP_ID, undefined, () => assert.equal(mintConversationToken('0123456789abcdef', 'alice'), null))
  withAgoraEnv(undefined, CERTIFICATE, () => assert.equal(mintConversationToken('0123456789abcdef', 'alice'), null))
  withAgoraEnv(APP_ID, CERTIFICATE, () => {
    const token = mintConversationToken('0123456789abcdef', 'alice')
    assert.equal(typeof token, 'string')
    assert.ok(token!.startsWith('007'))
  })
})

test('the private area of the verified tile beats the proximity call', () => {
  const { session, place } = setup()
  place('alice', 0)
  assert.equal(conversationChannelFor(session, 'alice'), null)
  place('bob', 1)
  const proximity = session.getPlayer('alice').proximityId!
  assert.equal(conversationChannelFor(session, 'alice'), conversationChannel('realm', 0, proximity))
  place('alice', 10)
  assert.equal(conversationChannelFor(session, 'alice'), conversationChannel('realm', 0, 'meeting'))
  assert.equal(conversationChannelFor(session, 'nobody'), null)
})

test('a visitor gets each conversation token once, again after leaving it', () => {
  const { session, place } = setup()
  place('alice', 0)
  place('bob', 1)
  const channel = conversationChannelFor(session, 'alice')!
  withAgoraEnv(undefined, undefined, () => assert.equal(session.conversationTokens.next(session, 'alice'), null, 'no credentials, nothing to push'))
  withAgoraEnv(APP_ID, CERTIFICATE, () => {
    const tokens = session.conversationTokens
    const first = tokens.next(session, 'alice', 0)
    assert.equal(first?.channel, channel)
    assert.equal(tokens.next(session, 'alice', 1000), null, 'same channel twice pushes once')
    place('alice', 2)
    assert.equal(tokens.next(session, 'alice', 2000), null, 'a step inside the same call pushes nothing')
    assert.equal(tokens.next(session, 'alice', 46 * 60 * 1000)?.channel, channel, 'pushed again before the client stops trusting it')
    place('alice', 10)
    assert.equal(tokens.next(session, 'alice', 47 * 60 * 1000)?.channel, conversationChannel('realm', 0, 'meeting'))
    place('alice', 19)
    assert.equal(tokens.next(session, 'alice'), null, 'out of every conversation')
    place('alice', 2)
    const again = conversationChannelFor(session, 'alice')!
    assert.equal(tokens.next(session, 'alice')?.channel, again, 'back in a call')
    session.removePlayer('alice')
    place('alice', 2)
    assert.equal(tokens.next(session, 'alice')?.channel, conversationChannelFor(session, 'alice'), 'a rejoin starts over')
  })
})

test('a forgotten visitor gets the token of their conversation again', () => {
  const tokens = new ConversationTokens()
  const { session, place } = setup()
  place('alice', 0)
  place('bob', 1)
  withAgoraEnv(APP_ID, CERTIFICATE, () => {
    assert.ok(tokens.next(session, 'alice'))
    tokens.forget('alice')
    assert.ok(tokens.next(session, 'alice'))
  })
})
