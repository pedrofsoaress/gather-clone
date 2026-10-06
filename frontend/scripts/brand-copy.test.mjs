import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')

// Files whose visible copy follows the Matte rules. Later tasks append to this list.
const BRANDED_FILES = [
    'components/Brand/MatteLogo.tsx',
    'app/page.tsx',
    'components/Home/OfficePreview.tsx',
    'app/play/IntroScreen.tsx',
    'app/play/SkinMenu/AvatarPicker.tsx',
    'app/signin/page.tsx',
    'app/signin/GoogleSignInButton.tsx',
]
const ENGLISH_LEFTOVERS = [/You are muted/, /Your camera/, /Continue as guest/, /Sign in with/, /Email me/, /Check your email/, /Guest spaces/, /Team members/]

test('brand tokens use the Matte palette', () => {
    const config = read('tailwind.config.js')
    assert.match(config, /pink:\s*['"]#D3135A['"]/)
    assert.match(config, /black:\s*['"]#0B0B0F['"]/)
    assert.match(read('app/globals.css'), /\.matte-backdrop\s*\{/)
    assert.match(read('app/globals.css'), /html:has\(\.matte-backdrop\)/)
})

test('the Matte mark is the official pink glyph', () => {
    const logo = read('components/Brand/MatteLogo.tsx')
    const official = read('public/brand/matte-icon.svg').match(/<path d="([^"]+)"/)[1]
    assert.ok(logo.includes(official), 'uses the path from public/brand/matte-icon.svg')
    assert.match(logo, /#D3135A/)
})

for (const file of BRANDED_FILES) {
    test(`copy rules hold in ${file}`, () => {
        assert.ok(existsSync(new URL(file, root)), `${file} exists`)
        const source = read(file)
        assert.doesNotMatch(source, /[—–]/, 'no em or en dash in copy')
        for (const leftover of ENGLISH_LEFTOVERS) assert.doesNotMatch(source, leftover)
        assert.doesNotMatch(source, /#(?:06d6a0|08D6A0|00d4b2|5FE5C2|2A4B54|CAD8FF|cad8ff)\b/, 'no teal or old navy accents')
    })
}

test('the office link shows a branded loading state from the first paint, with a retry', () => {
    const page = read('app/signin/page.tsx')
    assert.match(page, /useState<Mode>\('checking'\)/, 'server HTML renders the loading card, not the form')
    assert.match(page, /Entrando no escritório…/)
    assert.match(page, /Tentar novamente/)
    assert.match(read('app/signin/layout.tsx'), /themeColor:\s*'#0B0B0F'/)
})
