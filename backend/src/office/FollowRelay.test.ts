import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FollowRelay } from './FollowRelay'

const clock = () => { let t = 10_000; return { now: () => t, advance: (ms: number) => { t += ms } } }
const office = (players: Record<string, { username: string, socketId: string }>) => ({ getPlayer: (uid: string) => players[uid] })
const people = { ana: { username: 'Ana', socketId: 's-ana' }, bia: { username: 'Bia', socketId: 's-bia' }, caio: { username: 'Caio', socketId: 's-caio' } }

test('the followed person hears when someone starts and stops following', () => {
  const c = clock(); const relay = new FollowRelay('ana', 's-ana', c.now)
  const session = office(people)
  assert.deepEqual(relay.start(session, 'bia'), [{ socketId: 's-bia', notice: { name: 'Ana', following: true } }])
  assert.deepEqual(relay.stop(session, 'bia'), [{ socketId: 's-bia', notice: { name: 'Ana', following: false } }])
  assert.deepEqual(relay.stop(session, 'bia'), [])
})

test('a stop for someone the socket does not follow is ignored', () => {
  const c = clock(); const relay = new FollowRelay('ana', 's-ana', c.now)
  const session = office(people)
  assert.deepEqual(relay.stop(session, 'caio'), [])
  relay.start(session, 'bia')
  assert.deepEqual(relay.stop(session, 'caio'), [])
})

test('only the follower socket, within the same office and never oneself, can start', () => {
  const c = clock()
  assert.deepEqual(new FollowRelay('ana', 's-old', c.now).start(office(people), 'bia'), [])
  assert.deepEqual(new FollowRelay('ana', 's-ana', c.now).start(office(people), 'ana'), [])
  assert.deepEqual(new FollowRelay('ana', 's-ana', c.now).start(office({ ana: people.ana }), 'bia'), [])
  assert.deepEqual(new FollowRelay('ana', 's-ana', c.now).start(undefined, 'bia'), [])
})

test('more than one start per second is ignored', () => {
  const c = clock(); const relay = new FollowRelay('ana', 's-ana', c.now)
  const session = office(people)
  relay.start(session, 'bia')
  relay.stop(session, 'bia')
  c.advance(500)
  assert.deepEqual(relay.start(session, 'caio'), [])
  c.advance(500)
  assert.deepEqual(relay.start(session, 'caio'), [{ socketId: 's-caio', notice: { name: 'Ana', following: true } }])
})

test('switching to another person tells the previous one first', () => {
  const c = clock(); const relay = new FollowRelay('ana', 's-ana', c.now)
  const session = office(people)
  relay.start(session, 'bia')
  c.advance(1000)
  assert.deepEqual(relay.start(session, 'caio'), [
    { socketId: 's-bia', notice: { name: 'Ana', following: false } },
    { socketId: 's-caio', notice: { name: 'Ana', following: true } },
  ])
})

test('a follower who disconnects is reported as no longer following', () => {
  const c = clock(); const relay = new FollowRelay('ana', 's-ana', c.now)
  const session = office(people)
  assert.deepEqual(relay.disconnect(session), [])
  relay.start(session, 'bia')
  assert.deepEqual(relay.disconnect(session), [{ socketId: 's-bia', notice: { name: 'Ana', following: false } }])
  assert.deepEqual(relay.disconnect(session), [])
})
