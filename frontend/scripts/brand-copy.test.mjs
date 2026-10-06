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

test('the office link never waits forever: errors and a timeout bring back the retry', () => {
    const page = read('app/signin/page.tsx')
    assert.match(page, /AUTO_JOIN_TIMEOUT_MS = 15000/)
    assert.match(page, /window\.setTimeout\(/)
    assert.match(page, /A entrada está demorando\. Tente novamente\./)
    assert.match(page, /\} catch \(error\) \{\s*console\.error\(error\)\s*failGuest\('Não foi possível criar sua entrada como visitante\. Confira sua conexão\.'\)/)
    assert.match(page, /getSession\(\)\.then\([\s\S]*?\}\)\.catch\(/, 'getSession failures are handled')
    assert.match(page, /return clearAutoJoinTimer/, 'the timeout is cleared when the page unmounts')
    assert.match(page, /console\.error\(profileError\)/)
    assert.match(page, /<SpinnerGap[^>]*aria-hidden='true'/)
})

test('the character page paints the browser bar black and gives the office its color back', () => {
    const intro = read('app/play/IntroScreen.tsx')
    assert.match(intro, /meta\[name="theme-color"\]/)
    assert.match(intro, /brandThemeColor = '#0B0B0F'/)
    assert.match(intro, /const previous = meta\.content/)
    assert.match(intro, /meta\.content = previous/, 'restores the previous theme color on unmount')
    assert.match(read('app/play/PlayClientLoader.tsx'), /loading: \(\) => <main className='matte-backdrop min-h-screen' \/>/)
})

test('camera and microphone errors are shown on the character page', () => {
    const intro = read('app/play/IntroScreen.tsx')
    assert.match(intro, /signal\.on\('officeFeedback', onFeedback\)/)
    assert.match(intro, /signal\.off\('officeFeedback', onFeedback\)/)
    assert.match(intro, /role='status'[^>]*>\{mediaFeedback \|\| 'Câmera e microfone começam desligados\.'\}/)
})

test('only the brand mic and camera buttons grow to 44px; the office bar keeps p-2', () => {
    const buttons = read('components/VideoChat/MicAndCameraButtons.tsx')
    assert.match(buttons, /const padding = brand \? 'p-2\.5' : 'p-2'/)
    assert.equal((buttons.match(/\$\{padding\} rounded-full animate-colors outline-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-white/g) ?? []).length, 2)
})

test('the home preview image declares its real size', () => {
    const png = readFileSync(new URL('public/matte-office-v2.png', root))
    const width = png.readUInt32BE(16)
    const height = png.readUInt32BE(20)
    assert.match(read('components/Home/OfficePreview.tsx'), new RegExp(`width=\\{${width}\\} height=\\{${height}\\}`))
})

test('home hero buttons stay full width up to tablet width', () => {
    // md: starts at 768px, so the row layout waits for lg: (1024px).
    assert.match(read('app/page.tsx'), /<div className='mt-8 flex flex-col gap-3 lg:flex-row'>/)
})
