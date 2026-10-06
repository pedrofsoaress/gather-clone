# Matte Entry Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the three screens a visitor passes through before reaching the map (home, sign-in, character selection) with Matte's identity: black, white, a single pink accent and the Matte mark.

**Architecture:** A small brand kit (Tailwind color tokens, a backdrop class, a `MatteLogo` component and shared class strings) is added first and used by each page. Each page is rewritten in place; no route, data flow or auth behavior changes. The office map, HUD and bottom bar are untouched.

**Tech Stack:** Next.js App Router, React 18, Tailwind CSS 3.4, `@phosphor-icons/react` 2.1 (`/dist/ssr` in server components), Node `node:test` for tests (`node --experimental-strip-types --test`).

**Spec:** Design approved in chat on 2026-10-06 (no separate spec file). Summary, verbatim from the approved design:
- Home: Matte logo and "Instalar app" at the top; pink kicker, title, short subtitle, pink "Entrar no escritório" button and the note "Câmera e microfone começam desligados."; on the right a framed image of the real office map with avatars; three short feature cards below. Single column on phones.
- Character page: Matte logo with the office name; "Prepare sua entrada"; camera preview card with microphone and camera buttons; a card with a large preview of the chosen avatar on a pink glow, arrows, the full grid of 83 avatars always visible with the selected one outlined in pink, the name field and the pink "Entrar no escritório" button. English notices translated to Portuguese.
- Only these pages change; the office itself stays as it is.
- Sign-in page (between home and character page) is an extra task the owner may drop (Task 4).

## Global Constraints

- Brand colors only: background `#0B0B0F`, text white, single accent pink `#D3135A` (hover `#B80F4E`, darker so white text keeps 4.5:1 or more). No teal, blue or green accents on these pages, including the browser bar color and the overscroll background.
- Matte mark: the pink arrow glyph from `frontend/public/brand/matte-icon.svg` (path fill `#D3135A`), drawn without its white square.
- All visible copy in Brazilian Portuguese. No em dash (`—`) or en dash (`–`) in copy; use commas, periods, colons or parentheses. No paired punchlines in the "Não é X. É Y." style.
- Do not change routes, the office URL `/play/0d778bfd-8e16-49bc-832f-3aa60c5bef0c?shareId=f2ac1499-532e-47aa-9244-5b48f8926283`, sign-in logic (who gets signed in and where they are sent), `onJoin` behavior, `frontend/app/play/PlayClient.tsx`, `PlayNavbar.tsx`, `VideoBar.tsx`, or anything under `frontend/utils/pixi` except appending the pure `stepSkin` helper to `utils/pixi/Player/skins.ts` and its test `skins.test.mjs` (Task 3).
- Text contrast meets WCAG AA (4.5:1) for body-size text: pink `#D3135A` is used as a fill or for icons and text of 18.66px bold or larger; small text on pink is white (5.24:1); muted text on black is `text-white/50` or lighter (5.33:1 or more).
- Work happens in the main checkout `/Users/pedrosoares/gather-clone` on branch `feat/matte-entry-pages` (Task 0), not in a git worktree: `frontend/.env.local` and `backend/.env` are not copied into worktrees.
- `MicAndCameraButtons` keeps its current look in the office bar; the new look is opt-in through a `variant` prop.
- Layout must work from 390px wide (no horizontal scroll) to 1440px.
- Publishing touches only the site: every commit message on `main` carries `[skip render]` so the office server is not restarted and nobody is disconnected.

## Review Focus

1. Phone and tablet widths (390px and 768px): hero, cards and avatar grid stack without horizontal scroll, the buttons stay full width and tappable, and the avatar grid keeps small tiles (about 44 to 52px) instead of stretching. Checked by the `noHorizontalScroll` and tile-size assertions in Task 5.
2. Long names (32 characters) and a long office name: the name field and header truncate instead of pushing the layout. Checked in Task 5 by typing a 32-character name and asserting the form card width does not change.
3. Keyboard only: every link, arrow, button and the avatar grid show a visible focus indicator, and the 83 avatars are one Tab stop (arrow keys move inside the grid). Checked in Task 5 by tabbing through the home and character pages and comparing each element's focused and blurred styles.
4. Camera blocked or missing: after clicking "Ativar câmera" with permission denied, the preview still shows "Câmera desligada" on a dark tile and "Entrar no escritório" stays enabled. Checked in Task 5 Step 5 (join is not clicked, to stay out of the live office).
5. Office link arriving at `/signin`: the visitor sees a branded loading state from the first paint (the server HTML contains no form), and a failure shows a Portuguese message with a "Tentar novamente" button. Checked in Task 4's copy test and Task 5 Step 3's `curl` of the server HTML.
6. First-time guests: the name field does not arrive prefilled with the English "Guest-a1b2c3"; it is empty with the Portuguese placeholder. Checked by `suggestedName` tests in Task 3.

---

## File Structure

| File | Responsibility |
|---|---|
| `frontend/tailwind.config.js` (modify) | Add `matte` color tokens. |
| `frontend/app/globals.css` (modify) | Add `.matte-backdrop` background. |
| `frontend/components/Brand/MatteLogo.tsx` (create) | `MatteMark` (glyph) and `MatteLogo` (glyph + wordmark). |
| `frontend/components/Brand/styles.ts` (create) | Shared class strings: `primaryButton`, `secondaryButton`, `card`, `kicker`, `focusRing`. |
| `frontend/scripts/brand-copy.test.mjs` (create) | Guards copy rules on the rebranded files. |
| `frontend/components/Home/OfficePreview.tsx` (create) | Framed office map with avatars for the home hero. |
| `frontend/app/page.tsx` (rewrite) | Home page. |
| `frontend/utils/pixi/Player/skins.ts` (modify) | Add `stepSkin`. |
| `frontend/utils/pixi/Player/skins.test.mjs` (create) | Tests `stepSkin`. |
| `frontend/app/play/SkinMenu/AvatarPicker.tsx` (rewrite) | Avatar preview, arrows and always-visible grid. |
| `frontend/components/VideoChat/MicAndCameraButtons.tsx` (modify) | Optional `variant="brand"`. |
| `frontend/app/play/IntroScreen.tsx` (rewrite) | Character page. |
| `frontend/app/play/introName.ts` (create) | `suggestedName`: hides the generated guest name. |
| `frontend/app/play/introName.test.mjs` (create) | Tests `suggestedName`. |
| `frontend/app/signin/page.tsx`, `GoogleSignInButton.tsx` (modify, Task 4) | Branded, Portuguese sign-in with auto-join state. |
| `frontend/app/signin/layout.tsx` (create, Task 4) | Black browser bar color for the sign-in page. |

