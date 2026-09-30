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

export function objectKindDefaults(kind: OfficeObject['kind'], bounds: OfficeObject['bounds']): Pick<OfficeObject, 'seatVisual' | 'effect'> {
    return {
        seatVisual: kind === 'seat' || kind === 'desk' ? { x: bounds.x, y: bounds.y, facing: 'down' } : undefined,
        effect: kind === 'drink' ? 'water' : kind === 'snack' ? 'snack' : undefined,
    }
}

type ObjectBus = { on: (name: string, callback: (data: any) => void) => void, off: (name: string, callback: Function) => void, emit: (name: string) => void }
export function observeOfficeObjects(bus: ObjectBus, onObjects: (objects: OfficeObject[]) => void): () => void {
    bus.on('officeObjectsChanged', onObjects)
    bus.emit('requestOfficeObjects')
    return () => bus.off('officeObjectsChanged', onObjects)
}
