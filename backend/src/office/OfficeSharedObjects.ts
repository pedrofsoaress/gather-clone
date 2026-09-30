import type { Room } from '../session'
import type { OfficeState } from './OfficeState'

export class OfficeSharedObjects {
  private readonly states = new Map<string, { url: string, revision: number }>()

  constructor(private readonly room: Room, private readonly office: OfficeState) {}
  get(uid: string, objectId: string): { ok: boolean, url?: string, revision?: number, error?: string } {
    const object = this.room.interactions?.find(item => item.id === objectId && item.kind === 'external')
    if (!object || !this.office.isNear(uid, objectId) || !object.config || !('url' in object.config)) return { ok: false, error: 'Aproxime-se do quadro.' }
    return { ok: true, ...(this.states.get(objectId) ?? { url: object.config.url, revision: 0 }) }
  }
  setRoom(uid: string, objectId: string, url: string, revision: number): { ok: boolean, url?: string, revision?: number, error?: string } {
    const object = this.room.interactions?.find(item => item.id === objectId && item.kind === 'external')
    if (!object || !this.office.isNear(uid, objectId) || !object.config || !('url' in object.config)) return { ok: false, error: 'Aproxime-se do quadro.' }
    if (!object.config.roomEditable) return { ok: false, error: 'A sala é fixa.' }
    const current = this.get(uid, objectId)
    if (!Number.isInteger(revision) || revision !== current.revision) return { ok: false, error: 'A sala foi alterada por outra pessoa.', revision: current.revision }
    let parsed: URL
    try { parsed = new URL(url) } catch { return { ok: false, error: 'URL inválida.' } }
    if (url.length > 2048 || parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || !object.config.allowedHosts.includes(parsed.hostname)) {
      return { ok: false, error: 'URL ou domínio não permitido.' }
    }
    const next = { url: parsed.toString(), revision: revision + 1 }
    this.states.set(objectId, next)
    return { ok: true, ...next }
  }
}
