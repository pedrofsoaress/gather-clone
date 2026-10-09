import assert from 'node:assert/strict'
import { test } from 'node:test'
import { map } from './matte-office-map.mjs'

test('every functional Matte fixture has a distinct hotspot', () => {
  const interactions = map.rooms[0].interactions
  assert.equal(interactions.length, 128)
  assert.equal(new Set(interactions.map((item) => item.id)).size, interactions.length)
  for (const id of ['boardroom-table', 'project-table', 'workbench', 'reception', 'pingpong']) {
    assert.ok(interactions.some(item => item.id === id), id)
  }
  assert.equal(interactions.find(item => item.id === 'collab-board')?.kind, 'external')
  assert.equal(interactions.find(item => item.id === 'shared-piano')?.kind, 'external')
  assert.equal(interactions.find(item => item.id === 'boardroom-screen')?.kind, 'presentation')
  assert.equal(interactions.find(item => item.id === 'lounge-speaker')?.kind, 'speaker')
  assert.equal(interactions.find(item => item.id === 'caju')?.kind, 'pet')
  assert.equal(interactions.filter(item => item.kind === 'light').length, 3)
})

test('every hotspot fits the art and has a reachable approach tile', () => {
  const { tilemap, interactions } = map.rooms[0]
  const { x, y } = map.spawnpoint
  const reachable = new Set([`${x}, ${y}`])
  const queue = [[x, y]]
  for (let i = 0; i < queue.length; i++) {
    const [currentX, currentY] = queue[i]
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nextX = currentX + dx
      const nextY = currentY + dy
      const key = `${nextX}, ${nextY}`
      if (tilemap[key] && !tilemap[key].impassable && !reachable.has(key)) {
        reachable.add(key)
        queue.push([nextX, nextY])
      }
    }
  }

  for (const object of interactions) {
    const { x: left, y: top, width, height } = object.bounds
    assert.ok(left >= 0 && top >= 0, object.id)
    assert.ok(left + width <= 86 && top + height <= 30, object.id)
    assert.ok(reachable.has(`${object.approach.x}, ${object.approach.y}`), object.id)
  }
})

test('coffee and water can each be targeted by a distinct point', () => {
  const { interactions } = map.rooms[0]
  const coffee = interactions.find((object) => object.id === 'coffee')
  const water = interactions.find((object) => object.id === 'water')
  assert.ok(coffee.bounds.x + coffee.bounds.width <= water.bounds.x)
})

test('desk seats pull the avatar onto the visible chair center', () => {
  const desks = map.rooms[0].interactions.filter((object) => object.kind === 'desk')
  assert.equal(desks.length, 9)
  for (const desk of desks) {
    assert.ok(desk.seatVisual.x < desk.approach.x && desk.seatVisual.x > desk.approach.x - 1, desk.id)
    assert.ok(desk.seatVisual.y > desk.approach.y && desk.seatVisual.y < desk.approach.y + 1, desk.id)
  }
})

test('every place to sit has a pose direction and the reception armchairs are separate', () => {
  const seats = map.rooms[0].interactions.filter((object) => object.kind === 'seat' || object.kind === 'desk')
  assert.equal(seats.length, 107)
  assert.equal(seats.filter(seat => seat.id.startsWith('boardroom-')).length, 8)
  assert.equal(seats.filter(seat => seat.id.startsWith('project-')).length, 6)
  assert.equal(seats.filter(seat => seat.id.startsWith('bar-stool-')).length, 3)
  assert.equal(seats.filter(seat => seat.id.startsWith('workshop-stool-')).length, 3)
  assert.equal(seats.filter(seat => seat.id.startsWith('desk-')).length, 8)
  assert.equal(new Set(seats.map(seat => `${seat.approach.x},${seat.approach.y}`)).size, seats.length)
  assert.equal(new Set(seats.map(seat => `${seat.seatVisual.x},${seat.seatVisual.y}`)).size, seats.length)
  for (const seat of seats) {
    assert.ok(seat.seatVisual, seat.id)
    assert.ok(['up', 'down', 'left', 'right'].includes(seat.seatVisual.facing), seat.id)
  }
  const left = seats.find((seat) => seat.id === 'reception-seats')
  const right = seats.find((seat) => seat.id === 'reception-chair-right')
  assert.ok(left && right)
  assert.ok(left.seatVisual.x < 25 && right.seatVisual.x > 25)
  assert.notDeepEqual(left.approach, right.approach)
})

test('the annex wing has its rooms, signs and darkness', () => {
  const room = map.rooms[0]
  assert.deepEqual(room.backgroundImage, { src: '/matte-office-v3.png', width: 86 * 32, height: 30 * 32 })
  assert.deepEqual(room.annex, { reveal: { x: 50, y: 0, width: 36, height: 30 }, triggers: [[49, 15], [49, 16]] })
  assert.equal(room.signs.length, 7)
  assert.equal(room.areas['matte-training'].conversation, 'stage')
  for (let n = 1; n <= 4; n++) assert.equal(room.areas[`one-on-one-${n}`].capacity, 3)
  assert.equal(room.areas['matte-directors'].capacity, undefined)
  const training = room.interactions.filter(object => object.id.startsWith('training-seat-'))
  assert.equal(training.length, 50)
  for (const seat of training) {
    assert.equal(seat.sitRange, 0, seat.id)
    assert.equal(room.tilemap[`${seat.approach.x}, ${seat.approach.y}`].areaId, 'matte-training', seat.id)
  }
  for (let n = 1; n <= 4; n++) assert.equal(room.interactions.filter(object => object.id.startsWith(`one-on-one-${n}-`)).length, 3)
  const mics = room.interactions.filter(object => object.kind === 'speaker' && object.id.startsWith('training-'))
  assert.equal(mics.length, 2)
  for (const mic of mics) assert.deepEqual(mic.config, { rangeTiles: 40, flat: true })
  assert.equal(room.tilemap['49, 15'].impassable, undefined, 'the passage is open')
  assert.equal(room.tilemap['49, 14'].impassable, true, 'the rest of the east wall stays')
})
