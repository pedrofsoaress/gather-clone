// Layout of the annex wing right of the Matte office, in tiles (32 px).
// The art (scripts/annex-art/compose.py) and the map (scripts/matte-office-map.mjs)
// are both generated from these numbers so they always line up.
// Rectangles are inclusive: { x1, y1, x2, y2 } and [x1, y1, x2, y2].

export const TILE = 32
export const OFFICE_WIDTH = 50
export const MAP_WIDTH = 86
export const MAP_HEIGHT = 30

// Opening in the office's east wall (x = 49), in the right work area.
export const passage = { x: 49, ys: [15, 16] }

export const annex = {
  reveal: { x: 50, y: 0, width: 36, height: 30 },
  triggers: [[49, 15], [49, 16]],
}

export const corridor = { x1: 50, y1: 1, x2: 52, y2: 28 }
export const hallway = { x1: 53, y1: 17, x2: 84, y2: 18 }

export const training = {
  id: 'matte-training',
  label: 'Sala de treinamento',
  interior: { x1: 54, y1: 1, x2: 84, y2: 15 },
  stage: { x1: 62, y1: 1, x2: 76, y2: 3 },
  screen: { x1: 66, y1: 1, x2: 72, y2: 1 },
  presentationApproach: [67, 3],
  stageMic: [69, 3],
  audienceMic: [69, 10],
  seatColumns: [58, 60, 62, 64, 66, 72, 74, 76, 78, 80],
  seatRows: [6, 8, 10, 12, 14],
}

// Where the seated avatar is drawn relative to its seat tile, and where the
// chair art is pasted relative to the seat tile (both in tiles).
export const SEAT_VISUAL = { dx: 0.15, dy: 0.2 }
export const CHAIR_OFFSET = { dx: -0.3, dy: -0.6 }

export const oneOnOnes = [54, 60, 66, 72].map((x1, index) => ({
  id: `one-on-one-${index + 1}`,
  label: `1:1 · ${index + 1}`,
  x1,
  interior: { x1, y1: 20, x2: x1 + 4, y2: 28 },
  capacity: 3,
}))

export const directors = {
  id: 'matte-directors',
  label: 'Diretoria',
  interior: { x1: 78, y1: 20, x2: 84, y2: 28 },
}

export const walls = [
  [50, 0, 85, 0],
  [50, 29, 85, 29],
  [85, 0, 85, 29],
  [53, 0, 53, 16],
  [53, 16, 84, 16],
  [53, 19, 84, 19],
  [53, 19, 53, 29],
  [59, 19, 59, 29],
  [65, 19, 65, 29],
  [71, 19, 71, 29],
  [77, 19, 77, 29],
]

export const doors = [
  [53, 7, 53, 8],
  ...oneOnOnes.map(room => [room.x1 + 1, 19, room.x1 + 2, 19]),
  [80, 19, 81, 19],
]

export const signs = [
  { text: 'Salas →', x: 47.5, y: 14.3 },
  { text: training.label, x: 51.5, y: 6.3 },
  ...oneOnOnes.map(room => ({ text: room.label, x: room.x1 + 2.5, y: 18.5 })),
  { text: 'Diretoria · Pedro Soares', x: 81, y: 18.5 },
]

if (process.argv[1]?.endsWith('annex-layout.mjs')) {
  process.stdout.write(JSON.stringify({
    TILE, OFFICE_WIDTH, MAP_WIDTH, MAP_HEIGHT, passage, annex, corridor, hallway,
    training, SEAT_VISUAL, CHAIR_OFFSET, oneOnOnes, directors, walls, doors, signs,
  }))
}
