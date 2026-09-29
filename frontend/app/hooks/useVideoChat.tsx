import React, { createContext, useContext, ReactNode, useEffect, useState, useMemo, useRef } from 'react'
import AgoraRTC, { 
    AgoraRTCProvider, 
} from 'agora-rtc-react'
import { IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng'
import signal from '../../utils/signal'
import { videoChat } from '../../utils/video-chat/video-chat'

interface VideoChatContextType {
    toggleCamera: () => void
    toggleMicrophone: () => void
    isCameraMuted: boolean
    isMicMuted: boolean
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

    useEffect(() => {
        const onChange = (sharing: boolean) => setIsScreenSharing(sharing)
        signal.on('screen-share-changed', onChange)
        return () => { signal.off('screen-share-changed', onChange) }
    }, [])

    useEffect(() => {
        return () => {
            videoChat.destroy()
        }
    }, [])

    const toggleCamera = async () => {
        const muted = await videoChat.toggleCamera()
        setIsCameraMuted(muted)
    }

    const toggleMicrophone = async () => {
        const muted = await videoChat.toggleMicrophone()
        setIsMicMuted(muted)
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
