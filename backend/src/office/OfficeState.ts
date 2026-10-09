import type { OfficeObject, Room } from '../session'
import { areaAt, areaConfig } from './areas'

export type OfficePosition = { x: number, y: number }
export type OfficeResult = { ok: boolean, error?: string, changed?: boolean, effect?: 'coffee' | 'water' | 'snack' }
export type OfficeGame = {
  players: { uid: string, name: string }[],
  turn: string | null,
  scores: [number, number],
  rally: number,
  deadline: number | null,
  status: 'waiting' | 'playing' | 'ended',
}
export type OfficeSnapshot = {
  occupancy: Record<string, { uid: string, name: string }>,
  games: Record<string, OfficeGame>,
}

type Visitor = { position: OfficePosition, name: string, lastStepAt: number }
type MutableGame = { players: string[], turn: string | null, scores: [number, number], rally: number, deadline: number | null, status: OfficeGame['status'] }

export class OfficeState {
  private readonly objects: Map<string, OfficeObject>
  private readonly visitors = new Map<string, Visitor>()
  private readonly occupied = new Map<string, string>()
  private readonly games = new Map<string, MutableGame>()
  private readonly width: number
  private readonly height: number

  constructor(private readonly room: Room, private readonly now: () => number = Date.now) {
    this.objects = new Map((room.interactions ?? []).map(object => [object.id, object]))
    const points = Object.keys(room.tilemap).map(key => key.split(',').map(Number))
    this.width = Math.max(0, ...points.map(point => point[0])) + 1
    this.height = Math.max(0, ...points.map(point => point[1])) + 1
  }

  addPlayer(uid: string, spawn: OfficePosition, name = uid): void {
    this.release(uid)
    this.visitors.set(uid, { position: { ...spawn }, name, lastStepAt: -Infinity })
  }

  removePlayer(uid: string): boolean {
    let changed = this.release(uid).changed === true
    for (const [objectId, game] of this.games) {
      if (game.players.includes(uid)) {
        this.games.delete(objectId)
        changed = true
      }
    }
    this.visitors.delete(uid)
    return changed
  }

  verifiedPosition(uid: string): OfficePosition | null {
    const position = this.visitors.get(uid)?.position
    return position ? { ...position } : null
  }

  // Whether one more visitor fits in the area of this position (always true outside areas).
  hasRoomFor(position: OfficePosition): boolean {
    const areaId = areaAt(this.room, position.x, position.y)
    const capacity = areaConfig(this.room, areaId)?.capacity
    return capacity === undefined || this.countInArea(areaId) < capacity
  }

  private countInArea(areaId: string | null): number {
    let count = 0
    for (const visitor of this.visitors.values()) if (areaAt(this.room, visitor.position.x, visitor.position.y) === areaId) count++
    return count
  }

  isNear(uid: string, objectId: string): boolean {
    const object = this.objects.get(objectId)
    const position = this.visitors.get(uid)?.position
    return Boolean(object && position && Math.abs(position.x - object.approach.x) + Math.abs(position.y - object.approach.y) <= 2)
  }

  getObject(objectId: string): OfficeObject | undefined {
    return this.objects.get(objectId)
  }

  step(uid: string, next: OfficePosition, minimumStepMs = 120): OfficeResult {
    const visitor = this.visitors.get(uid)
    if (!visitor) return { ok: false, error: 'Visitante não encontrado.' }
    if (!Number.isInteger(next.x) || !Number.isInteger(next.y) || next.x < 0 || next.y < 0 || next.x >= this.width || next.y >= this.height) {
      return { ok: false, error: 'Posição inválida.' }
    }
    if (!this.room.tilemap[`${next.x}, ${next.y}`] || this.room.tilemap[`${next.x}, ${next.y}`]?.impassable) return { ok: false, error: 'Passagem bloqueada.' }
    const distance = Math.abs(visitor.position.x - next.x) + Math.abs(visitor.position.y - next.y)
    if (distance !== 1) return { ok: false, error: 'Movimento inválido.' }
    const targetArea = areaAt(this.room, next.x, next.y)
    if (targetArea && targetArea !== areaAt(this.room, visitor.position.x, visitor.position.y) && !this.hasRoomFor(next)) {
      return { ok: false, error: 'Sala cheia.' }
    }
    const at = this.now()
    if (at - visitor.lastStepAt < Math.max(80, minimumStepMs)) return { ok: false, error: 'Movimento rápido demais.' }
    visitor.position = { ...next }
    visitor.lastStepAt = at
    const occupied = this.objectOccupiedBy(uid)
    let changed = Boolean(occupied && !this.isNear(uid, occupied) && this.release(uid).changed)
    if (!this.objectOccupiedBy(uid)) {
      const nearbySeats = [...this.objects.values()]
        .filter(object => object.kind === 'seat' || object.kind === 'desk')
        .map(object => ({ object, distance: Math.abs(next.x - object.approach.x) + Math.abs(next.y - object.approach.y) }))
        .filter(candidate => candidate.distance <= (candidate.object.sitRange ?? 1) && !this.occupied.has(candidate.object.id))
        .sort((a, b) => a.distance - b.distance || a.object.id.localeCompare(b.object.id))
      if (nearbySeats.length && this.occupy(uid, nearbySeats[0].object.id).changed) changed = true
    }
    for (const [objectId, game] of this.games) {
      if (game.players.includes(uid) && !this.isNear(uid, objectId)) {
        this.games.delete(objectId)
        changed = true
      }
    }
    return { ok: true, changed }
  }

