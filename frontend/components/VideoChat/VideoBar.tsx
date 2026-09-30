import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng'
import signal from '@/utils/signal'
import { ArrowsOut, ArrowsIn, MicrophoneSlash, MapTrifold, SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react'
import AnimatedCharacter from '@/app/play/SkinMenu/AnimatedCharacter'
import { useVideoChat } from '@/app/hooks/useVideoChat'
import { videoChat } from '@/utils/video-chat/video-chat'

interface RemoteUser {
    uid: string
    micEnabled: boolean
    cameraEnabled: boolean
    user: IAgoraRTCRemoteUser
}

type VideoBarProps = {
    meetingMode: boolean
    onMeetingModeChange: (value: boolean) => void
    chatOpen: boolean
    localUid: string
    localName: string
    localSkin: string
    presentation?: React.ReactNode
}

const VideoBar: React.FC<VideoBarProps> = ({ meetingMode, onMeetingModeChange, chatOpen, localUid, localName, localSkin, presentation }) => {
    const [remoteUsers, setRemoteUsers] = useState<Record<string, RemoteUser>>({})
    const peers = Object.values(remoteUsers)
    const screens = peers.filter(user => user.uid.endsWith('-screen'))
    const cameras = peers.filter(user => !user.uid.endsWith('-screen'))
    const personCount = cameras.length + 1

    useEffect(() => {
        signal.emit('officeAudioBusy', peers.length > 0)
        return () => signal.emit('officeAudioBusy', false)
    }, [peers.length > 0])

    useEffect(() => {
        const onUserInfoUpdated = (user: IAgoraRTCRemoteUser) => {
            setRemoteUsers(previous => ({ ...previous, [user.uid]: {
                uid: user.uid.toString(), micEnabled: user.hasAudio,
                cameraEnabled: user.hasVideo, user,
            } }))
        }
        const onResetUsers = () => setRemoteUsers({})
        const onUserLeft = (user: IAgoraRTCRemoteUser) => {
            setRemoteUsers(previous => {
                const next = { ...previous }
                delete next[user.uid]
                return next
            })
        }
        signal.on('user-info-updated', onUserInfoUpdated)
        signal.on('reset-users', onResetUsers)
        signal.on('user-left', onUserLeft)
        return () => {
            signal.off('user-info-updated', onUserInfoUpdated)
            signal.off('reset-users', onResetUsers)
            signal.off('user-left', onUserLeft)
        }
    }, [])

    if (peers.length === 0 && !presentation) return null

    if (!meetingMode) return <div className="pointer-events-none absolute right-3 top-3 z-30 flex max-w-[calc(100vw-24px)] flex-col items-end gap-2 text-white">
        <button type="button" onClick={() => onMeetingModeChange(true)} className="pointer-events-auto flex items-center gap-2 rounded-lg bg-slate-900/95 px-3 py-2 text-sm shadow-lg hover:bg-slate-700" aria-label="Expandir reunião">
            <ArrowsOut size={18} /> Expandir reunião · {personCount}
        </button>
        <div className="pointer-events-auto flex max-w-full gap-2 overflow-x-auto rounded-xl bg-slate-950/80 p-2 shadow-xl">
            {presentation && <div className="h-[112px] w-[220px] shrink-0">{presentation}</div>}
            {[...cameras, ...screens].map(user => <RemoteUser key={user.uid} user={user} meetingMode={false} localUid={localUid} localName={localName} localSkin={localSkin} className="relative h-[112px] w-[200px] shrink-0" />)}
        </div>
    </div>

    const tileProps = { meetingMode: true, localUid, localName, localSkin }
    return <div className="absolute inset-x-0 bottom-14 top-0 z-30 bg-[#181c2d] text-white">
        <button type="button" onClick={() => onMeetingModeChange(false)} className={`absolute top-3 z-40 flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm shadow-lg hover:bg-slate-700 ${chatOpen ? 'right-3 sm:right-[352px]' : 'right-3'}`} aria-label="Visualização de mapa">
            <MapTrifold size={18} />
            Visualização de mapa
        </button>
        <header className="flex h-14 items-center border-b border-slate-700 px-5 pr-48 text-sm font-semibold">Conversa por proximidade · {personCount} {personCount === 1 ? 'pessoa' : 'pessoas'}</header>
        <section id="video-container" className={`h-[calc(100%-3.5rem)] min-h-0 overflow-y-auto p-3 ${chatOpen ? 'w-full sm:w-[calc(100%-340px)]' : 'w-full'}`}>
            {screens.length > 0 || presentation ? <div className="grid h-full min-h-[420px] grid-cols-1 grid-rows-[minmax(0,1fr)_auto] gap-3 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(220px,25%)] lg:grid-rows-1">
                {screens.length > 0 ? <RemoteUser key={screens[0].uid} user={screens[0]} {...tileProps} className="relative aspect-video min-h-0 w-full lg:aspect-auto lg:h-full" /> : <div className="min-h-0">{presentation}</div>}
                <div className="flex min-h-0 gap-2 overflow-x-auto lg:flex-col lg:overflow-y-auto">
                    <LocalUser name={localName} skin={localSkin} className="relative aspect-video min-w-[160px] flex-1 lg:aspect-auto lg:min-h-[150px] lg:w-full" />
                    {cameras.map(user => <RemoteUser key={user.uid} user={user} {...tileProps} className="relative aspect-video min-w-[160px] flex-1 lg:aspect-auto lg:min-h-[150px] lg:w-full" />)}
                    {screens.length > 0 && presentation && <div className="aspect-video min-w-[160px] flex-1 lg:aspect-auto lg:min-h-[150px] lg:w-full">{presentation}</div>}
                    {screens.slice(1).map(user => <RemoteUser key={user.uid} user={user} {...tileProps} className="relative aspect-video min-w-[160px] flex-1 lg:aspect-auto lg:min-h-[150px] lg:w-full" />)}
                </div>
            </div> : <div className="grid auto-rows-min grid-cols-1 gap-3 md:grid-cols-2">
                <LocalUser name={localName} skin={localSkin} className="relative aspect-video min-h-[180px]" />
                {cameras.map(user => <RemoteUser key={user.uid} user={user} {...tileProps} className="relative aspect-video min-h-[180px] w-full" />)}
            </div>}
        </section>
    </div>
}

export default VideoBar

function LocalUser({ name, skin, className }: { name: string, skin: string, className: string }) {
    const { isCameraMuted, isMicMuted } = useVideoChat()

    useEffect(() => {
        if (!isCameraMuted) videoChat.playVideoTrackAtElementId('local-meeting-video')
        return () => { if (!isCameraMuted) videoChat.playVideoTrackAtElementId('local-video') }
    }, [isCameraMuted])

    return <div className={`${className} overflow-hidden rounded-xl bg-[#252b42]`}>
        <div className="absolute inset-0 grid place-items-center"><div className="grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-slate-700"><AnimatedCharacter src={`/sprites/characters/Character_${skin}.png`} noAnimation className="h-16 w-16" /></div></div>
        <div id="local-meeting-video" className={isCameraMuted ? 'hidden' : 'absolute inset-0'} />
        <p className="absolute bottom-2 left-2 z-10 flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-xs">{isMicMuted && <MicrophoneSlash size={13} className="text-red-400" />}{name} (você)</p>
    </div>
}

function RemoteUser({ user, meetingMode, localUid, localName, localSkin, className }: { user: RemoteUser, meetingMode: boolean, localUid: string, localName: string, localSkin: string, className: string }) {
    const containerRef = useRef<HTMLDivElement>(null)
    const isScreen = user.uid.endsWith('-screen')
    const isLocalScreen = isScreen && user.uid === `${localUid}-screen`
    const [skin, setSkin] = useState(isLocalScreen ? localSkin : '')
    const [name, setName] = useState(isLocalScreen ? localName : 'Visitante')
    const [expanded, setExpanded] = useState(false)
    const [audioMenuOpen, setAudioMenuOpen] = useState(false)
    const [audioState, setAudioState] = useState(() => videoChat.getRemoteAudio(user.uid))
    const audioButton = useRef<HTMLButtonElement>(null)
    const audioMenu = useRef<HTMLDivElement>(null)
    const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })

    useEffect(() => {
        if (!audioMenuOpen) return
        const close = (event: PointerEvent) => { if (!audioMenu.current?.contains(event.target as Node) && !audioButton.current?.contains(event.target as Node)) setAudioMenuOpen(false) }
        const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setAudioMenuOpen(false); audioButton.current?.focus() } }
        const position = () => {
            const bounds = audioButton.current?.getBoundingClientRect()
            if (!bounds) return
            if (bounds.bottom < 0 || bounds.top > window.innerHeight || bounds.right < 0 || bounds.left > window.innerWidth) { setAudioMenuOpen(false); return }
            const height = audioMenu.current?.offsetHeight ?? 150
            setMenuPosition({ top: Math.max(8, Math.min(bounds.bottom + 6, window.innerHeight - height - 8)), left: Math.max(8, Math.min(bounds.right - 192, window.innerWidth - 200)) })
        }
        const focusFrame = requestAnimationFrame(() => { position(); audioMenu.current?.querySelector('button')?.focus() })
        window.addEventListener('pointerdown', close)
        window.addEventListener('keydown', escape)
        window.addEventListener('resize', position)
        window.addEventListener('scroll', position, true)
        return () => {
            cancelAnimationFrame(focusFrame)
            window.removeEventListener('pointerdown', close)
            window.removeEventListener('keydown', escape)
            window.removeEventListener('resize', position)
            window.removeEventListener('scroll', position, true)
        }
    }, [audioMenuOpen])

    useEffect(() => {
        if (isLocalScreen) {
            setSkin(localSkin)
            setName(localName)
            return
        }
        const onVideoSkin = (data: { skin: string, uid: string, name?: string }) => {
            if (data.uid === user.user.uid.toString().slice(0, 36)) {
                setSkin(data.skin)
                if (data.name) setName(data.name)
            }
        }
        signal.on('video-skin', onVideoSkin)
        signal.emit('getSkinForUid', user.user.uid.toString().slice(0, 36))
        return () => signal.off('video-skin', onVideoSkin)
    }, [user.user.uid, isLocalScreen, localName, localSkin])

    useEffect(() => {
        if (user.cameraEnabled) user.user.videoTrack?.play(`remote-user-${user.uid}`, { fit: isScreen ? 'contain' : 'cover' })
        else containerRef.current?.replaceChildren()
    }, [user, meetingMode, isScreen])

    useEffect(() => {
        if (isScreen) return
        const refresh = () => setAudioState(videoChat.getRemoteAudio(user.uid))
        const onPreference = (uid: string) => { if (uid === user.uid) refresh() }
        signal.on('remote-audio-preference-changed', onPreference)
        const timer = window.setInterval(refresh, 250)
        return () => { signal.off('remote-audio-preference-changed', onPreference); window.clearInterval(timer) }
    }, [isScreen, user.uid])

    return <div className={`${expanded ? 'fixed left-1/2 top-1/2 z-50 h-[min(70vh,700px)] w-[min(90vw,1200px)] -translate-x-1/2 -translate-y-1/2 shadow-2xl' : className} rounded-xl bg-[#252b42] ${audioState.speaking && !isScreen ? 'ring-2 ring-teal-400' : ''}`}>
        <div className="absolute inset-0 grid place-items-center"><div className="grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-slate-700">{skin && <AnimatedCharacter src={`/sprites/characters/Character_${skin}.png`} noAnimation className="h-16 w-16" />}</div></div>
        <div ref={containerRef} id={`remote-user-${user.uid}`} className="absolute inset-0 overflow-hidden rounded-xl" />
        <p className="absolute bottom-2 left-2 z-10 flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-xs">{isScreen ? `Tela de ${name}` : <>{!user.micEnabled && <MicrophoneSlash size={13} className="text-red-400" />}{name}</>}</p>
        {meetingMode && user.cameraEnabled && <button type="button" aria-label={expanded ? 'Reduzir vídeo' : 'Ampliar vídeo ou tela compartilhada'} onClick={() => setExpanded(value => !value)} className="absolute right-2 top-2 z-10 rounded-lg bg-black/70 p-2 text-white hover:bg-black">{expanded ? <ArrowsIn size={18} /> : <ArrowsOut size={18} />}</button>}
        {!isScreen && <div className={`absolute ${meetingMode && user.cameraEnabled ? 'right-12' : 'right-2'} top-2 z-20`}>
            <button ref={audioButton} type="button" aria-label={`Áudio de ${name}`} aria-expanded={audioMenuOpen} onClick={() => {
                const bounds = audioButton.current?.getBoundingClientRect()
                if (bounds) setMenuPosition({ top: Math.min(bounds.bottom + 6, window.innerHeight - 150), left: Math.max(8, Math.min(bounds.right - 192, window.innerWidth - 200)) })
                setAudioMenuOpen(value => !value)
            }} className="rounded-lg bg-black/70 p-2 text-white hover:bg-black">{audioState.muted ? <SpeakerSlash size={18} /> : <SpeakerHigh size={18} />}</button>
            {audioMenuOpen && createPortal(<div ref={audioMenu} role="group" aria-label={`Controles de áudio de ${name}`} style={menuPosition} className="fixed z-[70] w-48 space-y-2 rounded-lg border border-slate-600 bg-slate-900 p-3 text-xs text-white shadow-2xl" onMouseDown={event => event.stopPropagation()}>
                <button type="button" onClick={() => videoChat.setRemoteMuted(user.uid, !audioState.muted)} className="w-full rounded bg-slate-700 px-2 py-1 text-left">{audioState.muted ? 'Ativar áudio para mim' : 'Silenciar só para mim'}</button>
                <label className="block">Volume · {audioState.volume}%<input type="range" min="0" max="100" value={audioState.volume} onChange={event => videoChat.setRemoteVolume(user.uid, Number(event.target.value))} className="w-full" /></label>
            </div>, document.body)}
        </div>}
    </div>
}
