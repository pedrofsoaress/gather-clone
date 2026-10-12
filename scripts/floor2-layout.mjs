// Layout of the second floor, in tiles (32 px). The art (scripts/annex-art/floor2.py)
// and the map (scripts/matte-office-map.mjs) are both generated from these numbers.
// Rectangles are inclusive: { x1, y1, x2, y2 }.

export const FLOOR2_WIDTH = 50
export const FLOOR2_HEIGHT = 30

// Stairs down in the bottom left corner. The top step (triggerY) sends people
// to the ground floor; `arrival` is where people from the ground floor appear.
export const floor2Stairs = { x1: 1, y1: 25, x2: 3, y2: 28, triggerY: 25, arrival: [2, 23] }

// Focus desks: a work-area desk (5 x 2 tiles) with its chair on the row below.
export const FOCUS_COLUMNS = [1, 7, 13, 19]
export const FOCUS_ROWS = [3, 7, 11, 15, 19]
export const focusDesks = FOCUS_ROWS.flatMap((y, row) => FOCUS_COLUMNS.map((x, column) => ({
  id: `focus-desk-${row * FOCUS_COLUMNS.length + column + 1}`, x, y,
})))

// Team islands: copies of the office project table (7 x 4 tiles at ox, oy) with
// its six chairs, each inside its own private conversation area.
const ISLAND_AREAS = [
  { x1: 27, y1: 2, x2: 37, y2: 10 },
  { x1: 38, y1: 2, x2: 48, y2: 10 },
  { x1: 27, y1: 12, x2: 37, y2: 20 },
  { x1: 38, y1: 12, x2: 48, y2: 20 },
]
export const islands = [[30, 4], [40, 4], [30, 14], [40, 14]].map(([ox, oy], index) => ({
  id: `island-${index + 1}`, label: `Ilha ${index + 1}`, ox, oy, area: ISLAND_AREAS[index],
}))

export const floor2Signs = [
  { text: 'Área de foco · silêncio', x: 12, y: 1.6 },
  ...islands.map(island => ({ text: island.label, x: island.ox + 3.5, y: island.oy - 1.6 })),
  { text: 'Escada · Térreo', x: 2.5, y: 23.6 },
]
