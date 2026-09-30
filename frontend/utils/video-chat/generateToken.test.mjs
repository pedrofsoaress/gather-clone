import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import * as identity from './agoraIdentity.ts'

const require = createRequire(import.meta.url)
const agora = require('agora-token')
const { AccessToken2 } = require('agora-token/src/AccessToken2')
const uid = '11111111-1111-4111-8111-111111111111'

function load(allowed = true) {
  const exports = {}
  const source = ts.transpileModule(readFileSync(new URL('./generateToken.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  vm.runInNewContext(source, {
    exports, URLSearchParams,
    process: { env: { NEXT_PUBLIC_BACKEND_URL: 'https://backend.test', NEXT_PUBLIC_AGORA_APP_ID: 'a'.repeat(32), APP_CERTIFICATE: 'b'.repeat(32) } },
    fetch: async url => {
      const parsed = new URL(url)
      const publish = parsed.searchParams.get('publish') === 'true'
      return { ok: allowed, json: async () => parsed.pathname === '/speakerAuthorization'
        ? { channel: 'speaker-test', uid: `${uid}-${publish ? 'speaker' : 'listen'}`, publish }
        : { channel: parsed.searchParams.get('channel'), uid: parsed.searchParams.get('uid') } }
    },
    require: name => {
      if (name === 'agora-token') return agora
      if (name === './agoraIdentity') return identity
      if (name === '../supabase/server') return { createClient: () => ({ auth: {
        getUser: async () => ({ data: { user: { id: uid } } }),
        getSession: async () => ({ data: { session: { user: { id: uid }, access_token: 'mock-access' } } }),
      } }) }
      throw new Error(name)
    },
  })
  return exports
}

test('issued Agora v2 tokens carry relative 1-hour and 10-minute lifetimes', async () => {
  const api = load()
  for (const [token, expected] of [
    [await api.generateToken('0123456789abcdef', uid), 3600],
    [(await api.generateSpeakerToken('speaker', true)).token, 600],
  ]) {
    const decoded = new AccessToken2()
    assert.ok(token.startsWith('007'))
    decoded.from_string(token)
    assert.equal(decoded.expire, expected)
    assert.equal(decoded.services[1].__privileges[1], expected)
  }
})

test('backend membership denial prevents both conversation and speaker tokens', async () => {
  const api = load(false)
  assert.equal(await api.generateToken('0123456789abcdef', uid), null)
  assert.equal(await api.generateSpeakerToken('speaker', true), null)
})
