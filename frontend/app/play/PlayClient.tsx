'use client'
import React, { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { RealmData } from '@/utils/pixi/types'
import PlayNavbar from './PlayNavbar'
import { useModal } from '../hooks/useModal'
import signal from '@/utils/signal'
import IntroScreen from './IntroScreen'
import VideoBar from '@/components/VideoChat/VideoBar'
import { AgoraVideoChatProvider } from '../hooks/useVideoChat'
import OfficeHud from './OfficeHud'
import OfficeChat from './OfficeChat'
import PresentationViewer from './PresentationViewer'
import type { PresentationSnapshot } from '@/utils/pixi/office/types'
import { server } from '@/utils/backend/server'
import SpeakerRuntime from './SpeakerRuntime'
import OfficeNotifications from './OfficeNotifications'
import { createClient } from '@/utils/supabase/client'
import { skins } from '@/utils/pixi/Player/skins'

const PixiApp = dynamic(() => import('./PixiApp'), { ssr: false })

type PlayClientProps = {
    mapData: RealmData
    username: string
    access_token: string
    realmId: string
    uid: string
    shareId: string
    initialSkin: string
    name: string
}

const PlayClient:React.FC<PlayClientProps> = ({ mapData, username, access_token, realmId, uid, shareId, initialSkin, name }) => {

    const { setErrorModal, setDisconnectedMessage } = useModal()

    const [showIntroScreen, setShowIntroScreen] = useState(true)
    const [displayName, setDisplayName] = useState(username)
    const [meetingMode, setMeetingMode] = useState(false)
    const [chatOpen, setChatOpen] = useState(false)
    const [roomIndex, setRoomIndex] = useState(mapData.spawnpoint.roomIndex)
    const [presentations, setPresentations] = useState<PresentationSnapshot>({})
    const [selectedPresentationId, setSelectedPresentationId] = useState<string | null>(null)
    const knownPresentations = useRef<string[]>([])

    useEffect(() => {
        const onSnapshot = (snapshot: PresentationSnapshot) => {
            const ids = Object.keys(snapshot)
            const started = ids.find(id => !knownPresentations.current.includes(id))
            const ended = knownPresentations.current.some(id => !ids.includes(id))
            knownPresentations.current = ids
            setPresentations(snapshot)
            if (started) signal.emit('officeNotice', { message: 'Uma apresentação começou no escritório.', key: `presentation-${started}` })
            if (ended) signal.emit('officeNotice', { message: 'A apresentação foi encerrada.', key: 'presentation-ended' })
            setSelectedPresentationId(current => current && snapshot[current] ? current : started ?? null)
        }
        const refresh = () => server.socket.timeout(8000).emit('presentationGetSnapshot', (timeout: Error | null, result: { ok: boolean, snapshot?: PresentationSnapshot }) => {
            if (!timeout && result?.ok && result.snapshot) onSnapshot(result.snapshot)
        })
        const onReady = () => {
            server.socket.on('presentationState', onSnapshot)
            server.socket.on('joinedRealm', refresh)
            refresh()
        }
        const onRoom = ({ roomIndex }: { roomIndex: number }) => {
            setRoomIndex(roomIndex)
            setSelectedPresentationId(null)
            setPresentations({})
            knownPresentations.current = []
        }
        signal.on('officeReady', onReady)
        signal.on('officeRoomChanged', onRoom)
        signal.on('officeRoomReady', refresh)
        signal.on('video-channel-left', onCallLeft)
        return () => {
            signal.off('officeReady', onReady)
            signal.off('officeRoomChanged', onRoom)
            signal.off('officeRoomReady', refresh)
            signal.off('video-channel-left', onCallLeft)
            server.socket?.off?.('presentationState', onSnapshot)
            server.socket?.off?.('joinedRealm', refresh)
        }
        function onCallLeft() { setMeetingMode(false) }
    }, [])

    useEffect(() => {
        try {
            const savedName = window.localStorage.getItem(`matte-office-name:${uid}`)?.trim()
            if (savedName && savedName.length <= 32) setDisplayName(savedName)
        } catch { /* The profile name remains available when storage is disabled. */ }
    }, [uid])

    const [skin, setSkin] = useState(initialSkin)
    const presentationObject = mapData.rooms[roomIndex].interactions?.find(object => object.id === selectedPresentationId)
    const presentationSession = selectedPresentationId ? presentations[selectedPresentationId] : undefined
    const presentation = presentationObject && presentationSession ? <PresentationViewer
        object={presentationObject} session={presentationSession} uid={uid} compact={!meetingMode}
        onExpand={() => setMeetingMode(true)} onClose={() => setSelectedPresentationId(null)} /> : undefined

    useEffect(() => {
        signal.emit('officePresentationFocus', { active: Boolean(presentationSession) })
        return () => signal.emit('officePresentationFocus', { active: false })
    }, [Boolean(presentationSession)])

    useEffect(() => {
        const onShowKickedModal = (message: string) => {
            setErrorModal('Disconnected')
            setDisconnectedMessage(message)
        }

        const onShowDisconnectModal = () => {
            setErrorModal('Disconnected')
            setDisconnectedMessage('You have been disconnected from the server.')
        }

        const onSwitchSkin = (skin: string) => {
            setSkin(skin)
        }

        signal.on('showKickedModal', onShowKickedModal)
        signal.on('showDisconnectModal', onShowDisconnectModal)
        signal.on('switchSkin', onSwitchSkin)

        return () => {
            signal.off('showKickedModal', onShowKickedModal)
            signal.off('showDisconnectModal', onShowDisconnectModal)
            signal.off('switchSkin', onSwitchSkin)
        }
    }, [])

    return (
        <AgoraVideoChatProvider uid={uid}>
            {!showIntroScreen && <div className='relative w-full h-screen flex flex-col-reverse sm:flex-col'>
                <VideoBar meetingMode={meetingMode} onMeetingModeChange={setMeetingMode} chatOpen={chatOpen} localUid={uid} localName={displayName} localSkin={skin} presentation={presentation} />
                <PixiApp
                    mapData={mapData}
                    className='w-full grow sm:h-full sm:flex-grow-0'
                    username={displayName}
                    access_token={access_token}
                    realmId={realmId}
                    uid={uid}
                    shareId={shareId}
                    initialSkin={skin}
                />
                <PlayNavbar username={displayName} skin={skin}/>
                <SpeakerRuntime uid={uid} />
                <OfficeNotifications meetingMode={meetingMode} />
                <OfficeHud key={roomIndex} objects={mapData.rooms[roomIndex].interactions ?? []} uid={uid} presentations={presentations} onPresentationFocus={setSelectedPresentationId} />
                <OfficeChat uid={uid} meetingMode={meetingMode} open={chatOpen} onOpenChange={setChatOpen} />
            </div>}
            {showIntroScreen && <IntroScreen realmName={name} skin={skin} username={displayName} onJoin={async (chosenName, chosenSkin) => {
                if (!skins.includes(chosenSkin)) throw new Error('Invalid avatar')
                // The server reads the profile when joining. Save first so everyone sees the chosen avatar.
                const { data, error } = await createClient().from('profiles')
                    .update({ skin: chosenSkin }).eq('id', uid).select('skin').single()
                if (error || data?.skin !== chosenSkin) throw new Error('Avatar was not saved')
                try { window.localStorage.setItem(`matte-office-name:${uid}`, chosenName) } catch { /* Joining works with storage disabled. */ }
                setSkin(chosenSkin)
                setDisplayName(chosenName)
                setShowIntroScreen(false)
            }}/>}
        </AgoraVideoChatProvider>
    )
}
export default PlayClient
