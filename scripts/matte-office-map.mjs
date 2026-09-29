// Generates the public Matte office using sprites that ship with the app.
// Run with `node scripts/matte-office-map.mjs > /tmp/matte-office.json`.

const width = 34
const height = 24
const tilemap = {}

function tile(x, y) {
  const key = `${x}, ${y}`
  tilemap[key] ??= {}
  return tilemap[key]
}

function floorRect(x1, y1, x2, y2, floor) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) tile(x, y).floor = floor
  }
}

function furniture(x, y, name) {
  tile(x, y).above_floor = `village-${name}`
}

floorRect(0, 0, width - 1, height - 1, 'city-light_concrete')

// Perimeter and a clear central path from the entrance to reception.
for (let x = 0; x < width; x++) {
  for (const y of [0, height - 1]) {
    Object.assign(tile(x, y), { floor: 'city-dark_bricks_h', impassable: true })
  }
}
for (let y = 1; y < height - 1; y++) {
  for (const x of [0, width - 1]) {
    Object.assign(tile(x, y), { floor: 'city-dark_bricks_v', impassable: true })
  }
}

floorRect(14, 2, 19, 22, 'city-dark_concrete')
floorRect(11, 2, 22, 7, 'city-light_bricks_h')
floorRect(2, 9, 12, 19, 'city-light_bricks_v')
floorRect(21, 9, 31, 19, 'city-light_bricks_h')
floorRect(3, 20, 12, 22, 'city-light_bricks_h')

// Reception: a desk and waiting benches.
for (const x of [15, 16, 17, 18]) furniture(x, 4, 'table')
furniture(16, 6, 'chair_up')
furniture(17, 6, 'chair_up')
furniture(12, 5, 'bench_left')
furniture(13, 5, 'bench_right')
furniture(20, 5, 'bench_left')
furniture(21, 5, 'bench_right')

// Two banks of individual workstations. The central aisle remains open.
for (const y of [11, 15]) {
  for (const x of [4, 9]) {
    furniture(x, y, 'table')
    furniture(x + 1, y, 'table')
    furniture(x, y + 1, 'chair_down')
    furniture(x + 1, y + 1, 'chair_down')
  }
}

// Meeting area: every walkable tile shares a private audio channel.
for (let y = 9; y <= 19; y++) {
  for (let x = 21; x <= 31; x++) tile(x, y).privateAreaId = 'matte-reuniao'
}
for (let x = 24; x <= 28; x++) {
  furniture(x, 13, 'table')
  furniture(x, 14, 'table')
}
for (const x of [24, 26, 28]) {
  furniture(x, 12, 'chair_up')
  furniture(x, 15, 'chair_down')
}
furniture(23, 13, 'chair_right')
furniture(29, 13, 'chair_left')

// Small lounge and plants soften the shared space.
for (const [x, y] of [[4, 21], [7, 21], [10, 21]]) {
  furniture(x, y, 'bench_left')
  furniture(x + 1, y, 'bench_right')
}
for (const [x, y] of [[2, 2], [31, 2], [2, 21], [31, 21], [7, 5], [26, 5]]) {
  tile(x, y).above_floor = 'grasslands-blue_flower_2'
}

const map = {
  rooms: [{ name: 'Escritório Matte', tilemap }],
  spawnpoint: { roomIndex: 0, x: 16, y: 10 },
}

if (process.argv[1]?.endsWith('matte-office-map.mjs')) {
  process.stdout.write(JSON.stringify(map))
}

export { map }
