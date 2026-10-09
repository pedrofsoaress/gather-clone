import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as layout from './annex-layout.mjs'

const inside = ({ x1, y1, x2, y2 }, x, y) => x >= x1 && x <= x2 && y >= y1 && y <= y2

test('the wing sits right of the office inside an 86 x 30 map', () => {
  assert.equal(layout.MAP_WIDTH, 86)
  assert.equal(layout.MAP_HEIGHT, 30)
  assert.deepEqual(layout.annex.reveal, { x: 50, y: 0, width: 36, height: 30 })
  assert.deepEqual(layout.annex.triggers, [[49, 15], [49, 16]])
  for (const [x1, y1, x2, y2] of [...layout.walls, ...layout.doors]) {
    assert.ok(x1 >= 49 && x2 <= 85 && y1 >= 0 && y2 <= 29 && x1 <= x2 && y1 <= y2)
  }
})

test('the training room has 50 distinct seats in 5 rows of 10 inside the room', () => {
  const seats = layout.training.seatRows.flatMap(row => layout.training.seatColumns.map(column => [column, row]))
  assert.equal(seats.length, 50)
  assert.equal(new Set(seats.map(String)).size, 50)
  for (const [x, y] of seats) assert.ok(inside(layout.training.interior, x, y), `${x},${y}`)
  assert.ok(inside(layout.training.interior, ...layout.training.stageMic))
  assert.ok(inside(layout.training.interior, ...layout.training.audienceMic))
  assert.ok(!seats.some(([x, y]) => x === layout.training.audienceMic[0] && y === layout.training.audienceMic[1]))
})

test('four 1:1 rooms and the directors room do not overlap and each has a door', () => {
  assert.equal(layout.oneOnOnes.length, 4)
  assert.deepEqual(layout.oneOnOnes.map(room => room.label), ['1:1 · 1', '1:1 · 2', '1:1 · 3', '1:1 · 4'])
  const rooms = [...layout.oneOnOnes.map(room => room.interior), layout.directors.interior]
  for (let a = 0; a < rooms.length; a++) for (let b = a + 1; b < rooms.length; b++) {
    assert.ok(rooms[a].x2 < rooms[b].x1 || rooms[b].x2 < rooms[a].x1, `rooms ${a} and ${b} overlap`)
  }
  for (const room of rooms) {
    assert.ok(layout.doors.some(([x1, y1, x2]) => y1 === room.y1 - 1 && x1 >= room.x1 && x2 <= room.x2), 'door above the room')
  }
})

test('signs use the agreed Portuguese texts', () => {
  assert.deepEqual(layout.signs.map(sign => sign.text), ['Salas →', 'Sala de treinamento', '1:1 · 1', '1:1 · 2', '1:1 · 3', '1:1 · 4', 'Diretoria · Pedro Soares'])
})
