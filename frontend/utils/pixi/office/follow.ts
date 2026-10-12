import type { Room, TilePoint } from '../types'

// "Seguir uma pessoa": the follower walks with the normal movement and stays one tile away.
export type Tile = { x: number, y: number }
export type FollowStopReason = 'manual' | 'stopped' | 'left' | 'unreachable' | 'switched' | 'silent'

export const FOLLOW_TICK_MS = 300
export const FOLLOW_STUCK_MS = 3000

const ORTHOGONAL = [[0, 1], [1, 0], [0, -1], [-1, 0]]
const DIAGONAL = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
const key = (tile: Tile) => `${tile.x}, ${tile.y}` as TilePoint

export const sameTile = (a?: Tile | null, b?: Tile | null) => Boolean(a && b && a.x === b.x && a.y === b.y)
export const isNextTo = (a: Tile, b: Tile) => !sameTile(a, b) && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1

// Free tiles next to the person, best first. Staying put wins when the follower is already
// next to them; otherwise the tile they just left and the side closest to the follower come
// first, sides before corners. Never their own tile, someone else's tile, or a passage.
export function rankFollowTiles({ target, previous, self, tilemap, blocked, occupied }: {
    target: Tile, previous: Tile | null, self: Tile, tilemap: Room['tilemap'], blocked: Set<TilePoint>, occupied: Tile[]
}): Tile[] {
    const taken = new Set(occupied.map(key))
    const free = (tile: Tile) => {
        const data = tilemap[key(tile)]
        return Boolean(data) && !data.impassable && !data.teleporter && !blocked.has(key(tile)) && !taken.has(key(tile)) && !sameTile(tile, target)
    }
    if (isNextTo(self, target) && free(self)) return [{ ...self }]
    const score = (tile: Tile, corner: boolean) => Math.abs(tile.x - self.x) + Math.abs(tile.y - self.y) + (corner ? 1 : 0) - (sameTile(tile, previous) ? 1 : 0)
    return [...ORTHOGONAL.map(offset => [offset, false] as const), ...DIAGONAL.map(offset => [offset, true] as const)]
        .map(([[dx, dy], corner]) => ({ tile: { x: target.x + dx, y: target.y + dy }, corner }))
        .filter(({ tile }) => free(tile))
        .map(({ tile, corner }, order) => ({ tile, order, score: score(tile, corner) }))
        .sort((a, b) => a.score - b.score || a.order - b.order)
        .map(({ tile }) => tile)
}

// A new path only when the current walk no longer ends next to the person, or when
// standing still somewhere that is not next to them. `at` is where the follower stands
// (or the tile it is stepping into while walking).
export function shouldReplan({ candidates, lastGoal, moving, at }: { candidates: Tile[], lastGoal: Tile | null, moving: boolean, at: Tile }): boolean {
    if (!candidates.length) return false
    if (moving) return !candidates.some(tile => sameTile(tile, lastGoal))
    return !sameTile(candidates[0], at)
}

// Progress is a server-confirmed step or resting next to the person. Without either for
// FOLLOW_STUCK_MS (no path, a full room, nowhere free next to them) following gives up.
export type FollowProgress = { since: number, position: Tile }
export function trackFollowProgress(state: FollowProgress, sample: { now: number, position: Tile, settled: boolean }): FollowProgress & { stuck: boolean } {
    if (sample.settled || !sameTile(state.position, sample.position)) return { since: sample.now, position: { ...sample.position }, stuck: false }
    return { ...state, stuck: sample.now - state.since >= FOLLOW_STUCK_MS }
}

// When the person disappears from the room: a passage under their last tile means they
// took the stairs (or a door) and the follower takes the same one; otherwise they left.
export function departureStairs(tilemap: Room['tilemap'], lastTile: Tile | null): Tile | null {
    return lastTile && tilemap[key(lastTile)]?.teleporter ? { ...lastTile } : null
}

export function followStopNotice(reason: FollowStopReason, name: string): string | null {
    if (reason === 'manual' || reason === 'stopped') return `Você parou de seguir ${name}.`
    if (reason === 'left') return `${name} saiu do escritório.`
    if (reason === 'unreachable') return `Não foi possível seguir ${name}.`
    return null
}

// The followed person hears every stop except when they left, or when this visitor's own
// connection ended (the server tells them then).
export const followStopTellsTarget = (reason: FollowStopReason) => reason !== 'left' && reason !== 'silent'

type Rect = { left: number, top: number, right: number, bottom: number }
// The "Seguindo" banner sits at the top center unless something already lives there
// (the call strip, the hints): then the top left, then centered just below them.
export function placeFollowBanner(viewportWidth: number, banner: { width: number, height: number }, obstacles: Rect[], margin = 12): { left: number, top: number } {
    const fits = (left: number, top: number) => left >= margin && left + banner.width <= viewportWidth - margin && !obstacles.some(rect =>
        left < rect.right + 8 && left + banner.width > rect.left - 8 && top < rect.bottom + 8 && top + banner.height > rect.top - 8)
    const center = Math.max(margin, Math.round((viewportWidth - banner.width) / 2))
    if (fits(center, margin)) return { left: center, top: margin }
    if (fits(margin, margin)) return { left: margin, top: margin }
    const below = Math.max(margin, ...obstacles.map(rect => rect.bottom + 8))
    return { left: center, top: Math.round(below) }
}
