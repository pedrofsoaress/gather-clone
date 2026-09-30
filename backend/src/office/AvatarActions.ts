import type { Room } from '../session'
import type { OfficeState } from './OfficeState'

export type AvatarActionState = {
  action: 'idle' | 'dance' | 'pet',
  running: boolean,
  objectId?: string,
  expiresAt: number | null,
}
export type AvatarActionResult = { ok: boolean, error?: string, state?: AvatarActionState }

/** Cosmetic actions never modify collision, room membership or media permissions. */
export class AvatarActions {
  private readonly states = new Map<string, AvatarActionState>()
  private readonly lastPetAt = new Map<string, number>()

  constructor(private readonly room: Room, private readonly office: OfficeState, private readonly now: () => number = Date.now) {}

  private current(uid: string): AvatarActionState {
    const state = this.states.get(uid) ?? { action: 'idle', running: false, expiresAt: null }
    if (state.expiresAt !== null && state.expiresAt <= this.now()) {
      const idle: AvatarActionState = { action: 'idle', running: state.running, expiresAt: null }
      this.states.set(uid, idle)
      return idle
    }
    return state
  }

  private isSeated(uid: string): boolean {
    return Object.values(this.office.snapshot().occupancy).some(occupant => occupant.uid === uid)
  }

  setAction(uid: string, action: AvatarActionState['action'], objectId?: string): AvatarActionResult {
    if (!this.office.verifiedPosition(uid)) return { ok: false, error: 'Entre no escritório para usar esta ação.' }
    if (action !== 'idle' && this.isSeated(uid)) return { ok: false, error: 'Levante-se para usar esta ação.' }
    if (action === 'pet') {
      const object = this.room.interactions?.find(item => item.id === objectId && item.kind === 'pet')
      if (!object || !this.office.isNear(uid, object.id)) return { ok: false, error: 'Aproxime-se do Caju para fazer carinho.' }
      if (this.now() - (this.lastPetAt.get(uid) ?? -Infinity) < 2500) return { ok: false, error: 'Caju ainda está recebendo seu carinho.' }
      this.lastPetAt.set(uid, this.now())
    }
    const state: AvatarActionState = {
      action,
      running: action === 'idle' ? this.current(uid).running : false,
      expiresAt: action === 'idle' ? null : this.now() + (action === 'dance' ? 10000 : 2500),
      ...(action === 'pet' ? { objectId } : {}),
    }
    this.states.set(uid, state)
    return { ok: true, state: { ...state } }
  }

  setRunning(uid: string, running: boolean): AvatarActionResult {
    if (!this.office.verifiedPosition(uid)) return { ok: false, error: 'Entre no escritório para correr.' }
    if (running && this.isSeated(uid)) return { ok: false, error: 'Levante-se para correr.' }
    const state: AvatarActionState = { ...this.current(uid), running }
    if (running) { state.action = 'idle'; state.expiresAt = null; delete state.objectId }
    this.states.set(uid, state)
    return { ok: true, state: { ...state } }
  }

  minimumStepMs(uid: string): number { return this.current(uid).running ? 80 : 120 }

  stopAction(uid: string): void {
    if (!this.states.has(uid)) return
    this.states.set(uid, { action: 'idle', running: this.current(uid).running, expiresAt: null })
  }

  removePlayer(uid: string): void { this.states.delete(uid); this.lastPetAt.delete(uid) }

  snapshot(): Record<string, AvatarActionState> {
    return Object.fromEntries([...this.states.keys()].map(uid => [uid, { ...this.current(uid) }]))
  }
}
