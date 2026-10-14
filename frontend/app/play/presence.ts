// "Quem está online": who is in the office (any floor) and where.
export type PresenceEntry = { uid: string, name: string, room: number, areaId: string | null }
type RoomInfo = { name: string, areas?: Record<string, { label: string }> }

// The boardroom is a private area without a label in the map.
const UNLABELLED_AREAS: Record<string, string> = { 'matte-boardroom': 'Sala de reunião' }

export function isPresenceEntry(value: unknown): value is PresenceEntry {
    const entry = value as PresenceEntry
    return Boolean(entry) && typeof entry.uid === 'string' && typeof entry.name === 'string'
        && Number.isInteger(entry.room) && (entry.areaId === null || typeof entry.areaId === 'string')
}

export function parsePresence(value: unknown): PresenceEntry[] | null {
    return Array.isArray(value) ? value.filter(isPresenceEntry) : null
}

// The ground floor is the first room; the others are named after their floor ("2º andar").
export function floorLabel(rooms: RoomInfo[], roomIndex: number): string {
    if (roomIndex === 0) return 'Térreo'
    const name = rooms[roomIndex]?.name ?? ''
    return /andar/i.test(name) ? name : `${roomIndex + 1}º andar`
}

export function areaLabel(rooms: RoomInfo[], roomIndex: number, areaId: string | null): string | null {
    if (!areaId) return null
    return rooms[roomIndex]?.areas?.[areaId]?.label ?? UNLABELLED_AREAS[areaId] ?? null
}

// "2º andar · Cabine 5", "Térreo · Sala de treinamento", or just the floor.
export function placeLabel(rooms: RoomInfo[], entry: Pick<PresenceEntry, 'room' | 'areaId'>): string {
    const area = areaLabel(rooms, entry.room, entry.areaId)
    const floor = floorLabel(rooms, entry.room)
    return area ? `${floor} · ${area}` : floor
}

// The visitor first, then everyone else by name.
export function sortPresence(entries: PresenceEntry[], selfUid: string): PresenceEntry[] {
    return [...entries].sort((a, b) => {
        if (a.uid === selfUid || b.uid === selfUid) return a.uid === selfUid ? (b.uid === selfUid ? 0 : -1) : 1
        return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }) || a.uid.localeCompare(b.uid)
    })
}

// Following works on the same floor; for someone on another one the list says where they are.
export function otherFloorNotice(name: string, rooms: RoomInfo[], roomIndex: number): string {
    const floor = floorLabel(rooms, roomIndex)
    return `${name} está no ${floor.charAt(0).toLowerCase()}${floor.slice(1)}.`
}

// The entrance page: "3 pessoas no escritório agora"; nothing when empty or unknown.
export function entranceCountLabel(count: number | null | undefined): string | null {
    if (typeof count !== 'number' || !Number.isFinite(count) || count < 1) return null
    return count === 1 ? '1 pessoa no escritório agora' : `${count} pessoas no escritório agora`
}
