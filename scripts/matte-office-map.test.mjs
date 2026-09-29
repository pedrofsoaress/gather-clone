import assert from 'node:assert/strict'
import { test } from 'node:test'
import { map } from './matte-office-map.mjs'

const expectedIds = [
  'lounge-books', 'lounge-sofa', 'boardroom-table', 'coffee', 'water',
  'vending', 'kitchen-table', 'desk-left-1', 'desk-left-2', 'desk-left-3',
  'desk-left-4', 'desk-right-1', 'desk-right-2', 'desk-right-3',
  'desk-right-4', 'project-table', 'workshop-shelves', 'workbench',
  'reception', 'reception-seats', 'pingpong', 'games-sofa',
]

test('every functional Matte fixture has a distinct hotspot', () => {
  const interactions = map.rooms[0].interactions
  assert.deepEqual(interactions.map((item) => item.id), expectedIds)
  assert.equal(new Set(interactions.map((item) => item.id)).size, 22)
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
