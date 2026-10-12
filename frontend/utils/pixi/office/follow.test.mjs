import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rankFollowTiles, shouldReplan, trackFollowProgress, departureStairs, followStopNotice, followStopTellsTarget, placeFollowBanner, FOLLOW_STUCK_MS } from './follow.ts'

// A 7x7 floor; extra tiles can be marked impassable or as a passage.
function floor(extra = {}) {
  const tilemap = {}
  for (let x = 0; x < 7; x++) for (let y = 0; y < 7; y++) tilemap[`${x}, ${y}`] = {}
  return { ...tilemap, ...extra }
}
const rank = (options) => rankFollowTiles({ previous: null, tilemap: floor(), blocked: new Set(), occupied: [], ...options })

test('already next to the person, the follower stays where it is', () => {
  assert.deepEqual(rank({ target: { x: 3, y: 3 }, self: { x: 4, y: 4 } }), [{ x: 4, y: 4 }])
  assert.deepEqual(rank({ target: { x: 3, y: 3 }, self: { x: 3, y: 2 } }), [{ x: 3, y: 2 }])
})

test('the side the follower approaches from comes first, never the person tile', () => {
  const tiles = rank({ target: { x: 3, y: 3 }, self: { x: 0, y: 3 } })
  assert.deepEqual(tiles[0], { x: 2, y: 3 })
  assert.ok(!tiles.some(tile => tile.x === 3 && tile.y === 3))
  assert.equal(tiles.length, 8)
})

test('the tile the person just left is preferred when trailing them', () => {
  // Walking away to the right: the follower takes the tile they left behind.
  assert.deepEqual(rank({ target: { x: 4, y: 3 }, previous: { x: 3, y: 3 }, self: { x: 2, y: 2 } })[0], { x: 3, y: 3 })
  // Walking towards the follower: the near side wins over going around them.
  assert.deepEqual(rank({ target: { x: 2, y: 3 }, previous: { x: 3, y: 3 }, self: { x: 0, y: 3 } })[0], { x: 1, y: 3 })
})

test('walls, other people and passages are never chosen; corners fill in', () => {
  const tilemap = floor({ '2, 3': { impassable: true }, '3, 2': { teleporter: { roomIndex: 1, x: 0, y: 0 } } })
  const tiles = rankFollowTiles({ target: { x: 3, y: 3 }, previous: null, self: { x: 0, y: 3 }, tilemap, blocked: new Set(['3, 4']), occupied: [{ x: 4, y: 3 }] })
  for (const forbidden of ['2,3', '3,2', '3,4', '4,3']) assert.ok(!tiles.some(tile => `${tile.x},${tile.y}` === forbidden), forbidden)
  assert.deepEqual(tiles.map(tile => `${tile.x},${tile.y}`).sort(), ['2,2', '2,4', '4,2', '4,4'])
  assert.deepEqual(rankFollowTiles({ target: { x: 0, y: 0 }, previous: null, self: { x: 5, y: 5 }, tilemap: { '0, 0': {} }, blocked: new Set(), occupied: [] }), [])
})

test('a follower standing on someone else is moved off', () => {
  const tiles = rank({ target: { x: 3, y: 3 }, self: { x: 2, y: 3 }, occupied: [{ x: 2, y: 3 }] })
  assert.ok(tiles.length > 0 && !tiles.some(tile => tile.x === 2 && tile.y === 3))
})

test('paths are only planned again when the walk no longer ends next to the person', () => {
  const candidates = [{ x: 2, y: 3 }, { x: 3, y: 2 }]
  assert.equal(shouldReplan({ candidates, lastGoal: { x: 3, y: 2 }, moving: true, at: { x: 1, y: 2 } }), false)
  assert.equal(shouldReplan({ candidates, lastGoal: { x: 5, y: 5 }, moving: true, at: { x: 1, y: 2 } }), true)
  assert.equal(shouldReplan({ candidates, lastGoal: { x: 2, y: 3 }, moving: false, at: { x: 0, y: 3 } }), true)
  assert.equal(shouldReplan({ candidates: [{ x: 2, y: 3 }], lastGoal: null, moving: false, at: { x: 2, y: 3 } }), false)
  assert.equal(shouldReplan({ candidates: [], lastGoal: null, moving: false, at: { x: 0, y: 0 } }), false)
})

test('following gives up after three seconds without a confirmed step or rest next to the person', () => {
  let state = { since: 0, position: { x: 1, y: 1 } }
  state = trackFollowProgress(state, { now: 1000, position: { x: 1, y: 1 }, settled: false })
  assert.equal(state.stuck, false)
  state = trackFollowProgress(state, { now: 2000, position: { x: 2, y: 1 }, settled: false })
  assert.equal(state.since, 2000)
  assert.equal(trackFollowProgress(state, { now: 2000 + FOLLOW_STUCK_MS - 1, position: { x: 2, y: 1 }, settled: false }).stuck, false)
  assert.equal(trackFollowProgress(state, { now: 2000 + FOLLOW_STUCK_MS, position: { x: 2, y: 1 }, settled: false }).stuck, true)
  assert.equal(trackFollowProgress(state, { now: 9000, position: { x: 2, y: 1 }, settled: true }).stuck, false)
})

test('a person who vanishes from a passage took the stairs; elsewhere they left', () => {
  const tilemap = floor({ '5, 5': { teleporter: { roomIndex: 1, x: 2, y: 2 } } })
  assert.deepEqual(departureStairs(tilemap, { x: 5, y: 5 }), { x: 5, y: 5 })
  assert.equal(departureStairs(tilemap, { x: 4, y: 5 }), null)
  assert.equal(departureStairs(tilemap, null), null)
})

test('each stop reason has its notice and only some tell the followed person', () => {
  assert.equal(followStopNotice('manual', 'Ana'), 'Você parou de seguir Ana.')
  assert.equal(followStopNotice('stopped', 'Ana'), 'Você parou de seguir Ana.')
  assert.equal(followStopNotice('left', 'Ana'), 'Ana saiu do escritório.')
  assert.equal(followStopNotice('unreachable', 'Ana'), 'Não foi possível seguir Ana.')
  assert.equal(followStopNotice('silent', 'Ana'), null)
  assert.equal(followStopNotice('switched', 'Ana'), null)
  assert.deepEqual(['manual', 'stopped', 'left', 'unreachable', 'switched', 'silent'].filter(followStopTellsTarget), ['manual', 'stopped', 'unreachable', 'switched'])
})

test('the banner avoids the call strip and hints at the top', () => {
  const banner = { width: 240, height: 40 }
  assert.deepEqual(placeFollowBanner(1280, banner, []), { left: 520, top: 12 })
  // Hints at the top right of a wide screen leave the center free.
  assert.deepEqual(placeFollowBanner(1280, banner, [{ left: 900, top: 12, right: 1268, bottom: 52 }]), { left: 520, top: 12 })
  // A wide call strip covers the center: the top left is used.
  assert.deepEqual(placeFollowBanner(1280, banner, [{ left: 500, top: 12, right: 1268, bottom: 190 }]), { left: 12, top: 12 })
  // A phone with the hint across the top: the banner goes just below it.
  assert.deepEqual(placeFollowBanner(400, banner, [{ left: 30, top: 12, right: 388, bottom: 60 }]), { left: 80, top: 68 })
})