---

### Task 0: Branch

- [ ] **Step 1: Create the work branch in the main checkout**

```bash
cd /Users/pedrosoares/gather-clone && git switch main && git pull --ff-only && git switch -c feat/matte-entry-pages
```

Expected: `Switched to a new branch 'feat/matte-entry-pages'`. Run every later command from this checkout (not a worktree).

---

### Task 1: Brand kit

**Files:**
- Modify: `frontend/tailwind.config.js` (the `colors` block inside `theme.extend`)
- Modify: `frontend/app/globals.css` (append)
- Create: `frontend/components/Brand/MatteLogo.tsx`
- Create: `frontend/components/Brand/styles.ts`
- Test: `frontend/scripts/brand-copy.test.mjs`

**Interfaces:**
- Produces: Tailwind classes `bg-matte-black`, `bg-matte-surface`, `bg-matte-pink`, `hover:bg-matte-pink-hover`, `text-matte-pink`, `border-matte-pink`, `outline-matte-pink`; CSS class `matte-backdrop`; `MatteMark({ size?: number, className?: string })`; default export `MatteLogo({ size?: number, label?: string, className?: string })`; named string exports `primaryButton`, `secondaryButton`, `card`, `kicker`, `focusRing` from `@/components/Brand/styles`; test helper list `BRANDED_FILES` inside `brand-copy.test.mjs` that later tasks extend.

- [ ] **Step 1: Write the failing test**

Create `frontend/scripts/brand-copy.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')

// Files whose visible copy follows the Matte rules. Later tasks append to this list.
const BRANDED_FILES = [
    'components/Brand/MatteLogo.tsx',
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test scripts/brand-copy.test.mjs`
Expected: FAIL on all three tests (`pink` token missing, `MatteLogo.tsx` missing).

- [ ] **Step 3: Add the tokens and backdrop**

In `frontend/tailwind.config.js`, inside `theme.extend.colors`, after `'light-gray': "#464B67",` add:

```js
        matte: {
          pink: '#D3135A',
          'pink-hover': '#B80F4E',
          black: '#0B0B0F',
          surface: '#141418',
        },
```

Append to `frontend/app/globals.css`:

```css
/* Pages with the Matte backdrop keep black behind overscroll instead of the office navy. */
html:has(.matte-backdrop) {
    background: #0B0B0F;
}

/* Matte brand background: black with a soft pink glow, as on the Matte link page. */
.matte-backdrop {
    background:
        radial-gradient(1100px 560px at 50% -12%, rgba(211, 19, 90, 0.22), transparent 62%),
        radial-gradient(900px 520px at 100% 112%, rgba(211, 19, 90, 0.10), transparent 60%),
        #0B0B0F;
}
```

- [ ] **Step 4: Create the logo**

Create `frontend/components/Brand/MatteLogo.tsx`:

```tsx
import React from 'react'

const MARK_PATH = 'M122.012 101.162L382.472 101L382.449 378.618L318.546 378.591C316.798 325.049 318.598 264.725 318.256 210.468C302.059 228.367 281.709 254.775 265.966 274.029C237.617 308.11 208.942 344.919 180.126 378.302C156.634 379.691 121.867 378.583 97.5273 378.568C110.221 361.252 129.894 338.567 143.797 321.57L228.429 218.025C238.217 206.084 267.8 171.685 275.234 160.095L121.977 160.185C121.873 140.511 121.885 120.836 122.012 101.162Z'

// The Matte arrow, without the white square of the app icon, for dark backgrounds.
export function MatteMark({ size = 28, className = '' }: { size?: number, className?: string }) {
    return <svg viewBox='96 100 288 280' width={size} height={size} aria-hidden='true' className={className}>
        <path d={MARK_PATH} fill='#D3135A' />
    </svg>
}

export default function MatteLogo({ size = 28, label = 'Matte', className = '' }: { size?: number, label?: string, className?: string }) {
    return <span className={`inline-flex items-center gap-2.5 ${className}`}>
        <MatteMark size={size} />
        <span className='text-lg font-extrabold tracking-tight text-white'>{label}</span>
    </span>
}
```

- [ ] **Step 5: Create the shared classes**

Create `frontend/components/Brand/styles.ts`:

```ts
// Shared Matte styles for the entry pages (home, sign-in, character selection).
export const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'

export const primaryButton = `inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-matte-pink px-6 py-3 text-sm font-bold text-white shadow-[0_10px_30px_rgba(211,19,90,0.35)] transition-colors hover:bg-matte-pink-hover disabled:pointer-events-none disabled:opacity-60 ${focusRing}`

export const secondaryButton = `inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 ${focusRing}`

export const card = 'rounded-2xl border border-white/10 bg-matte-surface/80 backdrop-blur'

// Small label: white text on a pink pill (5.24:1); pink text at this size would be too faint.
export const kicker = 'inline-flex rounded-full bg-matte-pink px-3 py-1 text-[11px] font-bold uppercase tracking-[0.25em] text-white'
```

- [ ] **Step 6: Run tests and typecheck**

Run: `cd frontend && node --test scripts/brand-copy.test.mjs && npx tsc --noEmit --incremental false`
Expected: 3 tests PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/tailwind.config.js frontend/app/globals.css frontend/components/Brand frontend/scripts/brand-copy.test.mjs
git commit -m "feat: add Matte brand kit for entry pages [skip render]"
```

---

### Task 2: Home page

**Files:**
- Create: `frontend/components/Home/OfficePreview.tsx`
- Rewrite: `frontend/app/page.tsx`
- Test: `frontend/scripts/brand-copy.test.mjs` (extend `BRANDED_FILES`)

**Interfaces:**
- Consumes: `MatteLogo`, `primaryButton`, `secondaryButton`, `card`, `kicker`, `matte-backdrop` from Task 1; `AnimatedCharacter` from `@/app/play/SkinMenu/AnimatedCharacter` (`{ src: string, className?: string, noAnimation?: boolean }`).
- Produces: default export `OfficePreview()` (no props).

- [ ] **Step 1: Extend the copy test**

In `frontend/scripts/brand-copy.test.mjs`, add to `BRANDED_FILES`:

```js
    'app/page.tsx',
    'components/Home/OfficePreview.tsx',
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test scripts/brand-copy.test.mjs`
Expected: FAIL for `components/Home/OfficePreview.tsx` (missing) and for `app/page.tsx` (contains `teal-300` is allowed by the regex, but `#cad8ff` is not: fails on "no teal or old navy accents").

- [ ] **Step 3: Create the office preview**

