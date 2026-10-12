// Generates the public Matte office. The artwork lives in frontend/public.
// Run with `node scripts/matte-office-map.mjs > /tmp/matte-office.json`.

import { MAP_WIDTH, MAP_HEIGHT, annex, passage, corridor, hallway, walls, doors, training, oneOnOnes, directors, signs, SEAT_VISUAL, groundStairs, officeStairs } from './annex-layout.mjs'
import { FLOOR2_WIDTH, FLOOR2_HEIGHT, floor2Stairs, cabins, cabinWalls, islands, floor2Directors, floor2Signs } from './floor2-layout.mjs'

const width = MAP_WIDTH
const height = MAP_HEIGHT
const tilemap = {}

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) tilemap[`${x}, ${y}`] = {}
}

function tile(map, x, y) {
  return map[`${x}, ${y}`]
}

function block(map, x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) tile(map, x, y).impassable = true
  }
}

function open(map, x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) delete tile(map, x, y).impassable
  }
}

// Office walls, as drawn in the office art (frontend/public/matte-office-v2.png),
// checked tile by tile on an overlay of this map on the art. Rectangles are
// inclusive [x1, y1, x2, y2]. The wood bands in the partitions are windows, not
// doors: the rooms open onto the two brick corridors (x 16..17 and 32..33) that
// run down from the stair doorways.
const officeWalls = {
  top: [0, 0, 49, 0],
  bottom: [0, 29, 49, 29],
  west: [0, 0, 0, 29],
  east: [49, 0, 49, 29],
  backWallFace: [1, 1, 48, 1],          // face of the top wall, with the stair door panels in it
  loungeBackWall: [1, 2, 15, 2],        // the lounge's wall face reaches down to row 2
  loungeStairPanel: [15, 3, 15, 3],     // glass panel left of the left stair doorway
  kitchenStairPanel: [34, 2, 34, 3],    // glass panel right of the right stair doorway
  kitchenEast: [48, 1, 48, 8],          // the east wall is thicker along the kitchen
  loungeWest: [1, 3, 1, 8],             // and along the lounge, the same strip on the west side
  boardroomWest: [18, 1, 18, 9],        // glass walls of the boardroom
  boardroomEast: [31, 1, 31, 9],
  boardroomGlassLeft: [19, 8, 22, 8],
  boardroomGlassRight: [27, 8, 30, 8],
  boardroomSill: [18, 9, 31, 9],
  loungePartition: [1, 9, 15, 9],
  kitchenPartition: [34, 9, 48, 9],
  workshopPartition: [1, 17, 17, 17],
  gamesPartition: [32, 17, 48, 17],
  workshopEast: [17, 17, 17, 27],
  gamesWest: [32, 17, 32, 27],
  workshopFront: [1, 27, 16, 27],       // front wall of the office, beside the entrance
  gamesFront: [33, 27, 48, 27],
  entranceLeft: [18, 25, 19, 27],
  entranceLeftWindow: [20, 26, 22, 27],
  entranceRightWindow: [28, 26, 29, 27],
  entranceRightFrame: [27, 26, 27, 27], // the right frame of the glass doors, as (22, 26..27) on the left
  entranceRight: [30, 25, 31, 27],
}

// Openings in those walls. The boardroom's glass row 8 is open from 23 to 26,
// where its doors are drawn (like the opening in the sill below).
const officeOpenings = {
  annexPassage: [passage.x, passage.ys[0], passage.x, passage.ys[passage.ys.length - 1]],
  loungeCorridor: [16, 9, 17, 9],
  kitchenCorridor: [32, 9, 33, 9],
  boardroomDoor: [23, 9, 26, 9],
  workshopDoor: [16, 17, 16, 17],
  gamesDoor: [33, 17, 33, 17],
}

for (const [x1, y1, x2, y2] of Object.values(officeWalls)) block(tilemap, x1, y1, x2, y2)
for (const [x1, y1, x2, y2] of Object.values(officeOpenings)) open(tilemap, x1, y1, x2, y2)

