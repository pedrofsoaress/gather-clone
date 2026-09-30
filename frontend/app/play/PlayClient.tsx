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
    const [presentations, setPresentations] = useState<PresentationSnapshot>({})
    const [selectedPresentationId, setSelectedPresentationId] = useState<string | null>(null)
    const knownPresentations = useRef<string[]>([])

    useEffect(() => {
        const onSnapshot = (snapshot: PresentationSnapshot) => {
            const ids = Object.keys(snapshot)
            const started = ids.find(id => !knownPresentations.current.includes(id))
            knownPresentations.current = ids
            setPresentations(snapshot)
            setSelectedPresentationId(current => current && snapshot[current] ? current : started ?? null)
        }
        const onReady = () => {
            server.socket.on('presentationState', onSnapshot)
            server.socket.timeout(8000).emit('presentationGetSnapshot', (timeout: Error | null, result: { ok: boolean, snapshot?: PresentationSnapshot }) => {
                if (!timeout && result?.ok && result.snapshot) onSnapshot(result.snapshot)
            })
        }
        signal.on('officeReady', onReady)
        signal.on('video-channel-left', onCallLeft)
        return () => {
            signal.off('officeReady', onReady)
            signal.off('video-channel-left', onCallLeft)
            server.socket?.off?.('presentationState', onSnapshot)
        }
        function onCallLeft() { setMeetingMode(false) }
    }, [])

    useEffect(() => {
        const savedName = window.localStorage.getItem(`matte-office-name:${uid}`)?.trim()
        if (savedName && savedName.length <= 32) setDisplayName(savedName)
    }, [uid])

    const [skin, setSkin] = useState(initialSkin)
    const presentationObject = mapData.rooms[mapData.spawnpoint.roomIndex].interactions?.find(object => object.id === selectedPresentationId)
    const presentationSession = selectedPresentationId ? presentations[selectedPresentationId] : undefined
    const presentation = presentationObject && presentationSession ? <PresentationViewer
        object={presentationObject} session={presentationSession} uid={uid} compact={!meetingMode}
        onExpand={() => setMeetingMode(true)} onClose={() => setSelectedPresentationId(null)} /> : undefined

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
                <OfficeHud objects={mapData.rooms[mapData.spawnpoint.roomIndex].interactions ?? []} uid={uid} presentations={presentations} onPresentationFocus={setSelectedPresentationId} />
                <OfficeChat uid={uid} meetingMode={meetingMode} open={chatOpen} onOpenChange={setChatOpen} />
            </div>}
            {showIntroScreen && <IntroScreen realmName={name} skin={skin} username={displayName} onJoin={(chosenName) => {
                window.localStorage.setItem(`matte-office-name:${uid}`, chosenName)
                setDisplayName(chosenName)
                setShowIntroScreen(false)
            }}/>}
        </AgoraVideoChatProvider>
    )
}
export default PlayClient