Create `frontend/components/Home/OfficePreview.tsx`:

```tsx
import Image from 'next/image'
import AnimatedCharacter from '@/app/play/SkinMenu/AnimatedCharacter'

// Positions are percentages of the map image; Task 5 adjusts them so each
// avatar stands on open floor in the screenshot.
const people = [
    { skin: '017', name: 'Ana', left: '31%', top: '58%' },
    { skin: '060', name: 'Bruno', left: '38%', top: '58%' },
    { skin: '009', name: 'Carla', left: '70%', top: '38%' },
]

export default function OfficePreview() {
    return <figure className='relative overflow-hidden rounded-3xl border border-white/10 bg-matte-surface shadow-[0_30px_80px_rgba(0,0,0,0.55)]'>
        <Image src='/matte-office-v2.png' alt='Mapa do escritório virtual da Matte' width={1600} height={960} priority sizes='(min-width: 1024px) 600px, 100vw' className='h-auto w-full' />
        <div aria-hidden='true' className='pointer-events-none absolute inset-0 bg-gradient-to-t from-matte-black/50 via-transparent to-transparent' />
        {people.map(person => <div key={person.name} aria-hidden='true' className='absolute flex -translate-x-1/2 -translate-y-full flex-col items-center' style={{ left: person.left, top: person.top }}>
            <span className='mb-0.5 rounded-md bg-matte-black/85 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white'>{person.name}</span>
            <AnimatedCharacter src={`/sprites/characters/Character_${person.skin}.png`} noAnimation className='!h-9 !w-9 sm:!h-11 sm:!w-11' />
        </div>)}
        <figcaption className='absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full bg-matte-black/85 px-3 py-1.5 text-xs font-semibold text-white'>
            <span aria-hidden='true' className='h-2 w-2 rounded-full bg-matte-pink' />
            Ana e Bruno estão conversando
        </figcaption>
    </figure>
}
```

- [ ] **Step 4: Rewrite the home page**

Replace `frontend/app/page.tsx` with:

```tsx
import Link from 'next/link'
import type { Viewport } from 'next'
import { ChatsCircle, Desk, PictureInPicture } from '@phosphor-icons/react/dist/ssr'
import MatteLogo from '@/components/Brand/MatteLogo'
import OfficePreview from '@/components/Home/OfficePreview'
import { card, focusRing, kicker, primaryButton, secondaryButton } from '@/components/Brand/styles'

const officeUrl = '/play/0d778bfd-8e16-49bc-832f-3aa60c5bef0c?shareId=f2ac1499-532e-47aa-9244-5b48f8926283'

// Black browser bar on this page; the office keeps the root layout's navy.
export const viewport: Viewport = { themeColor: '#0B0B0F' }

const features = [
    { Icon: ChatsCircle, title: 'Conversa por proximidade', text: 'Chegue perto de alguém e a chamada abre sozinha. Ao se afastar, ela termina.' },
    { Icon: Desk, title: 'Sua mesa no mapa', text: 'Sente na sua mesa, deixe recados no quadro e veja quem está no escritório.' },
    { Icon: PictureInPicture, title: 'Janela flutuante', text: 'Saia da aba e continue vendo a conversa numa janelinha por cima dos outros programas.' },
]

export default function Index() {
    return <main className='matte-backdrop min-h-screen text-white'>
        <header className='mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6'>
            <MatteLogo />
            <Link href='/install' className={`rounded-lg px-2 py-1 text-sm font-semibold text-white/70 transition-colors hover:text-white ${focusRing}`}>Instalar app</Link>
        </header>

        <section className='mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-14 lg:pb-20 lg:pt-12'>
            <div className='max-w-xl'>
                <p className={kicker}>Matte Office</p>
                <h1 className='mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl'>Escritório virtual da Matte</h1>
                <p className='mt-5 text-lg leading-relaxed text-white/70'>Encontre o time no mapa, sente na sua mesa e converse com quem estiver por perto, com vídeo e áudio direto no navegador.</p>
                <div className='mt-8 flex flex-col gap-3 sm:flex-row'>
                    <Link href={officeUrl} className={primaryButton}>Entrar no escritório</Link>
                    <Link href='/install' className={secondaryButton}>Instalar o aplicativo</Link>
                </div>
                <p className='mt-4 text-sm text-white/60'>Câmera e microfone começam desligados.</p>
            </div>
            <OfficePreview />
        </section>

        <section aria-label='O que dá para fazer no escritório' className='mx-auto grid max-w-6xl gap-4 px-4 pb-16 sm:px-6 md:grid-cols-3'>
            {features.map(({ Icon, title, text }) => <article key={title} className={`${card} p-6`}>
                <span className='grid h-11 w-11 place-items-center rounded-xl bg-matte-pink/15 text-matte-pink'><Icon size={22} weight='bold' /></span>
                <h2 className='mt-4 text-base font-bold'>{title}</h2>
                <p className='mt-2 text-sm leading-relaxed text-white/60'>{text}</p>
            </article>)}
        </section>

        <footer className='border-t border-white/10 py-6 text-center text-xs text-white/60'>© {new Date().getFullYear()} Matte</footer>
    </main>
}
```

- [ ] **Step 5: Run tests and build**

Run: `cd frontend && node --test scripts/brand-copy.test.mjs && npx tsc --noEmit --incremental false && npx next build`
Expected: all copy tests PASS, no type errors, build succeeds with `/` listed.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/Home frontend/app/page.tsx frontend/scripts/brand-copy.test.mjs
git commit -m "feat: rebrand the home page with Matte identity [skip render]"
```

---

### Task 3: Character page

**Files:**
- Modify: `frontend/utils/pixi/Player/skins.ts` (append)
- Create: `frontend/utils/pixi/Player/skins.test.mjs`
- Create: `frontend/app/play/introName.ts`
- Create: `frontend/app/play/introName.test.mjs`
- Rewrite: `frontend/app/play/SkinMenu/AvatarPicker.tsx`
- Modify: `frontend/components/VideoChat/MicAndCameraButtons.tsx`
- Rewrite: `frontend/app/play/IntroScreen.tsx`
- Test: `frontend/scripts/brand-copy.test.mjs` (extend `BRANDED_FILES`)

**Interfaces:**
- Consumes: Task 1 kit; `useVideoChat()` from `@/app/hooks/useVideoChat` (`isCameraMuted`, `isMicMuted`, `isCameraBusy`, `isMicBusy`, `toggleCamera`, `toggleMicrophone`); `skins`, `defaultSkin`.
- Produces: `stepSkin(current: string, direction: number): string` in `@/utils/pixi/Player/skins`; `suggestedName(username: string): string` in `@/app/play/introName`; `MicAndCameraButtons({ variant?: 'office' | 'brand' })` (default `'office'`, unchanged look); `IntroScreen` keeps its props `{ realmName, skin, username, onJoin }` exactly.

- [ ] **Step 1: Write the failing test for `stepSkin`**

Create `frontend/utils/pixi/Player/skins.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { skins, defaultSkin, stepSkin } from './skins.ts'