// Furniture is drawn in the background image; these rectangles keep players
// from walking across desks, tables, sofas, counters, and the ping-pong table.
block(tilemap, 3, 1, 9, 3)     // lounge bookshelf
block(tilemap, 5, 4, 10, 6)    // lounge sofa
block(tilemap, 7, 7, 8, 7)     // lounge coffee table
block(tilemap, 21, 3, 28, 6)   // boardroom table; its chair row 7 is the way round inside the glass
block(tilemap, 35, 1, 47, 4)   // kitchen counter and vending machines
block(tilemap, 38, 6, 40, 7)   // kitchen table; leave a path around each chair
block(tilemap, 43, 6, 47, 7)   // kitchen bar; stools stay approachable from below
for (const y of [11, 14]) {
  block(tilemap, 5, y, 9, y + 1)
  block(tilemap, 11, y, 15, y + 1)
  block(tilemap, 35, y, 39, y + 1)
  block(tilemap, 41, y, 45, y + 1)
}
block(tilemap, 22, 12, 28, 15) // shared project table
block(tilemap, 2, 19, 5, 21)   // workshop shelves
block(tilemap, 5, 22, 11, 24)  // workshop workbench
block(tilemap, 21, 20, 28, 22) // reception desk
block(tilemap, 35, 21, 38, 25) // ping-pong table
block(tilemap, 42, 21, 47, 23) // games lounge sofa
// Built-in pieces standing against the walls.
block(tilemap, 15, 7, 15, 8)   // lounge slatted divider
block(tilemap, 1, 10, 2, 13)   // left work area file cabinet and the board on it
block(tilemap, 48, 10, 48, 13) // right work area tall shelf
block(tilemap, 2, 18, 4, 18)   // things on top of the workshop shelves
block(tilemap, 16, 22, 16, 24) // workshop sideboard
block(tilemap, 1, 24, 2, 26)   // workshop side table by the west wall
block(tilemap, 3, 25, 3, 26)   // workshop aquarium cabinet
block(tilemap, 33, 22, 33, 24) // games room sideboard

// A private voice channel for the glass-walled boardroom.
for (let y = 1; y <= 8; y++) {
  for (let x = 18; x <= 31; x++) tile(tilemap, x, y).privateAreaId = 'matte-boardroom'
}

// Annex wing: walls with door openings, furniture, and the areas of each room.
for (const [x1, y1, x2, y2] of walls) block(tilemap, x1, y1, x2, y2)
for (const [x1, y1, x2, y2] of doors) open(tilemap, x1, y1, x2, y2)
block(tilemap, training.screen.x1, training.screen.y1, training.screen.x2, training.screen.y2)
block(tilemap, corridor.x1, 1, MAP_WIDTH - 2, 1)                       // face of the back wall
for (const x of [training.stage.x1, training.stage.x2]) block(tilemap, x, 2, x, 2) // stage speakers
for (const room of oneOnOnes) {
  block(tilemap, room.x1 + 1, 22, room.x1 + 3, 23) // round table
  block(tilemap, room.x1 + 4, 25, room.x1 + 4, 28) // shelves
}
block(tilemap, 79, 21, 83, 22)                                                    // directors' desk

function area(map, rect, key, id) {
  for (let y = rect.y1; y <= rect.y2; y++) {
    for (let x = rect.x1; x <= rect.x2; x++) tile(map, x, y)[key] = id
  }
}
area(tilemap, training.interior, 'privateAreaId', training.id)
for (const room of oneOnOnes) area(tilemap, room.interior, 'privateAreaId', room.id)
area(tilemap, directors.interior, 'privateAreaId', directors.id)

const areas = {
  [training.id]: { label: training.label, meeting: { stage: { ...training.stage } } },
  ...Object.fromEntries(oneOnOnes.map(room => [room.id, { label: room.label, capacity: room.capacity }])),
  [directors.id]: { label: directors.label },
}

function officeObject(id, kind, label, [x, y, width, height], [approachX, approachY], extra = {}) {
  return {
    id, kind, label,
    bounds: { x, y, width, height },
    approach: { x: approachX, y: approachY },
    ...extra,
  }
}

const trainingObjects = [
  officeObject('training-screen', 'presentation', 'Tela do treinamento', [training.screen.x1, training.screen.y1, training.screen.x2 - training.screen.x1 + 1, 1], training.presentationApproach, { config: { deckId: 'matte-training', slides: [
    { title: 'Sala de treinamento', body: 'Quem está no palco apresenta e controla os microfones. Para falar, ligue seu microfone ou clique em Pedir para falar.' },
  ] } }),
]

