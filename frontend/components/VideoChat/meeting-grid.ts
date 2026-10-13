// Layout math for the expanded call view. Pure so it can be tested without a browser.

export type Grid = { columns: number, rows: number, tileWidth: number, tileHeight: number }

const VIDEO = 16 / 9

// Picks the column count that gives the largest tiles of the given shape inside
// width x height, with `gap` pixels between tiles. Ties keep fewer columns, so
// 5 people become 3 + 2 rather than 4 + 1.
export function bestGrid(count: number, width: number, height: number, gap: number, aspect = VIDEO): Grid {
    if (count <= 0) return { columns: 0, rows: 0, tileWidth: 0, tileHeight: 0 }
    let best: Grid = { columns: 1, rows: count, tileWidth: 0, tileHeight: 0 }
    let bestWidth = -1
    for (let columns = 1; columns <= count; columns++) {
        const rows = Math.ceil(count / columns)
        const cellWidth = Math.max(0, (width - (columns - 1) * gap) / columns)
        const cellHeight = Math.max(0, (height - (rows - 1) * gap) / rows)
        const tileWidth = Math.min(cellWidth, cellHeight * aspect)
        if (tileWidth > bestWidth + 0.5) {
            bestWidth = tileWidth
            best = { columns, rows, tileWidth: Math.floor(tileWidth), tileHeight: Math.floor(Math.min(cellHeight, cellWidth / aspect)) }
        }
    }
    return best
}

const SIDE_MIN = 160
const SIDE_CAP = 220

// Width of the people column next to a shared screen: at most a quarter of the
// area (never under 220px), narrowed so everyone fits in the height when possible,
// and never under 160px (past that the column scrolls).
export function sideColumnWidth(count: number, width: number, height: number, gap: number, aspect = VIDEO): number {
    const cap = Math.max(SIDE_CAP, Math.floor(width / 4))
    if (count <= 0) return cap
    const fit = Math.floor((height - (count - 1) * gap) / count * aspect)
    return Math.max(SIDE_MIN, Math.min(cap, fit))
}
