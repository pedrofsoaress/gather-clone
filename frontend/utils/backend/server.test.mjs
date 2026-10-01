import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function harness() {
    const handlers = new Map()
    const managerHandlers = new Map()
    const emitted = []
    let options
    let currentToken = 'fresh-token'
    const socket = {
        io: { on: (name, callback) => managerHandlers.set(name, callback), off: name => managerHandlers.delete(name) },
        on: (name, callback) => handlers.set(name, callback),
        once: (name, callback) => handlers.set(name, callback),
        off: name => handlers.delete(name),
        emit: (name, value) => emitted.push({ name, value }),
        connect() { handlers.get('connect')?.() },
        disconnect() {},
    }
    const source = ts.transpileModule(readFileSync(new URL('./server.ts', import.meta.url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText
    const exports = {}
    vm.runInNewContext(source, {
        exports, process: { env: { NEXT_PUBLIC_BACKEND_URL: 'https://backend.example' } },
        console, setTimeout, clearTimeout,
        require: name => {
            if (name === 'socket.io-client') return { __esModule: true, default: (_url, nextOptions) => { options = nextOptions; return socket } }
            if (name === '../supabase/client') return { createClient: () => ({ auth: { getSession: async () => ({ data: { session: currentToken ? { user: { id: 'user-1' }, access_token: currentToken } : null }, error: null }) } }) }
            if (name === './requests') return { request() {} }
            throw new Error(`Unexpected import: ${name}`)
        },
    })
    return { server: exports.server, handlers, emitted, getOptions: () => options, setToken: value => { currentToken = value } }
}

test('socket connects over WebSocket with polling fallback and refreshes auth on every handshake', async () => {
    const env = harness()
    const connection = env.server.connect('realm', 'user-1', 'share', 'Pedro')
    const options = env.getOptions()
    assert.deepEqual(Array.from(options.transports), ['websocket', 'polling'])
    assert.equal(options.tryAllTransports, true)
    assert.deepEqual(JSON.parse(JSON.stringify(env.emitted)), [{ name: 'joinRealm', value: { realmId: 'realm', shareId: 'share', displayName: 'Pedro' } }])

    const first = await new Promise(resolve => options.auth(resolve))
    assert.equal(first.token, 'fresh-token')
    env.setToken('refreshed-token')
    const second = await new Promise(resolve => options.auth(resolve))
    assert.equal(second.token, 'refreshed-token')
    env.handlers.get('joinedRealm')()
    assert.equal((await connection).success, true)
})

test('socket auth does not reuse an expired session token', async () => {
    const env = harness()
    const connection = env.server.connect('realm', 'user-1', 'share', 'Pedro')
    env.setToken(null)
    const auth = await new Promise(resolve => env.getOptions().auth(resolve))
    assert.equal(auth.token, '')
    env.handlers.get('connect_error')(new Error('Invalid access token or uid.'))
    const result = await connection
    assert.equal(result.success, false)
    assert.match(result.errorMessage, /sessão expirou/)
})