const trainingSeats = training.seatRows.flatMap((row, rowIndex) => training.seatColumns.map((column, columnIndex) =>
  officeObject(`training-seat-${rowIndex * 10 + columnIndex + 1}`, 'seat', `Treinamento · fileira ${rowIndex + 1}, lugar ${columnIndex + 1}`,
    [column - 0.2, row - 0.6, 1.4, 1.6], [column, row],
    { sitRange: 0, seatVisual: { x: column + SEAT_VISUAL.dx, y: row + SEAT_VISUAL.dy, facing: 'up' } })))

// Each 1:1 room copies the kitchen round table shifted by (x1 - 37, 16).
const oneOnOneSeats = oneOnOnes.flatMap(room => {
  const dx = room.x1 - 37
  const dy = 16
  return [
    officeObject(`${room.id}-left`, 'seat', `${room.label} · esquerda`, [37.6 + dx, 5.7 + dy, 1, 1.3], [38 + dx, 5 + dy], { seatVisual: { x: 37.9 + dx, y: 6.15 + dy, facing: 'down' } }),
    officeObject(`${room.id}-right`, 'seat', `${room.label} · direita`, [39.5 + dx, 5.7 + dy, 1, 1.3], [40 + dx, 5 + dy], { seatVisual: { x: 39.9 + dx, y: 6.15 + dy, facing: 'down' } }),
    officeObject(`${room.id}-front`, 'seat', `${room.label} · frente`, [37.6 + dx, 7.7 + dy, 1, 1.3], [38 + dx, 8 + dy], { seatVisual: { x: 37.9 + dx, y: 7.85 + dy, facing: 'up' } }),
  ]
})

// The directors' desk copies a work-area desk shifted by (+44, +10); the
// armchairs copy the reception set shifted by (+56.5, +2).
const directorsObjects = [
  officeObject('directors-desk', 'desk', 'Diretoria · mesa do Pedro', [79, 21, 5, 2], [81, 23], { seatVisual: { x: 80.5, y: 23.35, facing: 'up' } }),
  officeObject('directors-armchair-left', 'seat', 'Diretoria · poltrona esquerda', [78.5, 25, 2, 3], [79, 28], { seatVisual: { x: 78.8, y: 25.4, facing: 'right' } }),
  officeObject('directors-armchair-right', 'seat', 'Diretoria · poltrona direita', [82.5, 25, 2, 3], [83, 28], { seatVisual: { x: 83.1, y: 25.4, facing: 'left' } }),
]

