// Generates the public Matte office. The artwork lives in frontend/public.
// Run with `node scripts/matte-office-map.mjs > /tmp/matte-office.json`.

const width = 50
const height = 30
const tilemap = {}

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) tilemap[`${x}, ${y}`] = {}
}

function tile(x, y) {
  return tilemap[`${x}, ${y}`]
}

function block(x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) tile(x, y).impassable = true
  }
}

function open(x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) delete tile(x, y).impassable
  }
}

// Perimeter, partitions, and open doors between the rooms.
block(0, 0, 49, 0)
block(0, 29, 49, 29)
block(0, 0, 0, 29)
block(49, 0, 49, 29)
block(1, 9, 16, 9)
open(6, 9, 9, 9)
block(18, 9, 31, 9)
open(23, 9, 26, 9)
block(34, 9, 48, 9)
open(39, 9, 42, 9)
block(1, 17, 17, 17)
open(6, 17, 10, 17)
block(33, 17, 48, 17)
open(39, 17, 43, 17)
block(17, 19, 17, 26)
open(17, 25, 17, 26)
block(32, 19, 32, 26)
open(32, 25, 32, 26)

// Furniture is drawn in the background image; these rectangles keep players
// from walking across desks, tables, sofas, counters, and the ping-pong table.
block(3, 1, 9, 3)     // lounge bookshelf
block(5, 4, 10, 6)    // lounge sofa
block(7, 7, 8, 7)     // lounge coffee table
block(21, 3, 28, 7)   // boardroom table
block(35, 1, 47, 4)   // kitchen counter and vending machines
block(37, 5, 41, 7)   // kitchen table
block(43, 6, 47, 8)   // kitchen bar
for (const y of [11, 14]) {
  block(5, y, 9, y + 1)
  block(11, y, 15, y + 1)
  block(35, y, 39, y + 1)
  block(41, y, 45, y + 1)
}
block(22, 12, 28, 15) // shared project table
block(2, 19, 5, 21)   // workshop shelves
block(5, 22, 11, 24)  // workshop workbench
block(21, 20, 28, 22) // reception desk
block(35, 21, 38, 25) // ping-pong table
block(42, 21, 47, 23) // games lounge sofa

// A private voice channel for the glass-walled boardroom.
for (let y = 1; y <= 8; y++) {
  for (let x = 18; x <= 31; x++) tile(x, y).privateAreaId = 'matte-boardroom'
}

function officeObject(id, kind, label, [x, y, width, height], [approachX, approachY], extra = {}) {
  return {
    id, kind, label,
    bounds: { x, y, width, height },
    approach: { x: approachX, y: approachY },
    ...extra,
  }
}

const interactions = [
  officeObject('lounge-books', 'guide', 'Estante do lounge', [2, 1, 8, 3], [10, 3]),
  officeObject('lounge-sofa', 'seat', 'Sofá do lounge', [5, 4, 6, 3], [11, 6], { seatVisual: { x: 8, y: 5 } }),
  officeObject('boardroom-table', 'board', 'Mesa da reunião', [21, 3, 8, 5], [25, 8]),
  officeObject('coffee', 'drink', 'Café', [35, 1, 6, 4], [35, 5], { effect: 'coffee' }),
  officeObject('water', 'drink', 'Água', [41, 1, 2, 4], [42, 5], { effect: 'water' }),
  officeObject('vending', 'snack', 'Máquina de snacks', [43, 1, 5, 4], [46, 5], { effect: 'snack' }),
  officeObject('kitchen-table', 'seat', 'Mesa da cozinha', [37, 5, 5, 3], [37, 8], { seatVisual: { x: 39, y: 6 } }),
  officeObject('desk-left-1', 'desk', 'Mesa esquerda 1', [5, 11, 5, 2], [7, 13], { seatVisual: { x: 7, y: 13 } }),
  officeObject('desk-left-2', 'desk', 'Mesa esquerda 2', [11, 11, 5, 2], [13, 13], { seatVisual: { x: 13, y: 13 } }),
  officeObject('desk-left-3', 'desk', 'Mesa esquerda 3', [5, 14, 5, 2], [7, 16], { seatVisual: { x: 7, y: 16 } }),
  officeObject('desk-left-4', 'desk', 'Mesa esquerda 4', [11, 14, 5, 2], [13, 16], { seatVisual: { x: 13, y: 16 } }),
  officeObject('desk-right-1', 'desk', 'Mesa direita 1', [35, 11, 5, 2], [37, 13], { seatVisual: { x: 37, y: 13 } }),
  officeObject('desk-right-2', 'desk', 'Mesa direita 2', [41, 11, 5, 2], [43, 13], { seatVisual: { x: 43, y: 13 } }),
  officeObject('desk-right-3', 'desk', 'Mesa direita 3', [35, 14, 5, 2], [37, 16], { seatVisual: { x: 37, y: 16 } }),
  officeObject('desk-right-4', 'desk', 'Mesa direita 4', [41, 14, 5, 2], [43, 16], { seatVisual: { x: 43, y: 16 } }),
  officeObject('project-table', 'board', 'Mesa de projetos', [22, 12, 7, 4], [25, 16]),
  officeObject('workshop-shelves', 'guide', 'Prateleiras da oficina', [2, 19, 4, 3], [6, 20]),
  officeObject('workbench', 'board', 'Bancada de ideias', [5, 22, 7, 3], [8, 25]),
  officeObject('reception', 'guestbook', 'Recepção', [21, 20, 8, 3], [25, 19]),
  officeObject('reception-seats', 'seat', 'Poltronas da recepção', [22, 23, 7, 3], [25, 26], { seatVisual: { x: 25, y: 24 } }),
  officeObject('pingpong', 'pingpong', 'Pingue-pongue', [35, 21, 4, 5], [34, 23]),
  officeObject('games-sofa', 'seat', 'Sofá dos jogos', [42, 21, 6, 3], [42, 24], { seatVisual: { x: 44, y: 22 } }),
]

const map = {
  rooms: [{
    name: 'Escritório Matte',
    backgroundImage: { src: '/matte-office-v2.png', width: width * 32, height: height * 32 },
    tilemap,
    interactions,
  }],
  spawnpoint: { roomIndex: 0, x: 25, y: 18 },
}

if (process.argv[1]?.endsWith('matte-office-map.mjs')) {
  process.stdout.write(JSON.stringify(map))
}

export { map }
