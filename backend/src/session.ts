import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { OfficeState } from './office/OfficeState'
import { validateOfficeMap } from './office/object-config'
import { OfficeSharedObjects } from './office/OfficeSharedObjects'
import { PresentationState } from './office/PresentationState'
import { SpeakerState } from './office/SpeakerState'
import { AvatarActions } from './office/AvatarActions'

export type RealmData = {
    spawnpoint: {
        roomIndex: number,
        x: number,
        y: number,
    },
    rooms: Room[],
}

export interface Room {
    name: string,
    interactions?: OfficeObject[],
    tilemap: {
        [key: `${number}, ${number}`]: {
            floor?: string,
            above_floor?: string,
            object?: string,
            impassable?: boolean
            privateAreaId?: string
            teleporter?: {
                roomIndex: number,
                x: number,
                y: number,
            }
        }
    }
    channelId?: string
}

export interface OfficeObject {
    id: string,
    kind: 'guide' | 'seat' | 'desk' | 'board' | 'drink' | 'snack' | 'guestbook' | 'pingpong' | 'external' | 'presentation' | 'speaker' | 'pet' | 'light',
    label: string,
    bounds: { x: number, y: number, width: number, height: number },
    approach: { x: number, y: number },
    seatVisual?: { x: number, y: number, facing?: 'up' | 'down' | 'left' | 'right' },
    effect?: 'coffee' | 'water' | 'snack',
    config?: { url: string, allowedHosts: string[], roomEditable: boolean } | { deckId: string, slides: { title: string, body?: string, imageUrl?: string }[] } | { rangeTiles: number } | { animationSet: string } | { radiusTiles: number, color: string, intensity: number },
}

export interface Player {
    uid: string,
    username: string,
    x: number,
    y: number,
    room: number,
    socketId: string,
    skin: string,
    proximityId: string | null,
}

export const defaultSkin = '009'

export const Spawnpoint = z.object({
    roomIndex: z.number(),
    x: z.number(),
    y: z.number(),
})

export type RoomData = { [key: number]: Player[] }

type PlacedPosition = { room: number, x: number, y: number }

// A dropped connection reconnects within seconds; remember where the visitor
// stood so the rejoin does not send them back to the entrance.
const RESUME_WINDOW_MS = 2 * 60 * 1000

export class SessionManager {
    private sessions: { [key: string]: Session } = {}
    private playerIdToRealmId: { [key: string]: string } = {}
    private socketIdToPlayerId: { [key: string]: string } = {}
    private lastPositions = new Map<string, PlacedPosition & { realmId: string, at: number }>()

    public createSession(id: string, mapData: RealmData): void {
        const realm = new Session(id, mapData)

        this.sessions[id] = realm
    }

    public getSession(id: string): Session {
        return this.sessions[id]
    }

    public activeSessions(): Session[] {
        return Object.values(this.sessions)
    }

    public getPlayerSession(uid: string): Session {
        const realmId = this.playerIdToRealmId[uid]
        return this.sessions[realmId]
    }

    public addPlayerToSession(socketId: string, realmId: string, uid: string, username: string, skin: string, now = Date.now()) {
        const last = this.lastPositions.get(uid)
        this.lastPositions.delete(uid)
        const resume = last && last.realmId === realmId && now - last.at <= RESUME_WINDOW_MS ? last : undefined
        this.sessions[realmId].addPlayer(socketId, uid, username, skin, resume)
        this.playerIdToRealmId[uid] = realmId
        this.socketIdToPlayerId[socketId] = uid
    }

    public logOutPlayer(uid: string, now = Date.now()) {
        const realmId = this.playerIdToRealmId[uid]
        // If the player is not in a realm, do nothing
        if (!realmId) return

        const player = this.sessions[realmId].getPlayer(uid)
        for (const [id, position] of this.lastPositions) if (now - position.at > RESUME_WINDOW_MS) this.lastPositions.delete(id)
        this.lastPositions.set(uid, { realmId, room: player.room, x: player.x, y: player.y, at: now })
        delete this.socketIdToPlayerId[player.socketId]
        delete this.playerIdToRealmId[uid]
        this.sessions[realmId].removePlayer(uid)
    }

    public getSocketIdsInRoom(realmId: string, roomIndex: number): string[] {
        return this.sessions[realmId].getPlayersInRoom(roomIndex).map(player => player.socketId)
    }

    public logOutBySocketId(socketId: string, now = Date.now()) {
        const uid = this.socketIdToPlayerId[socketId]
        if (!uid) return false

        this.logOutPlayer(uid, now)
        return true
    }