const interactions = [
  officeObject('lounge-books', 'guide', 'Estante do lounge', [2, 1, 8, 3], [10, 3]),
  officeObject('boardroom-table', 'board', 'Mesa da reunião', [21, 3, 8, 5], [25, 8]),
  officeObject('boardroom-screen', 'presentation', 'Apresentação da reunião', [18, 2, 2, 2], [20, 3], { config: { deckId: 'matte-intro', slides: [
    { title: 'Escritório Matte', body: 'Um espaço para trabalhar, conversar e construir juntos.' },
    { title: 'Como usar', body: 'Aproxime-se dos objetos para interagir. Nas salas de reunião, converse por proximidade.' },
    { title: 'Vamos colaborar', body: 'Compartilhe ideias no quadro e use a reunião para apresentar seu projeto.' },
  ] } }),
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
  officeObject('collab-board', 'external', 'Quadro colaborativo', [12, 22, 2, 2], [14, 24], { config: { url: 'https://miro.com/', allowedHosts: ['miro.com'], roomEditable: true } }),
  officeObject('shared-piano', 'external', 'Piano compartilhado', [2, 7, 2, 1], [4, 8], { config: { url: 'https://musiclab.chromeexperiments.com/Shared-Piano/', allowedHosts: ['musiclab.chromeexperiments.com'], roomEditable: true } }),
  officeObject('lounge-speaker', 'speaker', 'Caixa de som do lounge', [13, 4, 1, 1], [13, 5], { config: { rangeTiles: 7 } }),
  officeObject('caju', 'pet', 'Caju · gato do escritório', [29, 24, 1, 1], [30, 24], { config: { animationSet: 'matte-cat' } }),
  officeObject('light-lounge', 'light', 'Luz do lounge', [14, 2, 1, 1], [14, 3], { config: { radiusTiles: 7, color: '#fff2bb', intensity: 0.6 } }),
  officeObject('light-boardroom', 'light', 'Luz da reunião', [30, 1, 1, 1], [30, 2], { config: { radiusTiles: 8, color: '#d6eaff', intensity: 0.5 } }),
  officeObject('light-work', 'light', 'Luz da área de trabalho', [30, 14, 1, 1], [30, 15], { config: { radiusTiles: 9, color: '#e4fff1', intensity: 0.5 } }),
  officeObject('reception', 'guestbook', 'Recepção', [21, 20, 8, 3], [25, 19]),
  officeObject('pingpong', 'pingpong', 'Pingue-pongue', [35, 21, 4, 5], [34, 23]),
  ...trainingObjects,

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
  officeObject('boardroom-bottom-left', 'seat', 'Reunião · inferior esquerda', [22.3, 6.4, 1.3, 1.6], [23, 7], { seatVisual: { x: 22.65, y: 7, facing: 'up' } }),
  officeObject('boardroom-bottom-middle', 'seat', 'Reunião · inferior central', [24.3, 6.4, 1.3, 1.6], [25, 7], { seatVisual: { x: 24.65, y: 7, facing: 'up' } }),
  officeObject('boardroom-bottom-right', 'seat', 'Reunião · inferior direita', [26.3, 6.4, 1.3, 1.6], [27, 7], { seatVisual: { x: 26.65, y: 7, facing: 'up' } }),

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
  officeObject('reception-seats', 'seat', 'Poltrona esquerda', [22, 23, 2, 3], [23, 25], { seatVisual: { x: 22.3, y: 23.4, facing: 'right' } }),
  officeObject('reception-chair-right', 'seat', 'Poltrona direita', [26, 23, 2, 3], [27, 25], { seatVisual: { x: 26.6, y: 23.4, facing: 'left' } }),

  officeObject('games-sofa', 'seat', 'Sofá dos jogos · esquerda', [42.8, 21, 1.5, 2.1], [43, 24], { seatVisual: { x: 43.25, y: 21.6, facing: 'down' } }),
  officeObject('games-sofa-middle', 'seat', 'Sofá dos jogos · meio', [44.3, 21, 1.5, 2.1], [45, 24], { seatVisual: { x: 44.75, y: 21.6, facing: 'down' } }),
  officeObject('games-sofa-right', 'seat', 'Sofá dos jogos · direita', [45.8, 21, 1.5, 2.1], [47, 24], { seatVisual: { x: 46.25, y: 21.6, facing: 'down' } }),
  officeObject('workshop-stool-left', 'seat', 'Banqueta da oficina · esquerda', [3, 22, 1.2, 1.5], [3, 23], { seatVisual: { x: 3.1, y: 22.65, facing: 'right' } }),
  officeObject('workshop-stool-middle', 'seat', 'Banqueta da oficina · central', [5.8, 24.5, 1.2, 1.4], [6, 26], { seatVisual: { x: 5.9, y: 25.1, facing: 'up' } }),
  officeObject('workshop-stool-right', 'seat', 'Banqueta da oficina · direita', [8.5, 24.5, 1.2, 1.4], [9, 26], { seatVisual: { x: 8.6, y: 25.1, facing: 'up' } }),
  ...trainingSeats,
  ...oneOnOneSeats,
  ...directorsObjects,
]

// Ground floor stairs: the top step goes upstairs, the steps below are art only.
for (let x = groundStairs.x1; x <= groundStairs.x2; x++) {
  tile(tilemap, x, groundStairs.triggerY).teleporter = { roomIndex: 1, x: floor2Stairs.arrival[0], y: floor2Stairs.arrival[1] }
}
block(tilemap, groundStairs.x1, groundStairs.triggerY + 1, groundStairs.x2, groundStairs.y2)
// The office's stair doorways beside the boardroom also go upstairs, from their back tile.
for (const stairs of officeStairs) {
  for (let x = stairs.x1; x <= stairs.x2; x++) {
    tile(tilemap, x, stairs.triggerY).teleporter = { roomIndex: 1, x: floor2Stairs.arrival[0], y: floor2Stairs.arrival[1] }
  }
  // The sign hangs on the back wall face (officeWalls.backWallFace); the mat in front stays open.
  for (let x = stairs.x1; x <= stairs.x2; x++) {
    if (tile(tilemap, x, stairs.signY).impassable !== true) throw new Error(`stairs sign over walkable ${x}, ${stairs.signY}`)
    if (tile(tilemap, x, stairs.frontY).impassable) throw new Error(`stairs front ${x}, ${stairs.frontY} is blocked`)
  }
}