test('arrows walk through every avatar and wrap around both ends', () => {
    assert.equal(stepSkin('001', 1), '002')
    assert.equal(stepSkin('001', -1), skins.at(-1))
    assert.equal(stepSkin(skins.at(-1), 1), '001')
})

test('an unknown saved avatar starts from the default one', () => {
    assert.equal(stepSkin('999', 1), skins[(skins.indexOf(defaultSkin) + 1) % skins.length])
})
```

Create `frontend/app/play/introName.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { suggestedName } from './introName.ts'

test('the generated guest name is not offered as the office name', () => {
    assert.equal(suggestedName('Guest-a1b2c3'), '')
    assert.equal(suggestedName('Guest-0f9e8d'), '')
})

test('a real name is kept as typed', () => {
    assert.equal(suggestedName('pedro'), 'pedro')
    assert.equal(suggestedName('Guest de honra'), 'Guest de honra')
})
```

- [ ] **Step 2: Extend the copy test**

Add to `BRANDED_FILES` in `frontend/scripts/brand-copy.test.mjs`:

```js
    'app/play/IntroScreen.tsx',
    'app/play/SkinMenu/AvatarPicker.tsx',
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && node --experimental-strip-types --test utils/pixi/Player/skins.test.mjs app/play/introName.test.mjs scripts/brand-copy.test.mjs`
Expected: FAIL: `skins.test.mjs` does not load (`SyntaxError: The requested module './skins.ts' does not provide an export named 'stepSkin'`); `introName.test.mjs` does not load (`Cannot find module` for `./introName.ts`); `IntroScreen.tsx` fails on `/You are muted/`; `AvatarPicker.tsx` fails on the old accent `#cad8ff`.

- [ ] **Step 4: Add `stepSkin`**

Append to `frontend/utils/pixi/Player/skins.ts`:

```ts

export function stepSkin(current: string, direction: number): string {
    const index = skins.includes(current) ? skins.indexOf(current) : skins.indexOf(defaultSkin)
    return skins[(index + direction + skins.length) % skins.length]
}
```

Create `frontend/app/play/introName.ts`:

```ts
// Guests get a generated name like "Guest-a1b2c3" at sign-in. It is English and
// meaningless to the team, so the character page asks for a real name instead.
export function suggestedName(username: string): string {
    return /^Guest-[0-9a-f]{6}$/.test(username) ? '' : username
}
```

- [ ] **Step 5: Rewrite the avatar picker**

Replace `frontend/app/play/SkinMenu/AvatarPicker.tsx` with:

```tsx
import React, { useEffect, useRef, type KeyboardEvent } from 'react'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { skins, defaultSkin, stepSkin } from '@/utils/pixi/Player/skins'

type AvatarPickerProps = {
    value: string
    onChange: (skin: string) => void
    disabled?: boolean
}

function characterStyle(skin: string, size: number): React.CSSProperties {
    return {
        width: size, height: size, imageRendering: 'pixelated',
        backgroundImage: `url(/sprites/characters/Character_${skin}.png)`,
        backgroundSize: '400% 400%', backgroundPosition: '33.333333% 0%',
    }
}

const arrowClass = 'grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/15 text-white transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50'

export default function AvatarPicker({ value, onChange, disabled }: AvatarPickerProps) {
    const selected = skins.includes(value) ? value : defaultSkin
    const index = skins.indexOf(selected)
    const grid = useRef<HTMLDivElement>(null)

    // Keep the chosen avatar visible in the grid (also on load, for a saved avatar
    // low in the list). Only the grid scrolls, never the page. The grid is
    // `relative`, so it is the buttons' offsetParent and offsetTop is grid-relative.
    useEffect(() => {
        const container = grid.current
        const button = container?.querySelector<HTMLElement>('[aria-pressed="true"]')
        if (!container || !button) return
        const top = button.offsetTop
        if (top < container.scrollTop) container.scrollTop = Math.max(0, top - 8)
        else if (top + button.offsetHeight > container.scrollTop + container.clientHeight) container.scrollTop = top + button.offsetHeight - container.clientHeight + 8
    }, [selected])

    // The grid is a single Tab stop; arrow keys move the choice inside it.
    const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const buttons = Array.from(grid.current?.querySelectorAll<HTMLElement>('button') ?? [])
        const columns = buttons.filter(button => button.offsetTop === buttons[0]?.offsetTop).length || 1
        const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }
        const move = moves[event.key]
        if (move === undefined) return
        event.preventDefault()
        const next = Math.min(skins.length - 1, Math.max(0, index + move))
        onChange(skins[next])
        buttons[next]?.focus()
    }

    return <fieldset disabled={disabled} className='w-full min-w-0'>
        <legend className='mb-3 text-sm font-semibold text-white'>Escolha seu boneco</legend>
        <div className='flex items-center justify-between gap-3'>
            <button type='button' aria-label='Boneco anterior' onClick={() => onChange(stepSkin(selected, -1))} className={arrowClass}><CaretLeft size={20} weight='bold' /></button>
            <div className='relative grid h-36 min-w-0 flex-1 place-items-center'>
                <div aria-hidden='true' className='absolute bottom-4 h-6 w-28 rounded-[50%] bg-matte-pink/35 blur-md' />
                <span role='img' aria-label={`Prévia do boneco ${index + 1}`} style={characterStyle(selected, 120)} className='relative' />
            </div>
            <button type='button' aria-label='Próximo boneco' onClick={() => onChange(stepSkin(selected, 1))} className={arrowClass}><CaretRight size={20} weight='bold' /></button>
        </div>
        <p aria-live='polite' className='mt-1 text-center text-xs text-white/60'>Boneco {index + 1} de {skins.length}</p>
        <p id='office-avatar-hint' className='sr-only'>Use as setas do teclado para trocar de boneco.</p>
        <div ref={grid} id='office-avatar-options' role='group' aria-label='Todos os bonecos' aria-describedby='office-avatar-hint' onKeyDown={onGridKeyDown}
            className='relative mt-4 grid max-h-48 grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5 overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-black/30 p-2'>
            {skins.map((skin, skinIndex) => <button key={skin} type='button' aria-label={`Selecionar boneco ${skinIndex + 1}`}
                tabIndex={selected === skin ? 0 : -1}
                aria-pressed={selected === skin} title={`Boneco ${skinIndex + 1}`} onClick={() => onChange(skin)}
                className={`grid aspect-square min-h-11 place-items-center rounded-lg border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${selected === skin ? 'border-matte-pink bg-matte-pink/20' : 'border-transparent hover:bg-white/10'}`}>
                <span aria-hidden='true' style={characterStyle(skin, 36)} />
            </button>)}
        </div>
    </fieldset>
}
```

