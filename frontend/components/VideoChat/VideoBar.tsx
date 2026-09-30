import React, { useEffect, useRef, useState } from 'react'
import { IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng'
import signal from '@/utils/signal'
import { ArrowsOut, ArrowsIn, MicrophoneSlash, MapTrifold, SquaresFour } from '@phosphor-icons/react'
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
    localName: string
    localSkin: string
}

const VideoBar: React.FC<VideoBarProps> = ({ meetingMode, onMeetingModeChange, localName, localSkin }) => {
    const [remoteUsers, setRemoteUsers] = useState<Record<string, RemoteUser>>({})
    const hadPeers = useRef(false)
    const peers = Object.values(remoteUsers)

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

    useEffect(() => {
        if (peers.length > 0 && !hadPeers.current) onMeetingModeChange(true)
        if (peers.length === 0) onMeetingModeChange(false)
        hadPeers.current = peers.length > 0
    }, [peers.length, onMeetingModeChange])

    if (peers.length === 0) return null

    return <div className={meetingMode ? 'absolute inset-x-0 bottom-14 top-0 z-30 bg-[#181c2d] text-white' : 'pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col items-center pt-2 text-white'}>
        <button type="button" onClick={() => onMeetingModeChange(!meetingMode)} className={meetingMode ? 'absolute right-3 top-3 z-40 flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm shadow-lg hover:bg-slate-700 sm:right-[352px]' : 'pointer-events-auto mb-2 flex items-center gap-2 rounded-lg bg-slate-900/90 px-3 py-2 text-sm shadow-lg hover:bg-slate-700'} aria-label={meetingMode ? 'Visualização de mapa' : 'Visualização de reunião'}>
            {meetingMode ? <MapTrifold size={18} /> : <SquaresFour size={18} />}
            {meetingMode ? 'Visualização de mapa' : 'Visualização de reunião'}
        </button>
        {meetingMode && <header className="flex h-14 items-center border-b border-slate-700 px-5 pr-48 text-sm font-semibold sm:pr-[360px]">Conversa por proximidade · {peers.length + 1} pessoas</header>}
        <section id="video-container" className={meetingMode ? 'grid h-[calc(100%-3.5rem)] w-full grid-cols-1 content-center gap-2 overflow-y-auto p-3 sm:w-[calc(100%-340px)] md:grid-cols-2' : 'pointer-events-auto flex max-w-full flex-row items-center gap-3 overflow-x-auto px-3'}>
            {meetingMode && <LocalUser name={localName} skin={localSkin} />}
            {peers.map(user => <RemoteUser key={user.uid} user={user} meetingMode={meetingMode} />)}
        </section>
    </div>
}

export default VideoBar

function LocalUser({ name, skin }: { name: string, skin: string }) {
    const { isCameraMuted, isMicMuted } = useVideoChat()

    useEffect(() => {
        if (!isCameraMuted) videoChat.playVideoTrackAtElementId('local-meeting-video')
        return () => { if (!isCameraMuted) videoChat.playVideoTrackAtElementId('local-video') }
    }, [isCameraMuted])

    return <div className="relative aspect-video min-h-[180px] overflow-hidden rounded-xl bg-[#252b42]">
        <div className="absolute inset-0 grid place-items-center"><div className="grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-slate-700"><AnimatedCharacter src={`/sprites/characters/Character_${skin}.png`} noAnimation className="h-16 w-16" /></div></div>
        <div id="local-meeting-video" className={isCameraMuted ? 'hidden' : 'absolute inset-0'} />
        <p className="absolute bottom-2 left-2 z-10 flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-xs">{isMicMuted && <MicrophoneSlash size={13} className="text-red-400" />}{name} (você)</p>
    </div>
}

function RemoteUser({ user, meetingMode }: { user: RemoteUser, meetingMode: boolean }) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [skin, setSkin] = useState('')
    const [name, setName] = useState('Visitante')
    const [expanded, setExpanded] = useState(false)

    useEffect(() => {
        const onVideoSkin = (data: { skin: string, uid: string, name?: string }) => {
            if (data.uid === user.user.uid.toString().slice(0, 36)) {
                setSkin(data.skin)
                if (data.name) setName(data.name)
            }
        }
        signal.on('video-skin', onVideoSkin)
        signal.emit('getSkinForUid', user.user.uid.toString().slice(0, 36))
        return () => signal.off('video-skin', onVideoSkin)
    }, [user.user.uid])

    useEffect(() => {
        if (user.cameraEnabled) user.user.videoTrack?.play(`remote-user-${user.uid}`)
        else containerRef.current?.replaceChildren()
    }, [user, meetingMode])

    return <div className={`${expanded ? 'fixed left-1/2 top-1/2 z-50 h-[min(70vh,700px)] w-[min(90vw,1200px)] -translate-x-1/2 -translate-y-1/2 shadow-2xl' : meetingMode ? 'relative aspect-video min-h-[180px] w-full' : 'relative h-[130px] w-[233px] shrink-0'} overflow-hidden rounded-xl bg-[#252b42]`}>
        <div className="absolute inset-0 grid place-items-center"><div className="grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-slate-700">{skin && <AnimatedCharacter src={`/sprites/characters/Character_${skin}.png`} noAnimation className="h-16 w-16" />}</div></div>
        <div ref={containerRef} id={`remote-user-${user.uid}`} className="absolute inset-0" />
        <p className="absolute bottom-2 left-2 z-10 flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-xs">{!user.micEnabled && <MicrophoneSlash size={13} className="text-red-400" />}{name}</p>
        {user.cameraEnabled && <button type="button" aria-label={expanded ? 'Reduzir vídeo' : 'Ampliar vídeo ou tela compartilhada'} onClick={() => setExpanded(value => !value)} className="absolute right-2 top-2 z-10 rounded-lg bg-black/70 p-2 text-white hover:bg-black">{expanded ? <ArrowsIn size={18} /> : <ArrowsOut size={18} />}</button>}
    </div>
}