// Second floor.
const floor2 = {}
for (let y = 0; y < FLOOR2_HEIGHT; y++) for (let x = 0; x < FLOOR2_WIDTH; x++) floor2[`${x}, ${y}`] = {}
block(floor2, 0, 0, FLOOR2_WIDTH - 1, 0)
block(floor2, 0, FLOOR2_HEIGHT - 1, FLOOR2_WIDTH - 1, FLOOR2_HEIGHT - 1)
block(floor2, 0, 0, 0, FLOOR2_HEIGHT - 1)
block(floor2, FLOOR2_WIDTH - 1, 0, FLOOR2_WIDTH - 1, FLOOR2_HEIGHT - 1)
block(floor2, 1, 1, FLOOR2_WIDTH - 2, 1) // row 1 is the back wall's face in the art
for (let x = floor2Stairs.x1; x <= floor2Stairs.x2; x++) {
  tile(floor2, x, floor2Stairs.triggerY).teleporter = { roomIndex: 0, x: groundStairs.arrival[0], y: groundStairs.arrival[1] }
}
block(floor2, floor2Stairs.x1, floor2Stairs.triggerY + 1, floor2Stairs.x2, floor2Stairs.y2)
// Micro cabins: the desk, the glass side walls, and the chair row as the cabin's closed conversation.
for (const cabin of cabins) {
  block(floor2, cabin.x, cabin.y, cabin.x + 4, cabin.y + 1)
  area(floor2, { x1: cabin.x, y1: cabin.y + 2, x2: cabin.x + 4, y2: cabin.y + 2 }, 'privateAreaId', cabin.id)
}
for (const wall of cabinWalls) block(floor2, wall.x, wall.y1, wall.x, wall.y2)
for (const island of islands) {
  block(floor2, island.ox, island.oy, island.ox + 6, island.oy + 3)
  area(floor2, island.area, 'privateAreaId', island.id)
}
// Directors' room: walls with the door, the desk and the coffee table, and its private area.
const fd = floor2Directors
block(floor2, fd.wallX, fd.wallY, FLOOR2_WIDTH - 2, fd.wallY)
block(floor2, fd.wallX, fd.wallY, fd.wallX, FLOOR2_HEIGHT - 2)
open(floor2, fd.door.x1, fd.wallY, fd.door.x2, fd.wallY)
block(floor2, fd.desk.x, fd.desk.y, fd.desk.x + 4, fd.desk.y + 1)
block(floor2, fd.coffeeTable.x, fd.coffeeTable.y1, fd.coffeeTable.x, fd.coffeeTable.y2)
area(floor2, fd.interior, 'privateAreaId', fd.id)

// Stepping onto a cabin's chair sits you down (sitRange 0), so people walking
// along the aisle below do not.
const cabinObjects = cabins.map(cabin => officeObject(cabin.id, 'desk', cabin.label,
  [cabin.x, cabin.y, 5, 2], [cabin.x + 2, cabin.y + 2], { sitRange: 0, seatVisual: { x: cabin.x + 1.5, y: cabin.y + 2.35, facing: 'up' } }))

