import type { Room } from '../session'

export type AreaConfig = { label: string, capacity?: number, conversation?: 'stage' }

// A tile's area: its private conversation area, otherwise its plain area.
export function areaAt(room: Room, x: number, y: number): string | null {
    const tile = room.tilemap[`${x}, ${y}`]
    return tile?.privateAreaId ?? tile?.areaId ?? null
}

export function areaConfig(room: Room, areaId: string | null): AreaConfig | null {
    return areaId ? room.areas?.[areaId] ?? null : null
}

// In a stage area (the training room) people listen to the stage and the
// audience microphone instead of forming proximity calls with neighbours.
export function isStageArea(room: Room, areaId: string | null): boolean {
    return areaConfig(room, areaId)?.conversation === 'stage'
}