- [ ] **Step 6: Add the brand variant to the media buttons**

In `frontend/components/VideoChat/MicAndCameraButtons.tsx`, replace the props type, the component signature and the four class computations with:

```tsx
type MicAndCameraButtonsProps = {
    variant?: 'office' | 'brand'
}

const MicAndCameraButtons:React.FC<MicAndCameraButtonsProps> = ({ variant = 'office' }) => {

    const { isCameraMuted, isMicMuted, isCameraBusy, isMicBusy, toggleCamera, toggleMicrophone } = useVideoChat()

    const brand = variant === 'brand'
    const iconClass = (on: boolean) => `w-6 h-6 ${on ? (brand ? 'text-white' : 'text-[#08D6A0]') : (brand ? 'text-matte-pink' : 'text-[#FF2F49]')}`
    const buttonClass = (on: boolean) => on
        ? (brand ? 'bg-white/10 hover:bg-white/20' : 'bg-[#2A4B54] hover:bg-[#3b6975]')
        : (brand ? 'bg-matte-pink/20 hover:bg-matte-pink/30' : 'bg-[#682E44] hover:bg-[#7a3650]')
    const micClass = iconClass(!isMicMuted)
    const cameraClass = iconClass(!isCameraMuted)
```

and in both `<button>` elements replace the first class expression:
- microphone: `${!isMicMuted ? 'bg-[#2A4B54] hover:bg-[#3b6975]' : 'bg-[#682E44] hover:bg-[#7a3650]'}` becomes `${buttonClass(!isMicMuted)}`
- camera: `${!isCameraMuted ? 'bg-[#2A4B54] hover:bg-[#3b6975]' : 'bg-[#682E44] hover:bg-[#7a3650]'}` becomes `${buttonClass(!isCameraMuted)}`

The office bar calls `<MicAndCameraButtons />` with no prop, so its look does not change.

- [ ] **Step 7: Rewrite the character page**

Replace `frontend/app/play/IntroScreen.tsx` with:

```tsx
'use client'
import React, { useEffect, useRef, useState, type FormEvent } from 'react'
import { MicrophoneSlash, VideoCameraSlash } from '@phosphor-icons/react'
import AvatarPicker from './SkinMenu/AvatarPicker'
import { skins, defaultSkin } from '@/utils/pixi/Player/skins'
import { useVideoChat } from '../hooks/useVideoChat'
import MicAndCameraButtons from '@/components/VideoChat/MicAndCameraButtons'
import MatteLogo from '@/components/Brand/MatteLogo'
import { card, kicker, primaryButton } from '@/components/Brand/styles'
import { suggestedName } from './introName'

type IntroScreenProps = {
    realmName: string
    skin: string
    username: string
    onJoin: (displayName: string, skin: string) => Promise<void>
}

const IntroScreen:React.FC<IntroScreenProps> = ({ realmName, skin, username, onJoin }) => {

    const [name, setName] = useState(suggestedName(username))
    const [selectedSkin, setSelectedSkin] = useState(skins.includes(skin) ? skin : defaultSkin)
    const [joining, setJoining] = useState(false)
    const [error, setError] = useState('')
    const joiningRef = useRef(false)
    useEffect(() => setName(suggestedName(username)), [username])
    const normalizedName = name.trim()
    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!normalizedName || normalizedName.length > 32 || joiningRef.current) return
        joiningRef.current = true
        setJoining(true)
        setError('')
        try {
            await onJoin(normalizedName, selectedSkin)
        } catch {
            setError('Não foi possível salvar seu boneco. Confira sua conexão e tente entrar novamente.')
        } finally {
            joiningRef.current = false
            setJoining(false)
        }
    }

    return (
        <main className='matte-backdrop min-h-screen w-full text-white'>
            <header className='mx-auto flex max-w-5xl items-center gap-3 px-4 py-5 sm:px-6'>
                <MatteLogo />
                <span aria-hidden='true' className='h-5 w-px shrink-0 bg-white/15' />
                <span className='min-w-0 truncate text-sm font-semibold text-white/70'>{realmName}</span>
            </header>
            <div className='mx-auto max-w-5xl px-4 pb-12 sm:px-6'>
                <p className={kicker}>Antes de entrar</p>
                <h1 className='mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl'>Prepare sua entrada</h1>
                <p className='mt-2 text-white/60'>Escolha seu boneco e seu nome, e confira câmera e microfone.</p>
                <section className='mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]'>
                    <div className={`${card} p-4 sm:p-5`}>
                        <div className='aspect-video w-full overflow-hidden rounded-xl bg-black'>
                            <LocalVideo />
                        </div>
                        <div className='mt-4 flex flex-wrap items-center justify-between gap-3'>
                            <p className='text-sm text-white/60'>Câmera e microfone começam desligados.</p>
                            <MicAndCameraButtons variant='brand' />
                        </div>
                    </div>
                    <form className={`${card} flex min-w-0 flex-col gap-5 p-4 sm:p-6`} onSubmit={submit} aria-busy={joining}>
                        <AvatarPicker value={selectedSkin} onChange={setSelectedSkin} disabled={joining} />
                        <div className='flex flex-col gap-2'>
                            <label htmlFor='office-display-name' className='text-sm font-semibold'>Seu nome no escritório</label>
                            <input id='office-display-name' type='text' autoComplete='nickname' required maxLength={32}
                                placeholder='Como o time vai te ver'
                                value={name} onChange={event => setName(event.target.value)} disabled={joining}
                                className='w-full min-w-0 rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none transition-colors placeholder:text-white/50 focus:border-matte-pink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white' />
                        </div>
                        {error && <p role='alert' className='text-sm text-rose-300'>{error}</p>}
                        <button type='submit' className={`${primaryButton} w-full`} disabled={joining || !normalizedName || normalizedName.length > 32}>
                            {joining ? 'Preparando seu boneco…' : 'Entrar no escritório'}
                        </button>
                    </form>
                </section>
            </div>
        </main>
    )
}

export default IntroScreen

function LocalVideo() {
    const { isCameraMuted, isMicMuted } = useVideoChat()

    return (
        <div className='relative grid h-full w-full place-items-center bg-[#111114]'>
            <div id='local-video' className='h-full w-full' />
            {isCameraMuted && <div className='absolute flex select-none flex-col items-center gap-2 text-sm text-white/70'>
                <VideoCameraSlash size={28} className='text-matte-pink' />
                <p>Câmera desligada</p>
            </div>}
            {isMicMuted && <p className='absolute bottom-2 right-2 inline-flex select-none items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-xs text-white'>
                <MicrophoneSlash size={14} className='text-matte-pink' /> Microfone desligado
            </p>}
        </div>
    )
}
```

