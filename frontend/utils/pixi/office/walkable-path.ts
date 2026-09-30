import type { Coordinate, Room, TilePoint } from '../types'

/** Search only existing floor tiles, including on sparse maps without a background. */
export function findWalkablePath(start: Coordinate, end: Coordinate, tilemap: Room['tilemap'], blocked: Set<TilePoint>): Coordinate[] | null {
    const key = ([x, y]: Coordinate): TilePoint => `${x}, ${y}`
    const walkable = (point: Coordinate) => point[0] >= 0 && point[1] >= 0 && Boolean(tilemap[key(point)]) && !tilemap[key(point)].impassable && !blocked.has(key(point))
    if (!walkable(end)) return null
    const queue: Coordinate[] = [start]
    const previous = new Map<TilePoint, Coordinate | null>([[key(start), null]])
    for (let index = 0; index < queue.length && index < 10000; index++) {
        const point = queue[index]
        if (key(point) === key(end)) {
            const path: Coordinate[] = []
            let cursor: Coordinate | null = point
            while (cursor && key(cursor) !== key(start)) { path.push(cursor); cursor = previous.get(key(cursor)) ?? null }
            return path.reverse()
        }
        for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
            const next: Coordinate = [point[0] + dx, point[1] + dy]
            if (!walkable(next) || previous.has(key(next))) continue
            previous.set(key(next), point)
            queue.push(next)
        }
    }
    return null
}
