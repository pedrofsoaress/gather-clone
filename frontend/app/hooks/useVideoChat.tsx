import React, { createContext, useContext, ReactNode, useEffect, useState, useMemo, useRef } from 'react'
import AgoraRTC, { 
    AgoraRTCProvider, 
} from 'agora-rtc-react'
import { IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng'
import signal from '../../utils/signal'
import { videoChat } from '../../utils/video-chat/video-chat'
import { mediaErrorMessage } from '../../utils/video-chat/AudioPreference'

interface VideoChatContextType {
    toggleCamera: () => void
    toggleMicrophone: () => void
    isCameraMuted: boolean
    isMicMuted: boolean
    isCameraBusy: boolean
    isMicBusy: boolean
    isScreenSharing: boolean
    toggleScreenShare: () => Promise<void>
}

const VideoChatContext = createContext<VideoChatContextType | undefined>(undefined)

interface AgoraVideoChatProviderProps {
    children: ReactNode
    uid: string
}

interface VideoChatProviderProps {
  children: ReactNode
}

export const AgoraVideoChatProvider: React.FC<AgoraVideoChatProviderProps> = ({ children }) => {
    const client = useMemo(() => {
        const newClient = AgoraRTC.createClient({ codec: "vp8", mode: "rtc" })
        AgoraRTC.setLogLevel(4)
        return newClient
    }, [])

    return (
        <AgoraRTCProvider client={client}>
            <VideoChatProvider>
                {children}
            </VideoChatProvider>
        </AgoraRTCProvider>
    )
}

const VideoChatProvider: React.FC<VideoChatProviderProps> = ({ children }) => {
    const [isCameraMuted, setIsCameraMuted] = useState(true)
    const [isMicMuted, setIsMicMuted] = useState(true)
    const [isScreenSharing, setIsScreenSharing] = useState(false)
    const [isCameraBusy, setIsCameraBusy] = useState(false)
    const [isMicBusy, setIsMicBusy] = useState(false)
    const pendingCamera = useRef(false)
    const pendingMicrophone = useRef(false)

    useEffect(() => {
        const onChange = (sharing: boolean) => setIsScreenSharing(sharing)
        const onCamera = (muted: boolean) => setIsCameraMuted(muted)
        const onMicrophone = (muted: boolean) => setIsMicMuted(muted)
        signal.on('screen-share-changed', onChange)
        signal.on('local-camera-changed', onCamera)
        signal.on('local-microphone-changed', onMicrophone)
        return () => {
            signal.off('screen-share-changed', onChange)
            signal.off('local-camera-changed', onCamera)
            signal.off('local-microphone-changed', onMicrophone)
        }
    }, [])

    useEffect(() => {
        const stopMonitoring = videoChat.startDeviceMonitoring()
        return () => {
            stopMonitoring()
            videoChat.destroy()
        }
    }, [])

    const toggleCamera = async () => {
        if (pendingCamera.current) return
        pendingCamera.current = true
        setIsCameraBusy(true)
        try { setIsCameraMuted(await videoChat.toggleCamera()) }
        catch (error) { signal.emit('officeFeedback', { message: mediaErrorMessage(error, 'câmera') }) }
        finally { pendingCamera.current = false; setIsCameraBusy(false) }
    }

    const toggleMicrophone = async () => {
        if (pendingMicrophone.current) return
        pendingMicrophone.current = true
        setIsMicBusy(true)
        try { setIsMicMuted(await videoChat.toggleMicrophone()) }
        catch (error) { signal.emit('officeFeedback', { message: mediaErrorMessage(error, 'microfone') }) }
        finally { pendingMicrophone.current = false; setIsMicBusy(false) }
    }

    const toggleScreenShare = async () => {
        if (isScreenSharing) await videoChat.stopScreenShare()
        else await videoChat.startScreenShare()
    }

    const value: VideoChatContextType = {
        toggleCamera,
        toggleMicrophone,
        isCameraMuted,
        isMicMuted,
        isCameraBusy,
        isMicBusy,
        isScreenSharing,
        toggleScreenShare,
    }

    return (
        <VideoChatContext.Provider value={value}>
            {children}
        </VideoChatContext.Provider>
    )
}

export const useVideoChat = () => {
  const context = useContext(VideoChatContext)
  if (context === undefined) {
    throw new Error('useVideoChat must be used within a VideoChatProvider')
  }
  return context
}
