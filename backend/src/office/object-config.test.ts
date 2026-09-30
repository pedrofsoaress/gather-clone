import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateOfficeMap } from './object-config'
import type { RealmData } from '../session'

const base: RealmData = {
  spawnpoint: { roomIndex: 0, x: 0, y: 0 },
  rooms: [{ name: 'Matte', tilemap: { '0, 0': { floor: '1' }, '1, 0': { floor: '1' } }, interactions: [] }],
}
const object = {
  id: 'quadro', kind: 'external' as const, label: 'Quadro',
  bounds: { x: 1, y: 0, width: 1, height: 1 }, approach: { x: 0, y: 0 },
  config: { url: 'https://miro.com/demo', allowedHosts: ['miro.com'], roomEditable: true },
}

test('server accepts a configured external object', () => {
  assert.doesNotThrow(() => validateOfficeMap({ ...base, rooms: [{ ...base.rooms[0], interactions: [object] }] }))
})

test('server rejects duplicate IDs and off-map approach points', () => {
  assert.throws(() => validateOfficeMap({ ...base, rooms: [{ ...base.rooms[0], interactions: [object, object] }] }))
  assert.throws(() => validateOfficeMap({ ...base, rooms: [{ ...base.rooms[0], interactions: [{ ...object, approach: { x: 50, y: 50 } }] }] }))
})

test('server rejects a host outside object allowlist', () => {
  const altered = { ...object, config: { ...object.config, url: 'https://attacker.example/' } }
  assert.throws(() => validateOfficeMap({ ...base, rooms: [{ ...base.rooms[0], interactions: [altered] }] }))
})