- [ ] **Step 8: Run tests, typecheck and build**

Run: `cd frontend && node --experimental-strip-types --test $(find . -name "*.test.mjs" -not -path "./node_modules/*") && npx tsc --noEmit --incremental false && npx next build`
Expected: every test PASS (the 76 existing plus the new ones), no type errors, build succeeds.

- [ ] **Step 9: Commit**

```bash
git add frontend/utils/pixi/Player/skins.ts frontend/utils/pixi/Player/skins.test.mjs frontend/app/play/introName.ts frontend/app/play/introName.test.mjs frontend/app/play/SkinMenu/AvatarPicker.tsx frontend/components/VideoChat/MicAndCameraButtons.tsx frontend/app/play/IntroScreen.tsx frontend/scripts/brand-copy.test.mjs
git commit -m "feat: rebrand the character selection page [skip render]"
```

---

### Task 4 (optional, owner may drop): Sign-in page

**Files:**
- Rewrite: `frontend/app/signin/page.tsx` (who gets signed in and where they are sent stays identical; only state, messages and markup change)
- Modify: `frontend/app/signin/GoogleSignInButton.tsx`
- Create: `frontend/app/signin/layout.tsx`
- Test: `frontend/scripts/brand-copy.test.mjs` (extend `BRANDED_FILES`)

**Interfaces:**
- Consumes: Task 1 kit.
- Produces: nothing used elsewhere.

- [ ] **Step 1: Extend the copy test**

Add to `BRANDED_FILES`:

```js
    'app/signin/page.tsx',
    'app/signin/GoogleSignInButton.tsx',
```

and add this test at the end of `brand-copy.test.mjs`:

```js
test('the office link shows a branded loading state from the first paint, with a retry', () => {
    const page = read('app/signin/page.tsx')
    assert.match(page, /useState<Mode>\('checking'\)/, 'server HTML renders the loading card, not the form')
    assert.match(page, /Entrando no escritório…/)
    assert.match(page, /Tentar novamente/)
    assert.match(read('app/signin/layout.tsx'), /themeColor:\s*'#0B0B0F'/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test scripts/brand-copy.test.mjs`
Expected: FAIL: `app/signin/page.tsx` fails on `/Continue as guest/`, `GoogleSignInButton.tsx` fails on `/Sign in with/`, and the loading-state test fails on the missing `useState<Mode>('checking')`.

- [ ] **Step 3: Rewrite the sign-in page**

Replace `frontend/app/signin/page.tsx` with (the three sign-in functions and the redirect rules are the current ones; only messages, state and markup change):

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SpinnerGap } from '@phosphor-icons/react'
import { createClient } from '@/utils/supabase/client'
import MatteLogo from '@/components/Brand/MatteLogo'
import { card, primaryButton, secondaryButton } from '@/components/Brand/styles'
import GoogleSignInButton from './GoogleSignInButton'

type Mode = 'checking' | 'joining' | 'form'

export default function Login() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [status, setStatus] = useState('')
    const [loading, setLoading] = useState(false)
    // Starts as 'checking' so the prerendered HTML and the first paint show the
    // loading card; visitors from the office link never see a flash of the form.
    const [mode, setMode] = useState<Mode>('checking')
    const [guestFailed, setGuestFailed] = useState(false)
    const autoJoinStarted = useRef(false)

    const getDestination = () => {
        const requested = new URLSearchParams(window.location.search).get('next')
        if (!requested?.startsWith('/play/') || requested.startsWith('//')) return '/app'
        const destination = new URL(requested, window.location.origin)
        return destination.origin === window.location.origin
            ? `${destination.pathname}${destination.search}`
            : '/app'
    }

    const failGuest = (message: string) => {
        setStatus(message)
        setGuestFailed(true)
        setMode('form')
        setLoading(false)
    }

    const signInAsGuest = async () => {
        setLoading(true)
        setStatus('')
        setGuestFailed(false)
        const supabase = createClient()
        const guestName = `Guest-${crypto.randomUUID().slice(0, 6)}`
        const { data, error } = await supabase.auth.signInAnonymously({
            options: { data: { email: `${guestName}@guest.local` } },
        })
        if (error || !data.user) return failGuest('Não foi possível criar sua entrada como visitante.')

        const { error: profileError } = await supabase.from('profiles').upsert(
            { id: data.user.id },
            { onConflict: 'id', ignoreDuplicates: true },
        )
        if (profileError) return failGuest('Não foi possível preparar seu perfil.')

        router.push(getDestination())
        router.refresh()
    }

    useEffect(() => {
        if (autoJoinStarted.current) return
        const destination = getDestination()
        if (destination === '/app' || !destination.includes('shareId=')) {
            setMode('form')
            return
        }
        autoJoinStarted.current = true
        setMode('joining')
        const supabase = createClient()
        void supabase.auth.getSession().then(({ data }) => {
            if (data.session) {
                router.replace(destination)
            } else {
                void signInAsGuest()
            }
        })
    }, [])

    const signInWithEmail = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setLoading(true)
        setStatus('')
        const supabase = createClient()
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        })
        setStatus(error ? 'Não foi possível enviar o link. Confira o e-mail e tente novamente.' : 'Enviamos um link de acesso para o seu e-mail.')
        setLoading(false)
    }

    const signInWithGoogle = async () => {
        const supabase = createClient()
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: process.env.NEXT_PUBLIC_BASE_URL + '/auth/callback'
            }
        })
        if (error) setStatus('Não foi possível entrar com o Google.')
    }

    return (
        <main className='matte-backdrop grid min-h-screen place-items-center px-4 py-12 text-white'>
            <div className={`${card} w-full max-w-sm p-6 sm:p-8`}>
                <MatteLogo />
                {mode !== 'form' ? <div className='mt-8 flex flex-col items-center gap-4 text-center' role='status'>
                    <SpinnerGap size={32} className='animate-spin text-matte-pink' />
                    <p className='text-lg font-bold'>{mode === 'joining' ? 'Entrando no escritório…' : 'Carregando…'}</p>
                    {mode === 'joining' && <p className='text-sm text-white/60'>Estamos preparando sua entrada como visitante.</p>}
                </div> : <>
                    <h1 className='mt-8 text-2xl font-extrabold tracking-tight'>Entrar no escritório</h1>
                    <p className='mt-2 text-sm text-white/60'>Entre como visitante ou use seu e-mail da equipe.</p>
                    <button type='button' onClick={signInAsGuest} disabled={loading} className={`${primaryButton} mt-6 w-full`}>
                        {guestFailed ? 'Tentar novamente' : 'Entrar como visitante'}
                    </button>
                    <p className='mt-3 text-xs leading-relaxed text-white/60'>Como visitante, seus espaços ficam salvos só neste navegador e se perdem ao sair da conta ou limpar os dados do navegador.</p>
                    <form onSubmit={signInWithEmail} className='mt-6 flex flex-col gap-2 border-t border-white/10 pt-6'>
                        <label htmlFor='email' className='text-sm font-semibold'>E-mail da equipe</label>
                        <input id='email' type='email' required autoComplete='email' value={email} onChange={(event) => setEmail(event.target.value)}
                            className='w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none transition-colors focus:border-matte-pink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'/>
                        <button type='submit' disabled={loading} className={`${secondaryButton} mt-1 w-full`}>
                            {loading ? 'Enviando…' : 'Receber link de acesso'}
                        </button>
                    </form>
                    {process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true' && <div className='mt-3'><GoogleSignInButton onClick={signInWithGoogle} /></div>}
                </>}
                {status && <p role='status' className='mt-4 text-center text-sm text-white/80'>{status}</p>}
            </div>
        </main>
    )
}
```

Create `frontend/app/signin/layout.tsx` (the page is a client component and cannot export `viewport`):

```tsx
import type { ReactNode } from 'react'
import type { Viewport } from 'next'

