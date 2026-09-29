import type { OfficeObject } from '../types'

export function findObjectAt(objects: OfficeObject[], x: number, y: number): OfficeObject | null {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null

    return objects.find((object) =>
        x >= object.bounds.x && x < object.bounds.x + object.bounds.width &&
        y >= object.bounds.y && y < object.bounds.y + object.bounds.height
    ) ?? null
}

export function isWithinMap(x: number, y: number, width: number, height: number): boolean {
    return Number.isInteger(x) && Number.isInteger(y) &&
        x >= 0 && y >= 0 && x < width && y < height
}

export function nearestObject(
    objects: OfficeObject[],
    x: number,
    y: number,
    maxDistance: number,
): OfficeObject | null {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null

    return objects
        .map((object) => ({
            object,
            distance: Math.abs(object.approach.x - x) + Math.abs(object.approach.y - y),
        }))
        .filter(({ distance }) => distance <= maxDistance)
        .sort((a, b) => a.distance - b.distance || a.object.id.localeCompare(b.object.id))[0]?.object ?? null
}
