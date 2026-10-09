import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const emitted = []
const source = ts.transpileModule(readFileSync(new URL('./meeting.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
const exports = {}
vm.runInNewContext(source, {
    exports,
    require: name => {
        if (name === '../signal') return { __esModule: true, default: { emit: (event, value) => emitted.push({ event, value }), on() {}, off() {} } }
        throw new Error(`Unexpected import: ${name}`)
    },
})
const { setLocalMeetingUid, setMeeting, getMeeting, isModerator, canUnmute } = exports

const snapshot = (overrides = {}) => ({ areaId: 'matte-training', locked: false, allowed: [], raised: [], moderators: ['host'], ...overrides })

test('outside a meeting or in an unlocked one everyone may unmute', () => {
    setLocalMeetingUid('ana')
    setMeeting(null)
    assert.equal(canUnmute(), true)
    setMeeting(snapshot())
    assert.equal(canUnmute(), true)
})

test('a locked meeting blocks unmuting unless on stage or allowed', () => {
    setLocalMeetingUid('ana')
    setMeeting(snapshot({ locked: true }))
    assert.equal(canUnmute(), false)
    setMeeting(snapshot({ locked: true, allowed: ['ana'] }))
    assert.equal(canUnmute(), true)
    setLocalMeetingUid('host')
    assert.equal(canUnmute(), true)
    assert.equal(isModerator(), true)
    assert.equal(isModerator('ana'), false)
    assert.equal(getMeeting().locked, true)
})

test('setMeeting broadcasts the meetingState signal', () => {
    emitted.length = 0
    setMeeting(null)
    assert.deepEqual(emitted, [{ event: 'meetingState', value: null }])
})
