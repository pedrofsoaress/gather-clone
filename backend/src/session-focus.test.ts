import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Session, type Room, type OfficeObject } from './session'
import { FocusState } from './office/FocusState'

function setup() {
    const tilemap: Room['tilemap'] = {}
    for (let x = 0; x < 12; x++) for (let y = 0; y < 6; y++) tilemap[`${x}, ${y}`] = {}
    const desk = (id: string, x: number, approachX: number, focus: boolean): OfficeObject => ({
        id, kind: 'desk', label: id, bounds: { x, y: 1, width: 2, height: 1 }, approach: { x: approachX, y: 3 }, ...(focus ? { focus: true } : {}),
    })
    const interactions = [desk('focus-a', 1, 2, true), desk('focus-b', 5, 6, true), desk('plain', 9, 10, false)]
    const session = new Session('office', { spawnpoint: { roomIndex: 0, x: 0, y: 5 }, rooms: [{ name: 'Matte', tilemap, interactions }] })
    const add = (uid: string, x: number, y: number) => { session.addPlayer(`s-${uid}`, uid, uid, '009'); session.roomFeatures[0].office.addPlayer(uid, { x, y }, uid); session.movePlayer(uid, x, y) }
    // Focus desks are never taken by walking past: the visitor stands at the approach tile and clicks the desk.
    const sitAt = (uid: string, x: number) => {
        add(uid, x, 3)
        assert.ok(session.roomFeatures[0].office.occupy(uid, x < 4 ? 'focus-a' : 'focus-b').ok)
        session.setProximityIdsWithPlayer(uid)
    }
    const pair = (focused: string, knocker: string) => {
        let n = 0
        session.focus = new FocusState(() => 1000, () => `k${++n}`)
        const knock = session.focus.knock(knocker, focused)
        assert.ok(knock.ok)
        assert.ok(session.focus.answer(`k${n}`, focused, true).ok)
        session.setProximityIdsWithPlayer(knocker)
    }
    return { session, add, sitAt, pair }
}

test('a person at a focus desk joins no proximity call', () => {
    const { session, add, sitAt } = setup()
    sitAt('ana', 2)
    add('bia', 3, 3)
    assert.equal(session.isFocused('ana'), true)
    assert.equal(session.isFocused('bia'), false)
    assert.equal(session.getPlayer('ana').proximityId, null)
    assert.equal(session.getPlayer('bia').proximityId, null)
})

test('sitting down by clicking also leaves the call at once', () => {
    const { session, add } = setup()
    add('ana', 2, 4); add('bia', 3, 4)
    const call = session.getPlayer('ana').proximityId
    assert.ok(call)
    assert.equal(session.getPlayer('bia').proximityId, call)
    assert.ok(session.featuresFor('ana').office.occupy('ana', 'focus-a').ok)
    session.setProximityIdsWithPlayer('ana')
    assert.equal(session.getPlayer('ana').proximityId, null)
    assert.equal(session.getPlayer('bia').proximityId, null)
})

test('two focused neighbours and someone between them stay apart', () => {
    const { session, add, sitAt } = setup()
    sitAt('ana', 2); sitAt('caio', 6)
    add('bia', 4, 3)
    for (const uid of ['ana', 'bia', 'caio']) assert.equal(session.getPlayer(uid).proximityId, null, uid)
})

test('an accepted knock joins the two; walking away or standing up ends it', () => {
    const { session, add, sitAt, pair } = setup()
    sitAt('ana', 2)
    add('bia', 3, 4)
    pair('ana', 'bia')
    const call = session.getPlayer('ana').proximityId
    assert.ok(call)
    assert.equal(session.getPlayer('bia').proximityId, call)

    session.movePlayer('bia', 6, 4)
    assert.equal(session.getPlayer('ana').proximityId, null)
    assert.equal(session.getPlayer('bia').proximityId, null)
    assert.equal(session.focus.partnerOf('ana'), null)

    session.movePlayer('bia', 3, 4)
    pair('ana', 'bia')
    assert.ok(session.getPlayer('ana').proximityId)
    assert.ok(session.featuresFor('ana').office.release('ana').ok)
    session.setProximityIdsWithPlayer('ana')
    assert.equal(session.focus.partnerOf('ana'), null)
    const shared = session.getPlayer('ana').proximityId
    assert.ok(shared)
    assert.equal(session.getPlayer('bia').proximityId, shared)
    session.movePlayer('ana', 8, 5)
    assert.equal(session.getPlayer('ana').proximityId, null)
    assert.equal(session.getPlayer('bia').proximityId, null)
    assert.equal(session.focus.partnerOf('ana'), null)
})

test('removing a player ends their pair', () => {
    const { session, add, sitAt, pair } = setup()
    sitAt('ana', 2)
    add('bia', 3, 4)
    pair('ana', 'bia')
    assert.equal(session.focus.partnerOf('ana'), 'bia')
    session.removePlayer('bia')
    session.setProximityIdsWithPlayer('bia')
    assert.equal(session.focus.partnerOf('ana'), null)
    assert.equal(session.getPlayer('ana').proximityId, null)
})

test('walking next to a free focus desk does not seat you, clicking does', () => {
    const { session, add } = setup()
    add('ana', 2, 4)
    const office = session.roomFeatures[0].office
    assert.ok(office.step('ana', { x: 2, y: 3 }).ok)
    session.movePlayer('ana', 2, 3)
    assert.equal(session.isFocused('ana'), false)
    assert.ok(office.occupy('ana', 'focus-a').ok)
    assert.equal(session.isFocused('ana'), true)
})
