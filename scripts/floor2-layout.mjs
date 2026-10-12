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

// Directors' room in the bottom right corner of the hall, in the style of the
// ground floor's (scripts/annex-layout.mjs `directors`). Its walls are the top
// row (wallY) and the left column (wallX); the outer walls close it on the
// right and below. The door in the top wall opens onto the walk under the
// islands (row 21, outside their private areas). Inside: the office desk with
// its chair at the back right (desk tiles 5 x 2 from `desk`), and by the door
// the reception armchairs and coffee table, shifted from the reception set by
// `lounge` (the ground directors' room uses +56.5, +2).
export const floor2Directors = {
  id: 'floor2-directors',
  label: 'Diretoria',
  wallX: 36,
  wallY: 22,
  interior: { x1: 37, y1: 23, x2: 48, y2: 28 },
  door: { x1: 40, x2: 41 },
  desk: { x: 44, y: 23 },
  lounge: { dx: 15.5, dy: 3 },
  coffeeTable: { x: 40, y1: 26, y2: 27 },
  sign: { x: 38.5, y: 22.5 },          // on the top wall, left of the door
}

export const floor2Signs = [
  { text: 'Área de foco · silêncio', x: 12, y: 1.6 },
  ...islands.map(island => ({ text: island.label, x: island.ox + 3.5, y: island.oy + 5.8 })),
  { text: 'Escada · Térreo', x: 2.5, y: 26.6 },
  { text: floor2Directors.label, ...floor2Directors.sign },
]
