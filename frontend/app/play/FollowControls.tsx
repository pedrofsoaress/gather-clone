'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import signal from '@/utils/signal'
import { server } from '@/utils/backend/server'
import { placeFollowBanner } from '@/utils/pixi/office/follow'

type AvatarMenu = { uid: string, name: string, screenX: number, screenY: number }

// "Seguir uma pessoa": the button next to a clicked avatar, the "Seguindo" banner, and the
// notices for the person being followed.
export default function FollowControls() {
    const [menu, setMenu] = useState<AvatarMenu | null>(null)
    const [following, setFollowing] = useState<string | null>(null)
    const [place, setPlace] = useState<{ left: number, top: number } | null>(null)
    const menuButton = useRef<HTMLButtonElement | null>(null)
    const openMenu = useRef<AvatarMenu | null>(null)
    const banner = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        const onMenu = (value: AvatarMenu | null) => { openMenu.current = value; setMenu(value) }
        const onFollowState = ({ name }: { name: string | null }) => setFollowing(name)
        const onFollowNotice = ({ name, following }: { name: string, following: boolean }) => {
            if (typeof name !== 'string' || !name) return
            signal.emit('officeNotice', {
                message: following ? `${name} está te seguindo.` : `${name} parou de te seguir.`,
                key: `follow-notice:${name}:${following}`,
            })
        }
        const attach = () => {
            const socket = server.socket
            socket.on('followNotice', onFollowNotice)
            return () => { socket.off('followNotice', onFollowNotice) }
        }
        let detach: (() => void) | undefined
        const onReady = () => { detach?.(); detach = attach() }
        signal.on('avatarMenu', onMenu)
        signal.on('followState', onFollowState)
        signal.on('officeReady', onReady)
        if (server.socket.connected) onReady()
        return () => {
            signal.off('avatarMenu', onMenu)
            signal.off('followState', onFollowState)
            signal.off('officeReady', onReady)
            detach?.()
        }
    }, [])

    // Any click outside the button closes it. The office handles clicks on the map first
    // (closing it, or opening it for another avatar); a click it ignored still closes it.
    useEffect(() => {
        if (!menu) return
        const onPointerDown = (event: PointerEvent) => {
            if (event.target instanceof Node && menuButton.current?.contains(event.target)) return
            const shown = openMenu.current
            window.setTimeout(() => { if (shown && openMenu.current === shown) signal.emit('avatarMenuDismiss') })
        }
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') signal.emit('avatarMenuDismiss') }
        // Capture: note the menu before the office reacts to the same click.
        window.addEventListener('pointerdown', onPointerDown, true)
        window.addEventListener('keydown', onKey)
        return () => {
            window.removeEventListener('pointerdown', onPointerDown, true)
            window.removeEventListener('keydown', onKey)
        }
    }, [menu])

    // Keep the banner clear of the call strip, the hints and anything else marked at the top.
    useLayoutEffect(() => {
        if (!following) { setPlace(null); return }
        const measure = () => {
            const element = banner.current
            if (!element) return
            const obstacles = [...document.querySelectorAll<HTMLElement>('[data-follow-avoid]')]
                .map(item => item.getBoundingClientRect())
                .filter(rect => rect.width > 0 && rect.height > 0)
            const next = placeFollowBanner(window.innerWidth, { width: element.offsetWidth, height: element.offsetHeight }, obstacles)
            setPlace(current => current && current.left === next.left && current.top === next.top ? current : next)
        }
        measure()
        const timer = window.setInterval(measure, 500)
        window.addEventListener('resize', measure)
        return () => {
            window.clearInterval(timer)
            window.removeEventListener('resize', measure)
        }
    }, [following])

    return <>
        {menu && <button
            ref={menuButton}
            type='button'
            onClick={() => { signal.emit('followStart', { uid: menu.uid }); setMenu(null) }}
            style={{ left: menu.screenX + 6, top: menu.screenY }}
            className='fixed z-30 -translate-y-1/2 whitespace-nowrap rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white shadow-xl ring-1 ring-white/10 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300'
        >Seguir {menu.name}</button>}
        {following && <div
            ref={banner}
            role='status'
            style={place ? { left: place.left, top: place.top } : { left: '50%', top: 12, visibility: 'hidden' }}
            className='fixed z-20 flex max-w-[calc(100vw-24px)] items-center gap-3 rounded-xl bg-slate-950 py-2 pl-3 pr-2 text-xs text-white shadow-xl'
        >
            <span className='truncate font-semibold'>Seguindo {following}</span>
            <button type='button' onClick={() => signal.emit('followStop')} className='shrink-0 rounded bg-slate-700 px-2 py-1 hover:bg-slate-600'>Parar</button>
        </div>}
    </>
}
