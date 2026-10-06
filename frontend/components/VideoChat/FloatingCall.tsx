import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MicrophoneSlash, PictureInPicture } from '@phosphor-icons/react'
import signal from '@/utils/signal'
import AnimatedCharacter from '@/app/play/SkinMenu/AnimatedCharacter'
import { useVideoChat } from '@/app/hooks/useVideoChat'
import { videoChat } from '@/utils/video-chat/video-chat'
import { FLOATING_SIZE, copyStyles, floatingApi, isCompact, registerAutoOpen } from '@/utils/video-chat/floating-window'
import MicAndCameraButtons from './MicAndCameraButtons'
import { RemoteUser, setFloatingOpen, usePeerProfile, useRemoteUsers } from './useRemoteUsers'

type FloatingCallProps = {
    localName: string
    localSkin: string
}

// Google Meet style floating window: opens by itself when the person leaves the
// tab during a conversation, or from the bottom bar. Closing it never leaves the
// office or the call; it only moves the video back to the office tab.
const FloatingCall: React.FC<FloatingCallProps> = ({ localName, localSkin }) => {
    const api = useMemo(() => floatingApi(), [])
    const remoteUsers = useRemoteUsers()
    const people = Object.values(remoteUsers).filter(user => !user.uid.endsWith('-screen'))
    const inConversation = people.length > 0
    const [pipWindow, setPipWindow] = useState<Window | null>(null)
    const opening = useRef(false)
    const autoOpened = useRef(false)

    const open = useCallback(async (automatic: boolean) => {
        if (!api || api.window || opening.current) return
        opening.current = true
        try {
            const win = await api.requestWindow(FLOATING_SIZE)
            copyStyles(document, win.document)
            win.document.title = 'Escritório Matte'
            win.document.body.style.margin = '0'
            autoOpened.current = automatic
            win.addEventListener('pagehide', () => {
                setFloatingOpen(false)
                setPipWindow(null)
            }, { once: true })
            setFloatingOpen(true)
            setPipWindow(win)
        } catch {
            if (!automatic) signal.emit('officeFeedback', { message: 'Não foi possível abrir a janela flutuante neste navegador.' })
        } finally {
            opening.current = false
        }
    }, [api])

    useEffect(() => {
        if (!api || !inConversation) return
        return registerAutoOpen(() => { void open(true) })
    }, [api, inConversation, open])

    // A window that opened by itself goes away when the person comes back to the office tab.
    useEffect(() => {
        if (!pipWindow) return
        const onVisibility = () => { if (document.visibilityState === 'visible' && autoOpened.current) pipWindow.close() }
        document.addEventListener('visibilitychange', onVisibility)
        return () => document.removeEventListener('visibilitychange', onVisibility)
    }, [pipWindow])

    useEffect(() => () => {
        api?.window?.close()
        setFloatingOpen(false)
    }, [api])

    if (!api) return null

    return <>
        <button type="button" onClick={() => pipWindow ? pipWindow.close() : void open(false)} aria-pressed={Boolean(pipWindow)} aria-label={pipWindow ? 'Fechar janela flutuante' : 'Abrir janela flutuante da conversa'} title="Janela flutuante: acompanhe a conversa enquanto usa outros programas" className={`flex h-10 shrink-0 items-center gap-2 rounded-lg px-2 text-sm text-white outline-none hover:bg-light-secondary ${pipWindow ? 'bg-teal-700' : 'bg-secondary'}`}>
            <PictureInPicture size={24} /><span className="hidden lg:inline">Janela flutuante</span>
        </button>
        {pipWindow && createPortal(<FloatingPanel win={pipWindow} people={people} localName={localName} localSkin={localSkin} />, pipWindow.document.body)}
    </>
}

export default FloatingCall

function useCompact(win: Window) {
    const [compact, setCompact] = useState(() => isCompact(win.innerHeight))
    useEffect(() => {
        const onResize = () => setCompact(isCompact(win.innerHeight))
        win.addEventListener('resize', onResize)
        return () => win.removeEventListener('resize', onResize)
    }, [win])
    return compact
}

const STRIP_PEOPLE = 3

function FloatingPanel({ win, people, localName, localSkin }: { win: Window, people: RemoteUser[], localName: string, localSkin: string }) {
    const compact = useCompact(win)
    if (compact) return <FloatingStrip win={win} people={people} />
    const count = people.length + 1
    const columns = count > 1 ? 'grid-cols-2' : 'grid-cols-1'
    return <div className="flex h-screen flex-col gap-2 bg-[#181c2d] p-2 text-white">
        <header className="truncate px-1 text-xs font-semibold text-slate-300">
            {people.length > 0 ? `Conversa por proximidade · ${count} pessoas` : 'Ninguém por perto no escritório'}
        </header>
        <div className={`grid min-h-0 flex-1 auto-rows-fr gap-2 ${columns}`}>
            <FloatingSelf name={localName} skin={localSkin} />
            {people.map(user => <FloatingPerson key={user.uid} user={user} win={win} />)}
        </div>
        <footer className="flex justify-center"><MicAndCameraButtons /></footer>
    </div>
}

