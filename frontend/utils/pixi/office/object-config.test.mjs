import test from 'node:test'
import assert from 'node:assert/strict'
import { RealmDataSchema } from '../zod.ts'

const map = (interactions = []) => ({
  spawnpoint: { roomIndex: 0, x: 0, y: 0 },
  rooms: [{ name: 'Matte', tilemap: Object.fromEntries(
    Array.from({ length: 6 }, (_, x) => Array.from({ length: 6 }, (_, y) => [`${x}, ${y}`, { floor: '1' }])).flat(),
  ), interactions }],
})

const external = (id = 'quadro') => ({
  id, kind: 'external', label: 'Quadro',
  bounds: { x: 1, y: 1, width: 1, height: 1 }, approach: { x: 1, y: 2 },
  config: { url: 'https://miro.com/app/board/demo', allowedHosts: ['miro.com'], roomEditable: true },
})

test('old office maps stay valid when new object kinds are introduced', () => {
  const old = { id: 'mesa', kind: 'desk', label: 'Mesa', bounds: { x: 1, y: 1, width: 1, height: 1 }, approach: { x: 1, y: 2 } }
  assert.equal(RealmDataSchema.safeParse(map([old])).success, true)
})

test('external objects require an approved HTTPS URL', () => {
  assert.equal(RealmDataSchema.safeParse(map([external()])).success, true)
  assert.equal(RealmDataSchema.safeParse(map([{ ...external(), config: { ...external().config, url: 'javascript:alert(1)' } }])).success, false)
  assert.equal(RealmDataSchema.safeParse(map([{ ...external(), config: { ...external().config, url: 'https://evil.example/' } }])).success, false)
})

test('rooms reject duplicate object ids and unreachable approach points', () => {
  assert.equal(RealmDataSchema.safeParse(map([external(), external()])).success, false)
  assert.equal(RealmDataSchema.safeParse(map([{ ...external(), approach: { x: 42, y: 42 } }])).success, false)
})

test('kind-specific configuration cannot be used on a different object kind', () => {
  assert.equal(RealmDataSchema.safeParse(map([{ ...external(), kind: 'speaker' }])).success, false)
  assert.equal(RealmDataSchema.safeParse(map([{
    ...external(), kind: 'speaker', config: { rangeTiles: 7 },
  }])).success, true)
})
