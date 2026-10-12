import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FocusState, withinReach } from './FocusState'

const clock = () => { let t = 1000; return { now: () => t, advance: (ms: number) => { t += ms } } }
const ids = () => { let n = 0; return () => `k${++n}` }

test('a knock can be accepted once by its target and pairs the two', () => {
  const c = clock(); const focus = new FocusState(c.now, ids())
  const knock = focus.knock('bia', 'ana')
  assert.ok(knock.ok)
  assert.deepEqual(focus.answer('k1', 'caio', true), { ok: false, error: 'Chamada não encontrada.' })
  const answer = focus.answer('k1', 'ana', true)
  assert.ok(answer.ok)
  assert.equal(focus.partnerOf('ana'), 'bia')
  assert.equal(focus.partnerOf('bia'), 'ana')
  assert.equal(focus.focusedOf('bia'), 'ana')
  assert.equal(focus.focusedOf('ana'), 'ana')
  assert.deepEqual(focus.answer('k1', 'ana', true), { ok: false, error: 'Chamada não encontrada.' })
})

test('declining pairs nobody; a late answer expires', () => {
  const c = clock(); const focus = new FocusState(c.now, ids())
  focus.knock('bia', 'ana')
  assert.ok(focus.answer('k1', 'ana', false).ok)
  assert.equal(focus.partnerOf('ana'), null)
  c.advance(60_000)
  focus.knock('bia', 'ana')
  c.advance(30_001)
  assert.deepEqual(focus.answer('k2', 'ana', true), { ok: false, error: 'A chamada expirou.' })
})

test('the same person can knock again only after a minute', () => {
  const c = clock(); const focus = new FocusState(c.now, ids())
  focus.knock('bia', 'ana')
  focus.answer('k1', 'ana', false)
  assert.deepEqual(focus.knock('bia', 'ana'), { ok: false, error: 'Aguarde um minuto para chamar de novo.' })
  c.advance(60_000)
  assert.ok(focus.knock('bia', 'ana').ok)
  assert.ok(focus.knock('caio', 'ana').ok)
  assert.deepEqual(focus.knock('ana', 'ana'), { ok: false, error: 'Chamada inválida.' })
})

test('expire closes a pending knock once', () => {
  const c = clock(); const focus = new FocusState(c.now, ids())
  focus.knock('bia', 'ana')
  assert.equal(focus.expire('k1')?.from, 'bia')
  assert.equal(focus.expire('k1'), null)
})

test('prune ends pairs the caller no longer keeps', () => {
  const c = clock(); const focus = new FocusState(c.now, ids())
  focus.knock('bia', 'ana'); focus.answer('k1', 'ana', true)
  focus.prune(() => true)
  assert.equal(focus.partnerOf('ana'), 'bia')
  focus.prune((focused, knocker) => !(focused === 'ana' && knocker === 'bia'))
  assert.equal(focus.partnerOf('ana'), null)
})

test('reach is the proximity circle of radius 2.5', () => {
  assert.ok(withinReach({ x: 0, y: 0 }, { x: 2, y: 1 }))
  assert.ok(!withinReach({ x: 0, y: 0 }, { x: 2, y: 2 }))
  assert.ok(!withinReach({ x: 0, y: 0 }, { x: 3, y: 0 }))
})