// Each island copies the six project-table chairs, shifted from the office table at (22, 12).
const islandSeats = islands.flatMap(island => {
  const dx = island.ox - 22
  const dy = island.oy - 12
  return [
    officeObject(`${island.id}-top-left`, 'seat', `${island.label} · superior esquerda`, [22.9 + dx, 11.1 + dy, 1.2, 1.2], [23 + dx, 11 + dy], { seatVisual: { x: 23 + dx, y: 11.5 + dy, facing: 'down' } }),
    officeObject(`${island.id}-top-right`, 'seat', `${island.label} · superior direita`, [26 + dx, 11.1 + dy, 1.2, 1.2], [26 + dx, 11 + dy], { seatVisual: { x: 26.1 + dx, y: 11.5 + dy, facing: 'down' } }),
    officeObject(`${island.id}-left`, 'seat', `${island.label} · lateral esquerda`, [21.2 + dx, 13 + dy, 1.2, 2], [20 + dx, 14 + dy], { seatVisual: { x: 21.35 + dx, y: 13.6 + dy, facing: 'right' } }),
    officeObject(`${island.id}-right`, 'seat', `${island.label} · lateral direita`, [27.8 + dx, 13 + dy, 1.2, 2], [29 + dx, 14 + dy], { seatVisual: { x: 28.1 + dx, y: 13.6 + dy, facing: 'left' } }),
    officeObject(`${island.id}-bottom-left`, 'seat', `${island.label} · inferior esquerda`, [22.9 + dx, 14.8 + dy, 1.2, 1.3], [23 + dx, 16 + dy], { seatVisual: { x: 23 + dx, y: 15.3 + dy, facing: 'up' } }),
    officeObject(`${island.id}-bottom-right`, 'seat', `${island.label} · inferior direita`, [26 + dx, 14.8 + dy, 1.2, 1.3], [26 + dx, 16 + dy], { seatVisual: { x: 26.1 + dx, y: 15.3 + dy, facing: 'up' } }),
  ]
})

// The desk copies the ground directors' desk (79, 21) at fd.desk; the armchairs
// copy the reception set shifted by fd.lounge, so their seats keep the ground
// offsets. The room is a row shorter than the ground one, so each armchair is
// approached from the row just below its seat.
const { dx: lx, dy: ly } = fd.lounge
const floor2DirectorsObjects = [
  officeObject(`${fd.id}-desk`, 'desk', 'Diretoria · mesa', [fd.desk.x, fd.desk.y, 5, 2], [fd.desk.x + 2, fd.desk.y + 2],
    { seatVisual: { x: fd.desk.x + 1.5, y: fd.desk.y + 2.35, facing: 'up' } }),
  officeObject(`${fd.id}-armchair-left`, 'seat', 'Diretoria · poltrona esquerda', [22 + lx, 23 + ly, 2, 2], [23 + lx - 0.5, 25 + ly],
    { seatVisual: { x: 22.3 + lx, y: 23.4 + ly, facing: 'right' } }),
  officeObject(`${fd.id}-armchair-right`, 'seat', 'Diretoria · poltrona direita', [26 + lx, 23 + ly, 2, 2], [27 + lx - 0.5, 25 + ly],
    { seatVisual: { x: 26.6 + lx, y: 23.4 + ly, facing: 'left' } }),
]

const floor2Lights = [
  officeObject('light-cabins', 'light', 'Luz das cabines', [12, 1, 1, 1], [12, 2], { config: { radiusTiles: 9, color: '#e4fff1', intensity: 0.5 } }),
  officeObject('light-islands', 'light', 'Luz das ilhas', [37, 1, 1, 1], [37, 2], { config: { radiusTiles: 9, color: '#fff2bb', intensity: 0.5 } }),
]

const map = {
  rooms: [{
    name: 'Escritório Matte',
    backgroundImage: { src: '/matte-office-v3.png', width: width * 32, height: height * 32 },
    tilemap,
    interactions,
    areas,
    annex,
    signs,
  }, {
    name: '2º andar',
    backgroundImage: { src: '/matte-floor2.png', width: FLOOR2_WIDTH * 32, height: FLOOR2_HEIGHT * 32 },
    tilemap: floor2,
    interactions: [...floor2Lights, ...cabinObjects, ...islandSeats, ...floor2DirectorsObjects],
    areas: {
      ...Object.fromEntries(cabins.map(cabin => [cabin.id, { label: cabin.label }])),
      ...Object.fromEntries(islands.map(island => [island.id, { label: island.label }])),
      [fd.id]: { label: fd.label },
    },
    signs: floor2Signs,
  }],
  spawnpoint: { roomIndex: 0, x: 25, y: 18 },
}

if (process.argv[1]?.endsWith('matte-office-map.mjs')) {
  process.stdout.write(JSON.stringify(map))
}

export { map }