// Black browser bar on the sign-in page; the office keeps the root layout's navy.
export const viewport: Viewport = { themeColor: '#0B0B0F' }

export default function SignInLayout({ children }: { children: ReactNode }) {
    return children
}
```

- [ ] **Step 4: Rebrand the Google button**

Replace the JSX returned by `frontend/app/signin/GoogleSignInButton.tsx` with:

```tsx
        <button type='button' className='flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 text-sm font-bold text-black transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white' onClick={onClick}>
            <img src='/google-logo.png' alt='' className='h-5' />
            <span>Entrar com Google</span>
        </button>
```

- [ ] **Step 5: Run tests, typecheck and build**

Run: `cd frontend && node --test scripts/brand-copy.test.mjs && npx tsc --noEmit --incremental false && npx next build`
Expected: all PASS, build succeeds with `/signin` listed.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/signin frontend/scripts/brand-copy.test.mjs
git commit -m "feat: rebrand the sign-in page in Portuguese [skip render]"
```

---

### Task 5: Visual verification, review and publish

**Files:**
- Create (scratch, not committed): `$SCRATCH/entry-shots.cjs` and `$SCRATCH/guest-uids.txt`, where `$SCRATCH` is the session scratchpad directory.

**Interfaces:**
- Consumes: the finished pages; Playwright from `/Users/pedrosoares/matte-one/node_modules/playwright-core` (1.62); Google Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`; Supabase admin credentials in `/Users/pedrosoares/gather-clone/backend/.env` (only to delete the temporary guests this task creates).

Running `/play/...` locally is safe for the live office: the character page does not connect to the office server; only clicking "Entrar no escritório" does, and the script never clicks it.

- [ ] **Step 1: Start the production build locally**

Run (background): `cd /Users/pedrosoares/gather-clone/frontend && npx next build && npx next start -p 3100`
Expected: `Ready` on `http://localhost:3100`.

- [ ] **Step 2: Write the screenshot and layout script**

Create `$SCRATCH/entry-shots.cjs`:

```js
const { chromium } = require('/Users/pedrosoares/matte-one/node_modules/playwright-core')
const fs = require('fs')
const [out, mode = 'full'] = process.argv.slice(2) // mode: 'full' or 'camera-blocked'
const base = 'http://localhost:3100'
const office = '/play/0d778bfd-8e16-49bc-832f-3aa60c5bef0c?shareId=f2ac1499-532e-47aa-9244-5b48f8926283'
const widths = [1440, 1024, 768, 390]
const failures = []
const check = (ok, message) => { if (!ok) failures.push(message) }

async function noHorizontalScroll(page, label) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    check(overflow <= 0, `${label}: horizontal scroll of ${overflow}px`)
}

// Visible focus = focusing changes the outline, box-shadow or border to something not transparent.
async function tabThrough(page, label, stops) {
    await page.evaluate(() => (document.activeElement)?.blur())
    const seen = []
    for (let i = 0; i < stops; i++) {
        await page.keyboard.press('Tab')
        const result = await page.evaluate(() => {
            const el = document.activeElement
            if (!el || el === document.body) return null
            const read = style => ({ outline: `${style.outlineStyle}|${style.outlineWidth}|${style.outlineColor}`, shadow: style.boxShadow, border: style.borderColor })
            const name = el.getAttribute('aria-label') || el.textContent.trim().slice(0, 24) || el.tagName
            const focused = read(getComputedStyle(el))
            const style = getComputedStyle(el)
            const outlineShown = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0 && style.outlineColor !== 'rgba(0, 0, 0, 0)'
            el.blur()
            const blurred = read(getComputedStyle(el))
            el.focus()
            return { name, visible: (outlineShown && focused.outline !== blurred.outline) || focused.shadow !== blurred.shadow || focused.border !== blurred.border }
        })
        if (!result) break
        seen.push(result.name)
        check(result.visible, `${label}: no visible focus on "${result.name}"`)
    }
    return seen
}

async function signInFromOfficeLink(browser, contextOptions) {
    const context = await browser.newContext(contextOptions)
    const page = await context.newPage()
    await page.goto(base + office)
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${out}/signin-autojoin-${mode}.png` })
    await page.getByRole('heading', { name: 'Prepare sua entrada' }).waitFor({ timeout: 60000 })
    // @supabase/ssr keeps the session in (possibly chunked) cookies: sb-<ref>-auth-token[.N] = "base64-<json>".
    // Reading it identifies exactly the guest this run created, so cleanup never touches a real visitor.
    const authCookies = (await context.cookies()).filter(cookie => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name))
        .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
    const rawSession = authCookies.map(cookie => decodeURIComponent(cookie.value)).join('').replace(/^base64-/, '')
    const uid = rawSession ? JSON.parse(Buffer.from(rawSession, 'base64url').toString('utf8')).user?.id ?? null : null
    if (uid) fs.appendFileSync(`${out}/guest-uids.txt`, uid + '\n')
    console.log('GUEST_UID=' + uid)
    check(Boolean(uid), 'could not read the temporary guest id; find it in Supabase (anonymous user created in the last minutes, email Guest-xxxxxx@guest.local) and delete it by hand')
    return { context, page }
}