  occupy(uid: string, objectId: string): OfficeResult {
    const visitor = this.visitors.get(uid)
    if (!visitor) return { ok: false, error: 'Visitante não encontrado.' }
    const object = this.objects.get(objectId)
    if (!object) return { ok: false, error: 'Objeto não encontrado.' }
    if (object.kind !== 'seat' && object.kind !== 'desk') return { ok: false, error: 'Este objeto não tem assento.' }
    if (!this.isNear(uid, objectId)) return { ok: false, error: 'Aproxime-se do objeto.' }
    const current = this.occupied.get(objectId)
    if (current && current !== uid) return { ok: false, error: 'Este lugar está ocupado.' }
    if (current === uid) return { ok: true, changed: false }
    this.release(uid)
    this.occupied.set(objectId, uid)
    return { ok: true, changed: true }
  }

  release(uid: string, objectId?: string): OfficeResult {
    const current = this.objectOccupiedBy(uid)
    if (!current) return { ok: true, changed: false }
    if (objectId && objectId !== current) return { ok: false, error: 'Você não ocupa este lugar.' }
    this.occupied.delete(current)
    return { ok: true, changed: true }
  }

  apply(uid: string, action: { objectId: string, action: string }): OfficeResult {
    if (action.action === 'occupy') return this.occupy(uid, action.objectId)
    if (action.action === 'release') return this.release(uid, action.objectId)
    if (action.action === 'drink' || action.action === 'snack') {
      const object = this.objects.get(action.objectId)
      if (!this.visitors.has(uid) || !object || !this.isNear(uid, action.objectId) ||
          (action.action === 'drink' && object.kind !== 'drink') ||
          (action.action === 'snack' && object.kind !== 'snack') || !object.effect) {
        return { ok: false, error: 'Aproxime-se da máquina para usá-la.' }
      }
      return { ok: true, effect: object.effect }
    }
    if (action.action === 'startGame') return this.startGame(uid, action.objectId)
    if (action.action === 'joinGame') return this.joinGame(uid, action.objectId)
    if (action.action === 'returnBall') return this.returnBall(uid, action.objectId)
    if (action.action === 'leaveGame') return this.leaveGame(uid, action.objectId)
    return { ok: false, error: 'Ação inválida.' }
  }

  startGame(uid: string, objectId: string): OfficeResult {
    if (this.objects.get(objectId)?.kind !== 'pingpong' || !this.isNear(uid, objectId)) return { ok: false, error: 'Aproxime-se da mesa para jogar.' }
    const previous = this.games.get(objectId)
    if (previous && previous.status !== 'ended') return { ok: false, error: 'Já existe um jogo nesta mesa.' }
    this.games.set(objectId, { players: [uid], turn: null, scores: [0, 0], rally: 0, deadline: null, status: 'waiting' })
    return { ok: true, changed: true }
  }

  joinGame(uid: string, objectId: string): OfficeResult {
    const game = this.games.get(objectId)
    if (!game || game.status !== 'waiting' || game.players.includes(uid) || !this.isNear(uid, objectId)) {
      return { ok: false, error: 'Este jogo não está disponível.' }
    }
    game.players.push(uid)
    game.status = 'playing'
    game.turn = game.players[0]
    game.deadline = this.now() + 3000
    return { ok: true, changed: true }
  }

  returnBall(uid: string, objectId: string): OfficeResult {
    const game = this.games.get(objectId)
    if (!game || game.status !== 'playing' || game.turn !== uid || !this.isNear(uid, objectId)) {
      return { ok: false, error: 'Ainda não é sua vez ou você se afastou.' }
    }
    if (game.deadline !== null && this.now() >= game.deadline) {
      this.expire()
      return { ok: false, error: 'Tempo esgotado para rebater.', changed: true }
    }
    game.rally += 1
    game.turn = game.players.find(player => player !== uid) ?? null
    game.deadline = this.now() + 3000
    return { ok: true, changed: true }
  }

  leaveGame(uid: string, objectId: string): OfficeResult {
    const game = this.games.get(objectId)
    if (!game || !game.players.includes(uid)) return { ok: false, error: 'Você não está neste jogo.' }
    this.games.delete(objectId)
    return { ok: true, changed: true }
  }

  expire(): boolean {
    let changed = false
    const at = this.now()
    for (const game of this.games.values()) {
      if (game.status !== 'playing' || game.deadline === null || at < game.deadline) continue
      const scorer = game.players.findIndex(uid => uid !== game.turn)
      if (scorer < 0) continue
      game.scores[scorer] += 1
      game.rally = 0
      game.turn = game.players[scorer]
      game.deadline = at + 3000
      if (game.scores[scorer] >= 5) {
        game.status = 'ended'
        game.turn = null
        game.deadline = null
      }
      changed = true
    }
    return changed
  }

  snapshot(): OfficeSnapshot {
    const occupancy: OfficeSnapshot['occupancy'] = {}
    for (const [objectId, uid] of this.occupied) {
      const visitor = this.visitors.get(uid)
      if (visitor) occupancy[objectId] = { uid, name: visitor.name }
    }
    const games: OfficeSnapshot['games'] = {}
    for (const [objectId, game] of this.games) {
      games[objectId] = {
        players: game.players.map(uid => ({ uid, name: this.visitors.get(uid)?.name ?? 'Visitante' })),
        turn: game.turn,
        scores: [game.scores[0], game.scores[1]],
        rally: game.rally,
        deadline: game.deadline,
        status: game.status,
      }
    }
    return { occupancy, games }
  }

  private objectOccupiedBy(uid: string): string | null {
    for (const [objectId, occupant] of this.occupied) if (occupant === uid) return objectId
    return null
  }
}
