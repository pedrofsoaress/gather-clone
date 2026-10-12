import assert from 'node:assert/strict'
import { test } from 'node:test'
import { map } from './matte-office-map.mjs'

// Tiles reachable on foot from (x, y). Teleporters are stepped on but not walked through.
function reachableFrom(tilemap, x, y) {
  const reachable = new Set([`${x}, ${y}`])
  const queue = [[x, y]]
  for (let i = 0; i < queue.length; i++) {
    const [cx, cy] = queue[i]
    if (tilemap[`${cx}, ${cy}`].teleporter) continue
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const key = `${cx + dx}, ${cy + dy}`
      if (tilemap[key] && !tilemap[key].impassable && !reachable.has(key)) { reachable.add(key); queue.push([cx + dx, cy + dy]) }
    }
  }
  return reachable
}

test('every functional Matte fixture has a distinct hotspot', () => {
  const interactions = map.rooms[0].interactions
  assert.equal(interactions.length, 126)
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
  assert.equal(room.signs.length, 10)
  assert.deepEqual(room.areas['matte-training'].meeting, { stage: { x1: 62, y1: 1, x2: 76, y2: 3 } })
  for (let n = 1; n <= 4; n++) assert.equal(room.areas[`one-on-one-${n}`].capacity, 3)
  assert.equal(room.areas['matte-directors'].capacity, undefined)
  const training = room.interactions.filter(object => object.id.startsWith('training-seat-'))
  assert.equal(training.length, 50)
  for (const seat of training) {
    assert.equal(seat.sitRange, 0, seat.id)
    assert.equal(room.tilemap[`${seat.approach.x}, ${seat.approach.y}`].privateAreaId, 'matte-training', seat.id)
  }
  for (let n = 1; n <= 4; n++) assert.equal(room.interactions.filter(object => object.id.startsWith(`one-on-one-${n}-`)).length, 3)
  assert.equal(room.interactions.filter(object => object.id.startsWith('training-') && object.kind === 'speaker').length, 0)
  assert.equal(room.tilemap['49, 15'].impassable, undefined, 'the passage is open')
  assert.equal(room.tilemap['49, 14'].impassable, true, 'the rest of the east wall stays')
})

test('the 1:1 shelves block walking and the training slide points to the middle aisle', () => {
  const room = map.rooms[0]
  for (const x1 of [54, 60, 66, 72]) {
    for (let y = 25; y <= 28; y++) assert.equal(room.tilemap[`${x1 + 4}, ${y}`].impassable, true, `${x1 + 4}, ${y}`)
    assert.equal(room.tilemap[`${x1 + 4}, 24`].impassable, undefined, `${x1 + 4}, 24 stays open`)
  }
  const slide = room.interactions.find(object => object.id === 'training-screen').config.slides[0]
  assert.equal(slide.body, 'Quem está no palco apresenta e controla os microfones. Para falar, ligue seu microfone ou clique em Pedir para falar.')
})

test('the ground floor stairs lead upstairs and back', () => {
  const [ground, upstairs] = map.rooms
  for (const x of [50, 51, 52]) {
    assert.deepEqual(ground.tilemap[`${x}, 26`].teleporter, { roomIndex: 1, x: 2, y: 23 })
    assert.ok(ground.tilemap[`${x}, 27`].impassable && ground.tilemap[`${x}, 28`].impassable)
  }
  for (const x of [1, 2, 3]) {
    assert.deepEqual(upstairs.tilemap[`${x}, 25`].teleporter, { roomIndex: 0, x: 51, y: 24 })
    assert.ok(upstairs.tilemap[`${x}, 26`].impassable)
  }
  assert.ok(!ground.tilemap['51, 24'].impassable && !ground.tilemap['51, 24'].teleporter)
  assert.ok(!upstairs.tilemap['2, 23'].impassable && !upstairs.tilemap['2, 23'].teleporter)
})

test('the stair doorways beside the boardroom lead upstairs too', () => {
  const ground = map.rooms[0]
  const reachable = reachableFrom(ground.tilemap, map.spawnpoint.x, map.spawnpoint.y)
  for (const x of [16, 17, 32, 33]) {
    assert.deepEqual(ground.tilemap[`${x}, 2`].teleporter, { roomIndex: 1, x: 2, y: 23 }, `${x}, 2`)
    assert.ok(!ground.tilemap[`${x}, 2`].impassable, `${x}, 2 can be stepped on`)
    assert.ok(!ground.tilemap[`${x}, 3`].impassable && !ground.tilemap[`${x}, 3`].teleporter, `${x}, 3 is the way in`)
    assert.ok(reachable.has(`${x}, 2`), `${x}, 2 is reachable from the spawn`)
  }
  const stairSigns = ground.signs.filter(sign => sign.text === 'Escada · 2º andar' && sign.y < 5)
  assert.deepEqual(stairSigns.map(sign => [sign.x, sign.y]), [[17, 1], [33, 1]])
  for (const sign of stairSigns) {
    for (const x of [Math.floor(sign.x) - 1, Math.floor(sign.x)]) assert.equal(ground.tilemap[`${x}, ${sign.y}`].impassable, true, `sign over ${x}, ${sign.y}`)
  }
  for (const x of [50, 51, 52]) assert.deepEqual(ground.tilemap[`${x}, 26`].teleporter, { roomIndex: 1, x: 2, y: 23 })
})

test('the second floor has 20 focus desks and 4 islands of 6', () => {
  const upstairs = map.rooms[1]
  assert.equal(upstairs.name, '2º andar')
  assert.equal(upstairs.backgroundImage.src, '/matte-floor2.png')
  assert.equal(Object.keys(upstairs.tilemap).length, 50 * 30)
  const focus = upstairs.interactions.filter(item => item.kind === 'desk' && item.focus === true)
  assert.equal(focus.length, 20)
  for (let n = 1; n <= 4; n++) {
    assert.equal(upstairs.areas[`island-${n}`].label, `Ilha ${n}`)
    const seats = upstairs.interactions.filter(item => item.id.startsWith(`island-${n}-`))
    assert.equal(seats.length, 6)
    for (const seat of seats) assert.equal(upstairs.tilemap[`${seat.approach.x}, ${seat.approach.y}`].privateAreaId, `island-${n}`)
  }
  assert.equal(upstairs.interactions.filter(item => item.kind === 'seat' || item.kind === 'desk').length, 44)
  for (const desk of focus) assert.equal(upstairs.tilemap[`${desk.approach.x}, ${desk.approach.y}`].privateAreaId, undefined)
})

test('every second floor seat is reachable from the stairs arrival', () => {
  const { tilemap, interactions } = map.rooms[1]
  const reachable = new Set(['2, 23'])
  const queue = [[2, 23]]
  for (let i = 0; i < queue.length; i++) {
    const [cx, cy] = queue[i]
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const key = `${cx + dx}, ${cy + dy}`
      if (tilemap[key] && !tilemap[key].impassable && !reachable.has(key)) { reachable.add(key); queue.push([cx + dx, cy + dy]) }
    }
  }
  for (const object of interactions) assert.ok(reachable.has(`${object.approach.x}, ${object.approach.y}`), object.id)
  assert.ok(map.rooms[1].signs.some(sign => sign.text === 'Área de foco · silêncio'))
  assert.ok(map.rooms[1].signs.some(sign => sign.text === 'Escada · Térreo'))
  assert.ok(map.rooms[0].signs.some(sign => sign.text === 'Escada · 2º andar'))
})
