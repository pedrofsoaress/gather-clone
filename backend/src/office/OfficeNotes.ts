import type { SupabaseClient } from '@supabase/supabase-js'
import type { Room } from '../session'
import { createHash } from 'crypto'

export function noteStorageKey(roomIndex: number, spawnRoomIndex: number, objectId: string): string {
  if (roomIndex === spawnRoomIndex) return objectId
  return `room:${createHash('sha256').update(JSON.stringify([roomIndex, objectId])).digest('hex').slice(0, 59)}`
}

export type OfficeNote = { id: string, objectId: string, author: string, body: string, createdAt: string }
export type NoteKind = 'board' | 'desk' | 'guestbook'
export type AddNoteInput = { realmId: string, objectId: string, uid: string, author: string, kind: NoteKind, body: string }
export type AddNoteResult = { ok: boolean, error?: string, note?: OfficeNote }

type NoteRow = { id: string, object_id: string, author_name: string, body: string, created_at: string }

function toNote(row: NoteRow): OfficeNote {
  return { id: row.id, objectId: row.object_id, author: row.author_name, body: row.body, createdAt: row.created_at }
}

export function validNoteObject(room: Room, objectId: string): boolean {
  return Boolean(room.interactions?.some(object => object.id === objectId && ['board', 'desk', 'guestbook'].includes(object.kind)))
}

export class OfficeNotes {
  private readonly lastWrite = new Map<string, number>()

  constructor(private readonly db: SupabaseClient, private readonly now: () => number = Date.now) {}

  async list(realmId: string, objectId: string): Promise<OfficeNote[]> {
    const { data, error } = await this.db.from('office_notes')
      .select('id,object_id,author_name,body,created_at')
      .eq('realm_id', realmId)
      .eq('object_id', objectId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw new Error('Falha ao carregar recados.')
    return (data ?? []).map(toNote)
  }

  async add(input: AddNoteInput): Promise<AddNoteResult> {
    const body = input.body?.trim()
    const maxLength = input.kind === 'guestbook' ? 280 : 500
    if (!body || body.length > maxLength || !input.author || input.author.length > 64 ||
        !input.objectId || input.objectId.length > 64 || !['board', 'desk', 'guestbook'].includes(input.kind)) {
      return { ok: false, error: `Escreva de 1 a ${maxLength} caracteres.` }
    }
    const key = `${input.realmId}:${input.uid}`
    const at = this.now()
    const previous = this.lastWrite.get(key)
    if (previous !== undefined && at - previous < 3000) return { ok: false, error: 'Aguarde alguns segundos antes de publicar outro recado.' }
    this.lastWrite.set(key, at)

    const { data, error } = await this.db.from('office_notes').insert({
      realm_id: input.realmId,
      object_id: input.objectId,
      author_id: input.uid,
      author_name: input.author,
      body,
    }).select('id,object_id,author_name,body,created_at').single()
    if (error || !data) {
      if (this.lastWrite.get(key) === at) this.lastWrite.delete(key)
      return { ok: false, error: 'Não foi possível salvar o recado.' }
    }
    return { ok: true, note: toNote(data) }
  }
}