;(async () => {
    const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    const mediaArgs = mode === 'full' ? ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] : []
    const browser = await chromium.launch({ executablePath: chrome, args: mediaArgs })
    try {
        if (mode === 'full') {
            for (const width of widths) {
                const page = await browser.newPage({ viewport: { width, height: 900 } })
                await page.goto(base + '/', { waitUntil: 'networkidle' })
                await page.screenshot({ path: `${out}/home-${width}.png`, fullPage: true })
                await noHorizontalScroll(page, `home ${width}`)
                if (width === 1440) console.log('home tab order:', await tabThrough(page, 'home', 4))
                await page.close()
            }
        }
        const { page } = await signInFromOfficeLink(browser, { viewport: { width: 1440, height: 900 } })
        check(await page.inputValue('#office-display-name') === '', 'the generated guest name was prefilled')
        if (mode === 'full') {
            for (const width of widths) {
                await page.setViewportSize({ width, height: 900 })
                await page.waitForTimeout(300)
                await page.screenshot({ path: `${out}/intro-${width}.png`, fullPage: true })
                await noHorizontalScroll(page, `intro ${width}`)
                const tile = await page.locator('#office-avatar-options button').first().boundingBox()
                check(tile && tile.width >= 40 && tile.width <= 60, `intro ${width}: avatar tile is ${tile?.width}px wide`)
            }
            // Long name keeps the form card width.
            await page.setViewportSize({ width: 390, height: 900 })
            const form = page.locator('form').first()
            const before = (await form.boundingBox()).width
            await page.fill('#office-display-name', 'Maria Eduarda Albuquerque Santos')
            check(Math.abs((await form.boundingBox()).width - before) < 1, 'intro 390: long name changed the form width')
            // Keyboard: every stop shows focus, and the 83 avatars are a single stop.
            await page.setViewportSize({ width: 1440, height: 900 })
            const order = await tabThrough(page, 'intro', 10)
            console.log('intro tab order:', order)
            check(order.filter(name => name.startsWith('Selecionar boneco')).length === 1, 'avatar grid is not a single Tab stop')
            await page.screenshot({ path: `${out}/intro-focus.png` })
        } else {
            // Camera denied: the preview keeps the off state and joining stays possible (join is never clicked).
            await page.getByRole('button', { name: 'Ativar câmera' }).click()
            await page.waitForTimeout(1500)
            check(await page.getByText('Câmera desligada').isVisible(), 'camera denied: "Câmera desligada" not shown')
            await page.fill('#office-display-name', 'Teste')
            check(await page.getByRole('button', { name: 'Entrar no escritório' }).isEnabled(), 'camera denied: join button disabled')
            await page.screenshot({ path: `${out}/intro-camera-blocked.png` })
        }
    } finally {
        await browser.close()
        console.log(JSON.stringify({ failures }, null, 2))
    }
})().catch(error => { console.error(error); process.exit(1) })
```

- [ ] **Step 3: Run it, check the server HTML and read every screenshot**

Run: `node $SCRATCH/entry-shots.cjs $SCRATCH full`
Expected: `failures: []`.

If Task 4 was done, run: `curl -s "http://localhost:3100/signin?next=%2Fplay%2F0d778bfd-8e16-49bc-832f-3aa60c5bef0c%3FshareId%3Df2ac1499-532e-47aa-9244-5b48f8926283" | grep -c "Entrar como visitante"`
Expected: `0` (the first paint is the loading card).

Open each PNG and run the alignment checklist: equal card heights per row; kicker and title aligned to the same left edge; gaps from the 8/12/16/24 scale; `min-w-0` and truncation on long text; nothing touching the viewport edge at 390px; avatar tiles square and evenly spaced at every width. Adjust `OfficePreview` avatar `left`/`top` percentages so each avatar stands on open floor. After every run (including failed runs and reruns) do Step 4 before the next run. Commit fixes with a message ending in `[skip render]`.

- [ ] **Step 4: Delete the temporary guests**

Run after every script run; it deletes only ids recorded by the script, and only if Supabase confirms they are anonymous:

```bash
cd /Users/pedrosoares/gather-clone/backend && set -a && . ./.env && set +a && touch "$SCRATCH/guest-uids.txt" && while read uid; do [ -n "$uid" ] || continue; if curl -s "$SUPABASE_URL/auth/v1/admin/users/$uid" -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE" | grep -q '"is_anonymous":true'; then curl -s -o /dev/null -w "$uid %{http_code}\n" -X DELETE "$SUPABASE_URL/auth/v1/admin/users/$uid" -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE"; else echo "$uid skipped (not anonymous)"; fi; done < "$SCRATCH/guest-uids.txt" && : > "$SCRATCH/guest-uids.txt"
```

Expected: one `<uid> 200` line per recorded guest (the profile row is removed by the cascade), then an empty `guest-uids.txt`.

- [ ] **Step 5: Camera blocked check**

Run: `node $SCRATCH/entry-shots.cjs $SCRATCH camera-blocked`
Expected: `failures: []`, and `intro-camera-blocked.png` shows "Câmera desligada" on a dark tile. Then run Step 4.

- [ ] **Step 6: Independent review**

Run an independent review of `git diff main...feat/matte-entry-pages` (adversarial verification of each finding) against this plan and the Global Constraints. Fix confirmed findings with tests where they apply; commit with `[skip render]`.

- [ ] **Step 7: Publish the site only**

From `/Users/pedrosoares/gather-clone` (main checkout):

```bash
git log --format=%s main..feat/matte-entry-pages | grep -v '\[skip render\]' && echo "STOP: a commit lacks [skip render]" || (git switch main && git merge --ff-only feat/matte-entry-pages && git push origin main)
```

Expected: no `STOP` line; fast-forward and push succeed (no merge commit is created). Do not push `feat/matte-entry-pages`: branch previews fail on Vercel until the Preview environment gets the variables. Wait until the Vercel Production deployment for the new `main` SHA reports `success`, then confirm `npx vercel inspect gather-clone-beta.vercel.app` (from `frontend/`) shows the new deployment.
