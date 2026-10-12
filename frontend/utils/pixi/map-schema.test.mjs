import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RealmDataSchema } from './zod.ts'
import { map } from '../../../scripts/matte-office-map.mjs'

test('the generated map (both floors) passes the frontend schema', () => {
    const result = RealmDataSchema.safeParse(JSON.parse(JSON.stringify(map)))
    assert.ok(result.success, result.success ? '' : JSON.stringify(result.error.issues.slice(0, 5)))
    assert.equal(map.rooms.length, 2)
})
