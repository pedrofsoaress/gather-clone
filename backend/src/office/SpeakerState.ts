import { randomUUID } from 'node:crypto'
import type { Room } from '../session'
import { areaAt } from './areas'
import type { OfficeState } from './OfficeState'

export type SpeakerSnapshot = Record<string, { ownerUid: string, channel: string, volume: number }>

export class SpeakerState {
  private readonly active = new Map<string, { ownerUid: string, channel: string }>()
  constructor(private readonly room: Room, private readonly office: OfficeState) {}

  private volume(uid: string, objectId: string): number {
    const object = this.room.interactions?.find(item => item.id === objectId && item.kind === 'speaker')
    const position = this.office.verifiedPosition(uid)
    if (!object || !position || !object.config || !('rangeTiles' in object.config)) return 0
    const sourceArea = areaAt(this.room, object.approach.x, object.approach.y)
    if (sourceArea !== areaAt(this.room, position.x, position.y)) return 0
    if (object.config.flat && sourceArea) return 100
    return Math.round(Math.max(0, 1 - Math.hypot(position.x - object.approach.x, position.y - object.approach.y) / object.config.rangeTiles) * 100)
  }

  start(uid: string, objectId: string): { ok: boolean, error?: string } {
    if (!this.office.isNear(uid, objectId) || this.volume(uid, objectId) === 0) return { ok: false, error: 'Aproxime-se da caixa de som.' }
    if (this.active.has(objectId) || [...this.active.values()].some(state => state.ownerUid === uid)) return { ok: false, error: 'Já existe um áudio sendo compartilhado.' }
    this.active.set(objectId, { ownerUid: uid, channel: `speaker-${randomUUID()}` })
    return { ok: true }
  }

  stop(uid: string, objectId: string): { ok: boolean, error?: string } {
    if (this.active.get(objectId)?.ownerUid !== uid) return { ok: false, error: 'Somente quem compartilhou pode parar o áudio.' }
    this.active.delete(objectId)
    return { ok: true }
  }

  snapshotFor(uid: string): SpeakerSnapshot {
    return Object.fromEntries([...this.active].map(([id, state]) => [id, { ...state, volume: this.volume(uid, id) }]))
  }

  authorize(uid: string, objectId: string, publish: boolean): { channel: string, uid: string, publish: boolean } | null {
    const state = this.active.get(objectId)
    if (!state || this.volume(uid, objectId) === 0 || (publish && state.ownerUid !== uid)) return null
    return { channel: state.channel, uid: `${uid}-${publish ? 'speaker' : 'listen'}`, publish }
  }

  removePlayer(uid: string): void {
    for (const [id, state] of this.active) if (state.ownerUid === uid) this.active.delete(id)
  }

  expire(): boolean {
    let changed = false
    for (const [id, state] of this.active) {
      const object = this.room.interactions?.find(item => item.id === id)
      const flat = Boolean(object?.config && 'flat' in object.config && object.config.flat)
      if (this.volume(state.ownerUid, id) === 0 || (flat && !this.office.isNear(state.ownerUid, id))) { this.active.delete(id); changed = true }
    }
    return changed
  }
}
