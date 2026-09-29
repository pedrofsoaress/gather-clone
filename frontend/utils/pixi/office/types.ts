export type OfficeSnapshot = {
    occupancy: Record<string, { uid: string, name: string }>
    games: Record<string, unknown>
}