// Slim view: one bubble per person plus the microphone and camera buttons.
function FloatingStrip({ win, people }: { win: Window, people: RemoteUser[] }) {
    const hidden = people.length - STRIP_PEOPLE
    return <div className="flex h-screen items-center gap-2 bg-[#181c2d] px-2 text-white">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {people.length === 0 && <p className="truncate text-xs text-slate-300">Ninguém por perto</p>}
            {people.slice(0, STRIP_PEOPLE).map(user => <FloatingPerson key={user.uid} user={user} win={win} compact />)}
            {hidden > 0 && <span className="shrink-0 text-xs font-semibold text-slate-300" title={`Mais ${hidden} na conversa`}>+{hidden}</span>}
        </div>
        <MicAndCameraButtons />
    </div>
}

// Absolute URL: the floating document has no address of its own to resolve paths against.
function Avatar({ skin, compact = false }: { skin: string, compact?: boolean }) {
    return <div className="absolute inset-0 grid place-items-center">
        <div className={`grid place-items-center overflow-hidden rounded-full bg-slate-700 ${compact ? 'h-full w-full' : 'h-14 w-14'}`}>
            {skin && <AnimatedCharacter src={`${window.location.origin}/sprites/characters/Character_${skin}.png`} noAnimation className={compact ? '!h-9 !w-9' : 'h-12 w-12'} />}
        </div>
    </div>
}

function FloatingSelf({ name, skin }: { name: string, skin: string }) {
    const { isCameraMuted, isMicMuted } = useVideoChat()
    const video = useRef<HTMLDivElement>(null)

    useEffect(() => videoChat.showCameraIn(video.current!), [])

    return <div className="relative min-h-0 overflow-hidden rounded-xl bg-[#252b42]">
        <Avatar skin={skin} />
        <div ref={video} className={isCameraMuted ? 'hidden' : 'absolute inset-0'} />
        <p className="absolute bottom-1 left-1 z-10 flex max-w-[calc(100%-0.5rem)] items-center gap-1 truncate rounded-md bg-black/70 px-2 py-0.5 text-xs">{isMicMuted && <MicrophoneSlash size={12} className="shrink-0 text-red-400" />}{name} (você)</p>
    </div>
}

function FloatingPerson({ user, win, compact = false }: { user: RemoteUser, win: Window, compact?: boolean }) {
    const { name, skin } = usePeerProfile(user.user.uid.toString())
    const video = useRef<HTMLDivElement>(null)
    const [speaking, setSpeaking] = useState(false)

    useEffect(() => {
        if (user.cameraEnabled && video.current) user.user.videoTrack?.play(video.current, { fit: 'cover' })
        else video.current?.replaceChildren()
    }, [user, compact])

    // The floating window stays visible while the office tab is hidden, so its own timer keeps the speaking ring live.
    useEffect(() => {
        const timer = win.setInterval(() => setSpeaking(videoChat.getRemoteAudio(user.uid).speaking), 250)
        return () => win.clearInterval(timer)
    }, [win, user.uid])

    if (compact) return <div title={name} className={`relative h-12 w-12 shrink-0 rounded-full bg-[#252b42] ${speaking ? 'ring-2 ring-teal-400' : ''}`}>
        <Avatar skin={skin} compact />
        <div ref={video} className="absolute inset-0 overflow-hidden rounded-full" />
        {!user.micEnabled && <span className="absolute -bottom-0.5 -right-0.5 z-10 grid h-5 w-5 place-items-center rounded-full bg-[#181c2d]"><MicrophoneSlash size={12} className="text-red-400" /></span>}
    </div>

    return <div className={`relative min-h-0 overflow-hidden rounded-xl bg-[#252b42] ${speaking ? 'ring-2 ring-teal-400' : ''}`}>
        <Avatar skin={skin} />
        <div ref={video} className="absolute inset-0 overflow-hidden" />
        <p className="absolute bottom-1 left-1 z-10 flex max-w-[calc(100%-0.5rem)] items-center gap-1 truncate rounded-md bg-black/70 px-2 py-0.5 text-xs">{!user.micEnabled && <MicrophoneSlash size={12} className="shrink-0 text-red-400" />}{name}</p>
    </div>
}
