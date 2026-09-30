import type { Room, OfficeObject } from '../types'

export function upsertObject(room: Room, object: OfficeObject): Room {
    const interactions = room.interactions ?? []
    const index = interactions.findIndex(item => item.id === object.id)
    const next = [...interactions]
    if (index < 0) next.push(object)
    else next[index] = object
    return { ...room, interactions: next }
}

export function removeObject(room: Room, objectId: string): Room {
    return { ...room, interactions: (room.interactions ?? []).filter(item => item.id !== objectId) }
}
