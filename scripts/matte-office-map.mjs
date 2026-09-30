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
block(38, 6, 40, 7)   // kitchen table; leave a path around each chair
block(43, 6, 47, 7)   // kitchen bar; stools stay approachable from below
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
  officeObject('boardroom-table', 'board', 'Mesa da reunião', [21, 3, 8, 5], [25, 8]),
  officeObject('coffee', 'drink', 'Café', [35, 1, 6, 4], [35, 5], { effect: 'coffee' }),
  officeObject('water', 'drink', 'Água', [41, 1, 2, 4], [42, 5], { effect: 'water' }),
  officeObject('vending', 'snack', 'Máquina de snacks', [43, 1, 5, 4], [46, 5], { effect: 'snack' }),
  officeObject('desk-left-1', 'desk', 'Mesa esquerda 1', [5, 11, 5, 2], [7, 13], { seatVisual: { x: 6.5, y: 13.35, facing: 'up' } }),
  officeObject('desk-left-2', 'desk', 'Mesa esquerda 2', [11, 11, 5, 2], [13, 13], { seatVisual: { x: 12.5, y: 13.35, facing: 'up' } }),
  officeObject('desk-left-3', 'desk', 'Mesa esquerda 3', [5, 14, 5, 2], [7, 16], { seatVisual: { x: 6.5, y: 16.35, facing: 'up' } }),
  officeObject('desk-left-4', 'desk', 'Mesa esquerda 4', [11, 14, 5, 2], [13, 16], { seatVisual: { x: 12.5, y: 16.35, facing: 'up' } }),
  officeObject('desk-right-1', 'desk', 'Mesa direita 1', [35, 11, 5, 2], [37, 13], { seatVisual: { x: 36.5, y: 13.35, facing: 'up' } }),
  officeObject('desk-right-2', 'desk', 'Mesa direita 2', [41, 11, 5, 2], [43, 13], { seatVisual: { x: 42.5, y: 13.35, facing: 'up' } }),
  officeObject('desk-right-3', 'desk', 'Mesa direita 3', [35, 14, 5, 2], [37, 16], { seatVisual: { x: 36.5, y: 16.35, facing: 'up' } }),
  officeObject('desk-right-4', 'desk', 'Mesa direita 4', [41, 14, 5, 2], [43, 16], { seatVisual: { x: 42.5, y: 16.35, facing: 'up' } }),
  officeObject('project-table', 'board', 'Mesa de projetos', [22, 12, 7, 4], [25, 16]),
  officeObject('workshop-shelves', 'guide', 'Prateleiras da oficina', [2, 19, 4, 3], [6, 20]),
  officeObject('workbench', 'board', 'Bancada de ideias', [5, 22, 7, 3], [8, 25]),
  officeObject('reception', 'guestbook', 'Recepção', [21, 20, 8, 3], [25, 19]),
  officeObject('pingpong', 'pingpong', 'Pingue-pongue', [35, 21, 4, 5], [34, 23]),

  // Individual places are last so their small hit areas take priority over
  // the larger tables and boards underneath them.
  officeObject('lounge-sofa', 'seat', 'Sofá do lounge · esquerda', [5.1, 4.2, 1.5, 2], [6, 7], { seatVisual: { x: 5.65, y: 4.9, facing: 'down' } }),
  officeObject('lounge-sofa-middle', 'seat', 'Sofá do lounge · meio', [6.6, 4.2, 1.5, 2], [7, 8], { seatVisual: { x: 7, y: 4.9, facing: 'down' } }),
  officeObject('lounge-sofa-right', 'seat', 'Sofá do lounge · direita', [8.1, 4.2, 1.5, 2], [9, 7], { seatVisual: { x: 8.35, y: 4.9, facing: 'down' } }),
  officeObject('lounge-armchair', 'seat', 'Poltrona do lounge', [10, 6.2, 1.6, 2.2], [11, 8], { seatVisual: { x: 10.3, y: 7.1, facing: 'left' } }),

  officeObject('boardroom-top-left', 'seat', 'Reunião · superior esquerda', [22.3, 2.8, 1.3, 1.4], [23, 2], { seatVisual: { x: 22.65, y: 4, facing: 'down' } }),
  officeObject('boardroom-top-middle', 'seat', 'Reunião · superior central', [24.3, 2.8, 1.3, 1.4], [25, 2], { seatVisual: { x: 24.65, y: 4, facing: 'down' } }),
  officeObject('boardroom-top-right', 'seat', 'Reunião · superior direita', [26.3, 2.8, 1.3, 1.4], [27, 2], { seatVisual: { x: 26.65, y: 4, facing: 'down' } }),
  officeObject('boardroom-left', 'seat', 'Reunião · lateral esquerda', [20.7, 4.1, 1.2, 2.2], [20, 5], { seatVisual: { x: 20.9, y: 4.6, facing: 'right' } }),
  officeObject('boardroom-right', 'seat', 'Reunião · lateral direita', [28.1, 4.1, 1.2, 2.2], [29, 5], { seatVisual: { x: 28.25, y: 4.6, facing: 'left' } }),
  officeObject('boardroom-bottom-left', 'seat', 'Reunião · inferior esquerda', [22.3, 6.4, 1.3, 1.6], [23, 8], { seatVisual: { x: 22.65, y: 7, facing: 'up' } }),
  officeObject('boardroom-bottom-middle', 'seat', 'Reunião · inferior central', [24.3, 6.4, 1.3, 1.6], [25, 8], { seatVisual: { x: 24.65, y: 7, facing: 'up' } }),
  officeObject('boardroom-bottom-right', 'seat', 'Reunião · inferior direita', [26.3, 6.4, 1.3, 1.6], [27, 8], { seatVisual: { x: 26.65, y: 7, facing: 'up' } }),

  officeObject('kitchen-top-left', 'seat', 'Cozinha · superior esquerda', [37.6, 5.7, 1, 1.3], [38, 5], { seatVisual: { x: 37.9, y: 6.15, facing: 'down' } }),
  officeObject('kitchen-top-right', 'seat', 'Cozinha · superior direita', [39.5, 5.7, 1, 1.3], [40, 5], { seatVisual: { x: 39.9, y: 6.15, facing: 'down' } }),
  officeObject('kitchen-table', 'seat', 'Cozinha · inferior esquerda', [37.6, 7.7, 1, 1.3], [38, 8], { seatVisual: { x: 37.9, y: 7.85, facing: 'up' } }),
  officeObject('kitchen-bottom-right', 'seat', 'Cozinha · inferior direita', [39.5, 7.7, 1, 1.3], [40, 8], { seatVisual: { x: 39.9, y: 7.85, facing: 'up' } }),
  officeObject('bar-stool-left', 'seat', 'Banqueta do bar · esquerda', [43.7, 7.8, 1, 1.3], [44, 8], { seatVisual: { x: 44.05, y: 8.15, facing: 'up' } }),
  officeObject('bar-stool-middle', 'seat', 'Banqueta do bar · meio', [45, 7.8, 1, 1.3], [45, 8], { seatVisual: { x: 45.4, y: 8.15, facing: 'up' } }),
  officeObject('bar-stool-right', 'seat', 'Banqueta do bar · direita', [46.3, 7.8, 1, 1.3], [47, 8], { seatVisual: { x: 46.7, y: 8.15, facing: 'up' } }),

  officeObject('project-top-left', 'seat', 'Projetos · superior esquerda', [22.9, 11.1, 1.2, 1.2], [23, 11], { seatVisual: { x: 23, y: 11.5, facing: 'down' } }),
  officeObject('project-top-right', 'seat', 'Projetos · superior direita', [26, 11.1, 1.2, 1.2], [26, 11], { seatVisual: { x: 26.1, y: 11.5, facing: 'down' } }),
  officeObject('project-left', 'seat', 'Projetos · lateral esquerda', [21.2, 13, 1.2, 2], [20, 14], { seatVisual: { x: 21.35, y: 13.6, facing: 'right' } }),
  officeObject('project-right', 'seat', 'Projetos · lateral direita', [27.8, 13, 1.2, 2], [29, 14], { seatVisual: { x: 28.1, y: 13.6, facing: 'left' } }),
  officeObject('project-bottom-left', 'seat', 'Projetos · inferior esquerda', [22.9, 14.8, 1.2, 1.3], [23, 16], { seatVisual: { x: 23, y: 15.3, facing: 'up' } }),
  officeObject('project-bottom-right', 'seat', 'Projetos · inferior direita', [26, 14.8, 1.2, 1.3], [26, 16], { seatVisual: { x: 26.1, y: 15.3, facing: 'up' } }),

  officeObject('reception-desk-chair', 'seat', 'Cadeira da recepção', [24.3, 18.6, 1.5, 1.7], [24, 19], { seatVisual: { x: 24.55, y: 19.5, facing: 'down' } }),
  officeObject('reception-seats', 'seat', 'Poltrona esquerda', [22, 23, 2, 3], [23, 26], { seatVisual: { x: 22.3, y: 23.4, facing: 'right' } }),
  officeObject('reception-chair-right', 'seat', 'Poltrona direita', [26, 23, 2, 3], [27, 26], { seatVisual: { x: 26.6, y: 23.4, facing: 'left' } }),

  officeObject('games-sofa', 'seat', 'Sofá dos jogos · esquerda', [42.8, 21, 1.5, 2.1], [43, 24], { seatVisual: { x: 43.25, y: 21.6, facing: 'down' } }),
  officeObject('games-sofa-middle', 'seat', 'Sofá dos jogos · meio', [44.3, 21, 1.5, 2.1], [45, 24], { seatVisual: { x: 44.75, y: 21.6, facing: 'down' } }),
  officeObject('games-sofa-right', 'seat', 'Sofá dos jogos · direita', [45.8, 21, 1.5, 2.1], [47, 24], { seatVisual: { x: 46.25, y: 21.6, facing: 'down' } }),
  officeObject('workshop-stool-left', 'seat', 'Banqueta da oficina · esquerda', [3, 22, 1.2, 1.5], [3, 23], { seatVisual: { x: 3.1, y: 22.65, facing: 'right' } }),
  officeObject('workshop-stool-middle', 'seat', 'Banqueta da oficina · central', [5.8, 24.5, 1.2, 1.4], [6, 26], { seatVisual: { x: 5.9, y: 25.1, facing: 'up' } }),
  officeObject('workshop-stool-right', 'seat', 'Banqueta da oficina · direita', [8.5, 24.5, 1.2, 1.4], [9, 26], { seatVisual: { x: 8.6, y: 25.1, facing: 'up' } }),
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
