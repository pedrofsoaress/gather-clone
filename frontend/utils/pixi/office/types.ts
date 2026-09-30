export type PresentationSession = {
    presenterUid: string,
    deckId: string,
    slideIndex: number,
    revision: number,
    raisedHands: string[],
}

export type PresentationSnapshot = Record<string, PresentationSession>

export type OfficeSnapshot = {
    occupancy: Record<string, { uid: string, name: string }>
    games: Record<string, {
        players: { uid: string, name: string }[]
        turn: string | null
        scores: [number, number]
        rally: number
        deadline: number | null
        status: 'waiting' | 'playing' | 'ended'
    }>
}
