import type { Room } from '../session'
import type { OfficeState } from './OfficeState'

export type PresentationSession = { presenterUid: string, deckId: string, slideIndex: number, revision: number, raisedHands: string[] }

export class PresentationState {
  private readonly sessions = new Map<string, PresentationSession>()
  constructor(private readonly room: Room, private readonly office: OfficeState) {}
  snapshot(): Record<string, PresentationSession> {
    return Object.fromEntries([...this.sessions].map(([id, session]) => [id, { ...session, raisedHands: [...session.raisedHands] }]))
  }
  private board(objectId: string) {
    const object = this.room.interactions?.find(item => item.id === objectId && item.kind === 'presentation')
    return object?.config && 'deckId' in object.config ? object : null
  }
  start(uid: string, objectId: string): { ok: boolean, session?: PresentationSession } {
    const board = this.board(objectId)
    if (!board || !this.office.isNear(uid, objectId) || this.sessions.has(objectId)) return { ok: false }
    const session = { presenterUid: uid, deckId: board.config && 'deckId' in board.config ? board.config.deckId : '', slideIndex: 0, revision: 0, raisedHands: [] }
    this.sessions.set(objectId, session)
    return { ok: true, session: { ...session } }
  }
  slide(uid: string, objectId: string, index: number, revision: number): { ok: boolean, session?: PresentationSession } {
    const board = this.board(objectId)
    const session = this.sessions.get(objectId)
    const count = board?.config && 'slides' in board.config ? board.config.slides.length : 0
    if (!session || session.presenterUid !== uid || !Number.isInteger(index) || index < 0 || index >= count || revision !== session.revision) return { ok: false }
    session.slideIndex = index
    session.revision++
    return { ok: true, session: { ...session, raisedHands: [...session.raisedHands] } }
  }
  raiseHand(uid: string, objectId: string): { ok: boolean, session?: PresentationSession } {
    const session = this.sessions.get(objectId)
    if (!session || !this.office.verifiedPosition(uid) || session.presenterUid === uid) return { ok: false }
    if (!session.raisedHands.includes(uid)) session.raisedHands.push(uid)
    return { ok: true, session: { ...session, raisedHands: [...session.raisedHands] } }
  }
  end(uid: string, objectId: string): { ok: boolean } {
    const session = this.sessions.get(objectId)
    if (!session || session.presenterUid !== uid) return { ok: false }
    this.sessions.delete(objectId)
    return { ok: true }
  }
  removePlayer(uid: string): boolean {
    let changed = false
    for (const [id, session] of this.sessions) {
      if (session.presenterUid === uid) { this.sessions.delete(id); changed = true }
      else if (session.raisedHands.includes(uid)) { session.raisedHands = session.raisedHands.filter(item => item !== uid); changed = true }
    }
    return changed
  }
}
