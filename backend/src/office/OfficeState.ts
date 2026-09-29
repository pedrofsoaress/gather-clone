import type { OfficeObject, Room } from '../session'

export type OfficePosition = { x: number, y: number }
export type OfficeResult = { ok: boolean, error?: string, changed?: boolean }
export type OfficeSnapshot = {
  occupancy: Record<string, { uid: string, name: string }>,
  games: Record<string, unknown>,
}

type Visitor = { position: OfficePosition, name: string, lastStepAt: number }

export class OfficeState {
  private readonly objects: Map<string, OfficeObject>
  private readonly visitors = new Map<string, Visitor>()
  private readonly occupied = new Map<string, string>()
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
    const changed = this.release(uid).changed === true
    this.visitors.delete(uid)
    return changed
  }

  verifiedPosition(uid: string): OfficePosition | null {
    const position = this.visitors.get(uid)?.position
    return position ? { ...position } : null
  }

  isNear(uid: string, objectId: string): boolean {
    const object = this.objects.get(objectId)
    const position = this.visitors.get(uid)?.position
    return Boolean(object && position && Math.abs(position.x - object.approach.x) + Math.abs(position.y - object.approach.y) <= 2)
  }

  getObject(objectId: string): OfficeObject | undefined {
    return this.objects.get(objectId)
  }

  step(uid: string, next: OfficePosition): OfficeResult {
    const visitor = this.visitors.get(uid)
    if (!visitor) return { ok: false, error: 'Visitante não encontrado.' }
    if (!Number.isInteger(next.x) || !Number.isInteger(next.y) || next.x < 0 || next.y < 0 || next.x >= this.width || next.y >= this.height) {
      return { ok: false, error: 'Posição inválida.' }
    }
    if (this.room.tilemap[`${next.x}, ${next.y}`]?.impassable) return { ok: false, error: 'Passagem bloqueada.' }
    const distance = Math.abs(visitor.position.x - next.x) + Math.abs(visitor.position.y - next.y)
    if (distance !== 1) return { ok: false, error: 'Movimento inválido.' }
    const at = this.now()
    if (at - visitor.lastStepAt < 70) return { ok: false, error: 'Movimento rápido demais.' }
    visitor.position = { ...next }
    visitor.lastStepAt = at
    const occupied = this.objectOccupiedBy(uid)
    const changed = Boolean(occupied && !this.isNear(uid, occupied) && this.release(uid).changed)
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
    return { ok: false, error: 'Ação inválida.' }
  }

  snapshot(): OfficeSnapshot {
    const occupancy: OfficeSnapshot['occupancy'] = {}
    for (const [objectId, uid] of this.occupied) {
      const visitor = this.visitors.get(uid)
      if (visitor) occupancy[objectId] = { uid, name: visitor.name }
    }
    return { occupancy, games: {} }
  }

  private objectOccupiedBy(uid: string): string | null {
    for (const [objectId, occupant] of this.occupied) if (occupant === uid) return objectId
    return null
  }
}
