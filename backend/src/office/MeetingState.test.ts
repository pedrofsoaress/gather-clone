import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MeetingState } from './MeetingState'

test('unlocked meetings let everyone speak; locked ones only moderators and allowed people', () => {
    const meeting = new MeetingState()
    assert.equal(meeting.canSpeak('ana', false), true)
    meeting.locked = true
    assert.equal(meeting.canSpeak('ana', false), false)
    assert.equal(meeting.canSpeak('host', true), true)
    meeting.allowed.add('ana')
    assert.equal(meeting.canSpeak('ana', false), true)
})

test('leaving clears the raised hand and the permission', () => {
    const meeting = new MeetingState()
    meeting.raised.add('ana'); meeting.allowed.add('ana')
    meeting.leave('ana')
    assert.equal(meeting.raised.has('ana'), false)
    assert.equal(meeting.allowed.has('ana'), false)
})

test('snapshots are plain sorted arrays', () => {
    const meeting = new MeetingState()
    meeting.locked = true; meeting.raised.add('bia'); meeting.raised.add('ana'); meeting.allowed.add('caio')
    assert.deepEqual(meeting.snapshot('matte-training', ['host']), { areaId: 'matte-training', locked: true, allowed: ['caio'], raised: ['ana', 'bia'], moderators: ['host'] })
})
