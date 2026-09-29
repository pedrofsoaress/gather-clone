import assert from 'node:assert/strict'
import { test } from 'node:test'
import { map } from './matte-office-map.mjs'

const expectedIds = [
  'lounge-books', 'lounge-sofa', 'boardroom-table', 'coffee', 'water',
  'vending', 'kitchen-table', 'desk-left-1', 'desk-left-2', 'desk-left-3',
  'desk-left-4', 'desk-right-1', 'desk-right-2', 'desk-right-3',
  'desk-right-4', 'project-table', 'workshop-shelves', 'workbench',
  'reception', 'reception-seats', 'reception-chair-right', 'pingpong', 'games-sofa',
]

test('every functional Matte fixture has a distinct hotspot', () => {
  const interactions = map.rooms[0].interactions
  assert.deepEqual(interactions.map((item) => item.id), expectedIds)
  assert.equal(new Set(interactions.map((item) => item.id)).size, 23)
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
    assert.ok(left + width <= 50 && top + height <= 30, object.id)
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
  assert.equal(desks.length, 8)
  for (const desk of desks) {
    assert.ok(desk.seatVisual.x < desk.approach.x && desk.seatVisual.x > desk.approach.x - 1, desk.id)
    assert.ok(desk.seatVisual.y > desk.approach.y && desk.seatVisual.y < desk.approach.y + 1, desk.id)
  }
})

test('every place to sit has a pose direction and the reception armchairs are separate', () => {
  const seats = map.rooms[0].interactions.filter((object) => object.kind === 'seat' || object.kind === 'desk')
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
