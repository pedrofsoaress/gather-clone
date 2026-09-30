const MIN_ZOOM = 0.5
const MAX_ZOOM = 3

/** Return a world-space pivot that preserves the point under a logical screen cursor. */
export function zoomAtCursor(current, cursor, deltaY, deltaMode = 0, viewportHeight = 800) {
    if (!Number.isFinite(deltaY) || deltaY === 0) return current
    const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? viewportHeight : 1)
    const boundedDelta = Math.max(-100, Math.min(100, pixels))
    const scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current.scale * Math.exp(-boundedDelta * 0.0015)))
    if (scale === current.scale) return current
    return {
        scale,
        pivot: {
            x: current.pivot.x + cursor.x / current.scale - cursor.x / scale,
            y: current.pivot.y + cursor.y / current.scale - cursor.y / scale,
        },
    }
}