    public terminateSession(id: string, reason: string, kickPlayer: (uid: string, reason: string) => void) {
        const session = this.sessions[id]
        if (!session) return

        const players = session.getPlayerIds()
        players.forEach(player => {
            kickPlayer(player, reason)
        })

        delete this.sessions[id]
    }
}

export class Session {
    private playerRooms: { [key: number]: Set<string> } = {}

    // roomIndex -> position -> uid
    private playerPositions: { [key: number]: { [key: string]: Set<string> } } = {}

    public players: { [key: string]: Player } = {}
    public id: string
    public map_data: RealmData 
    public officeState: OfficeState
    public externalObjects: OfficeSharedObjects
    public presentations: PresentationState
    public speakers: SpeakerState
    public readonly roomFeatures: { office: OfficeState, external: OfficeSharedObjects, presentations: PresentationState, speakers: SpeakerState, avatars: AvatarActions }[]

    constructor(id: string, mapData: RealmData) {
        validateOfficeMap(mapData)
        this.id = id
        this.map_data = mapData 
        this.roomFeatures = mapData.rooms.map(room => {
            const office = new OfficeState(room)
            return { office, external: new OfficeSharedObjects(room, office), presentations: new PresentationState(room, office), speakers: new SpeakerState(room, office), avatars: new AvatarActions(room, office) }
        })
        const spawn = this.roomFeatures[mapData.spawnpoint.roomIndex]
        this.officeState = spawn.office
        this.externalObjects = spawn.external
        this.presentations = spawn.presentations
        this.speakers = spawn.speakers

        for (let i = 0; i < mapData.rooms.length; i++) {
            this.playerRooms[i] = new Set<string>()
            this.playerPositions[i] = {}
        }
    }

    public addPlayer(socketId: string, uid: string, username: string, skin: string, resume?: PlacedPosition) {
        this.removePlayer(uid)
        const resumeTile = resume ? this.map_data.rooms[resume.room]?.tilemap[`${resume.x}, ${resume.y}`] : undefined
        const start = resume && resumeTile && !resumeTile.impassable
            ? resume
            : { room: this.map_data.spawnpoint.roomIndex, x: this.map_data.spawnpoint.x, y: this.map_data.spawnpoint.y }
        const spawnIndex = start.room
        const spawnX = start.x
        const spawnY = start.y

        const player: Player = {
            uid,
            username,
            x: spawnX,
            y: spawnY,
            room: spawnIndex,
            socketId: socketId,
            skin,
            proximityId: null,
        }

        this.playerRooms[spawnIndex].add(uid)
        const coordKey = `${spawnX}, ${spawnY}`
        if (!this.playerPositions[spawnIndex][coordKey]) {
            this.playerPositions[spawnIndex][coordKey] = new Set<string>()
        }
        this.playerPositions[spawnIndex][coordKey].add(uid)
        this.players[uid] = player
        this.roomFeatures[spawnIndex].office.addPlayer(uid, { x: spawnX, y: spawnY }, username)
    }

    public removePlayer(uid: string): void {
        if (!this.players[uid]) return
        const features = this.featuresFor(uid)
        features.presentations.removePlayer(uid)
        features.speakers.removePlayer(uid)
        features.avatars.removePlayer(uid)
        features.office.removePlayer(uid)

        const player = this.players[uid]
        this.playerRooms[player.room].delete(uid)

        const coordKey = `${player.x}, ${player.y}`
        delete this.playerPositions[player.room][coordKey]

        delete this.players[uid]
    }

    public changeRoom(uid: string, roomIndex: number, x: number, y: number): string[] {
        if (!this.players[uid]) return []

        const player = this.players[uid]
        const features = this.featuresFor(uid)
        features.presentations.removePlayer(uid)
        features.speakers.removePlayer(uid)
        features.avatars.removePlayer(uid)
        features.office.removePlayer(uid)

        this.playerRooms[player.room].delete(uid)
        this.playerRooms[roomIndex].add(uid)

        const coordKey = `${player.x}, ${player.y}`
        if (this.playerPositions[player.room][coordKey]) {
            this.playerPositions[player.room][coordKey].delete(uid)
        }

        player.room = roomIndex
        this.roomFeatures[roomIndex].office.addPlayer(uid, { x, y }, player.username)
        return this.movePlayer(uid, x, y)
    }

    public featuresFor(uid: string) { return this.roomFeatures[this.players[uid].room] }

    public getPlayersInRoom(roomIndex: number): Player[] {
        const players = Array.from(this.playerRooms[roomIndex] || [])
            .map(uid => this.players[uid])

        return players
    }

    public getRoomWithChannelId(channelId: string): number | null {
        const index = this.map_data.rooms.findIndex(room => room.channelId === channelId)
        return index !== -1 ? index : null
    }

