import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { OfficeNotes, validNoteObject, noteStorageKey } from './OfficeNotes'
import type { Room } from '../session'

function fakeDb() {
  const calls: Array<[string, unknown]> = []
  const row = { id: 'n1', realm_id: 'r', object_id: 'project-table', author_name: 'Ana', body: 'Ideia', created_at: '2026-09-29T12:00:00Z' }
  const builder: any = {
    select(value: string) { calls.push(['select', value]); return this },
    eq(field: string, value: string) { calls.push([field, value]); return this },
    order(field: string, opts: unknown) { calls.push(['order', [field, opts]]); return this },
    limit(value: number) { calls.push(['limit', value]); return this },
    insert(value: unknown) { calls.push(['insert', value]); return this },
    async single() { return { data: row, error: null } },
    then(resolve: (value: unknown) => unknown) { return Promise.resolve(resolve({ data: [row], error: null })) },
  }
  return { db: { from(table: string) { calls.push(['from', table]); return builder } } as unknown as SupabaseClient, calls }
}

const room: Room = { name: 'Matte', tilemap: {}, interactions: [
  { id: 'project-table', kind: 'board', label: 'Mesa', bounds: { x: 0, y: 0, width: 1, height: 1 }, approach: { x: 1, y: 1 } },
  { id: 'lounge-sofa', kind: 'seat', label: 'Sofá', bounds: { x: 2, y: 0, width: 1, height: 1 }, approach: { x: 2, y: 1 } },
] }

test('note keys preserve legacy spawn notes and isolate identical objects in other rooms', () => {
  assert.equal(noteStorageKey(0, 0, 'board'), 'board')
  assert.notEqual(noteStorageKey(1, 0, 'board'), noteStorageKey(2, 0, 'board'))
  assert.notEqual(noteStorageKey(1, 0, 'board'), noteStorageKey(1, 0, 'desk'))
  assert.ok(noteStorageKey(1, 0, 'a'.repeat(64)).length <= 64)
})

test('list filters by realm and object, newest first, capped at 100', async () => {
  const { db, calls } = fakeDb()
  const notes = new OfficeNotes(db)
  const found = await notes.list('r', 'project-table')
  assert.equal(found.length, 1)
  assert.deepEqual(found[0], { id: 'n1', objectId: 'project-table', author: 'Ana', body: 'Ideia', createdAt: '2026-09-29T12:00:00Z' })
  assert.ok(calls.some(([key, value]) => key === 'realm_id' && value === 'r'))
  assert.ok(calls.some(([key, value]) => key === 'object_id' && value === 'project-table'))
  assert.ok(calls.some(([key, value]) => key === 'limit' && value === 100))
  assert.ok(calls.some(([key, value]) => key === 'order' && Array.isArray(value) && value[0] === 'created_at'))
})

test('bad targets, length limits, and rate limits reject writes', async () => {
  let now = 0
  const { db, calls } = fakeDb()
  const notes = new OfficeNotes(db, () => now)
  const input = { realmId: 'r', objectId: 'project-table', uid: 'u', author: 'Ana', kind: 'board' as const, body: 'Ideia' }
  assert.equal((await notes.add(input)).ok, true)
  assert.equal((await notes.add({ ...input, body: 'x'.repeat(501) })).ok, false)
  assert.equal((await notes.add({ ...input, objectId: 'reception', kind: 'guestbook', body: 'x'.repeat(281) })).ok, false)
  assert.equal((await notes.add({ ...input, body: 'Outra' })).ok, false)
  now = 3001
  assert.equal((await notes.add({ ...input, body: 'Outra' })).ok, true)
  assert.equal(calls.filter(([key]) => key === 'insert').length, 2)
  assert.equal(validNoteObject(room, 'missing'), false)
  assert.equal(validNoteObject(room, 'lounge-sofa'), false)
  assert.equal(validNoteObject(room, 'project-table'), true)
})
