// Who is seated at a focus desk, from the room's objects and the seat occupancy.
export function focusedUids(objects: { id: string, focus?: boolean }[], occupancy: Record<string, { uid: string }>): Set<string> {
    const focusIds = new Set(objects.filter(object => object.focus).map(object => object.id))
    return new Set(Object.entries(occupancy).filter(([id]) => focusIds.has(id)).map(([, seat]) => seat.uid))
}

// The focused person this visitor can knock on: the closest within the knock reach (2.5 tiles).
export function nearestFocused(me: { x: number, y: number }, people: { uid: string, name: string, x: number, y: number }[], focused: Set<string>): { uid: string, name: string } | null {
    const candidates = people
        .filter(person => focused.has(person.uid))
        .map(person => ({ person, distance: (person.x - me.x) ** 2 + (person.y - me.y) ** 2 }))
        .filter(candidate => candidate.distance <= 6.25)
        .sort((a, b) => a.distance - b.distance || a.person.name.localeCompare(b.person.name))
    return candidates.length ? { uid: candidates[0].person.uid, name: candidates[0].person.name } : null
}