    public getPlayerCount() {
        return Object.keys(this.players).length
    }

    public getPlayer(uid: string): Player {
        return this.players[uid]
    }

    public getPlayerIds(): string[] {
        return Object.keys(this.players)
    }

    public getPlayerRoom(uid: string): number {
        return this.players[uid].room
    }

    public movePlayer(uid: string, x: number, y: number): string[] {
        const oldCoordKey = `${this.players[uid].x}, ${this.players[uid].y}`
        if (this.playerPositions[this.players[uid].room][oldCoordKey]) {
            this.playerPositions[this.players[uid].room][oldCoordKey].delete(uid)
        }

        this.players[uid].x = x
        this.players[uid].y = y

        const coordKey = `${x}, ${y}`
        if (!this.playerPositions[this.players[uid].room][coordKey]) {
            this.playerPositions[this.players[uid].room][coordKey] = new Set<string>()
        }

        this.playerPositions[this.players[uid].room][coordKey].add(uid)

        return this.setProximityIdsWithPlayer(uid)
    }

    public setProximityIdsWithPlayer(_uid: string): string[] {
        // A movement can split or merge an entire conversation. Rebuild all
        // current groups so stationary people and the room just left also update.
        // This deliberately supports an already-removed uid after disconnection.
        const players = Object.values(this.players).sort((a, b) => a.uid.localeCompare(b.uid))
        const byRoomTile = new Map<number, Map<string, Player[]>>()
        const zoneOf = (player: Player) => this.map_data.rooms[player.room].tilemap[`${player.x}, ${player.y}`]?.privateAreaId ?? null
        for (const player of players) {
            if (!byRoomTile.has(player.room)) byRoomTile.set(player.room, new Map())
            const roomTiles = byRoomTile.get(player.room)!
            const tile = `${player.x}, ${player.y}`
            roomTiles.set(tile, [...(roomTiles.get(tile) ?? []), player])
        }

        const visited = new Set<string>()
        const groups: Player[][] = []
        for (const seed of players) {
            if (visited.has(seed.uid)) continue
            const group = [seed]
            const zone = zoneOf(seed)
            visited.add(seed.uid)
            for (let index = 0; index < group.length; index++) {
                const member = group[index]
                for (const tile of this.getProximityTiles(member.x, member.y)) {
                    for (const neighbor of byRoomTile.get(member.room)?.get(tile) ?? []) {
                        if (visited.has(neighbor.uid) || zoneOf(neighbor) !== zone) continue
                        visited.add(neighbor.uid)
                        group.push(neighbor)
                    }
                }
            }
            groups.push(group)
        }

        // Preserve the largest overlap with each existing conversation. An old
        // channel can survive in only one component after a split; merging uses
        // one existing channel rather than forcing everyone onto a new UUID.
        const candidates: { groupIndex: number, id: string, overlap: number }[] = []
        groups.forEach((group, groupIndex) => {
            if (group.length < 2) return
            const counts = new Map<string, number>()
            for (const player of group) if (player.proximityId) counts.set(player.proximityId, (counts.get(player.proximityId) ?? 0) + 1)
            for (const [id, overlap] of counts) candidates.push({ groupIndex, id, overlap })
        })
        candidates.sort((a, b) => b.overlap - a.overlap || groups[b.groupIndex].length - groups[a.groupIndex].length || a.id.localeCompare(b.id) || a.groupIndex - b.groupIndex)
        const assigned = new Map<number, string>()
        const usedIds = new Set<string>()
        for (const candidate of candidates) {
            if (assigned.has(candidate.groupIndex) || usedIds.has(candidate.id)) continue
            assigned.set(candidate.groupIndex, candidate.id)
            usedIds.add(candidate.id)
        }

        const changed: string[] = []
        groups.forEach((group, groupIndex) => {
            const id = group.length < 2 ? null : assigned.get(groupIndex) ?? uuidv4()
            for (const player of group) {
                if (player.proximityId === id) continue
                player.proximityId = id
                changed.push(player.uid)
            }
        })
        return changed.sort()
    }

    private getProximityTiles(x: number, y: number): string[] {
        const proximityTiles: string[] = []
        // Keep spontaneous calls close to the avatars. A circular boundary
        // prevents diagonal corners from reaching into distant workstations.
        const radius = 2.5
        const range = Math.floor(radius)

        for (let dx = -range; dx <= range; dx++) {
            for (let dy = -range; dy <= range; dy++) {
                if (dx * dx + dy * dy > radius * radius) continue
                const tileX = x + dx
                const tileY = y + dy
                proximityTiles.push(`${tileX}, ${tileY}`)
            }
        }
        return proximityTiles
    }
}

const sessionManager = new SessionManager()

export { sessionManager }
