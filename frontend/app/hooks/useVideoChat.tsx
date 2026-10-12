import React, { createContext, useContext, ReactNode, useEffect, useState, useMemo, useRef } from 'react'
import AgoraRTC, { 
    AgoraRTCProvider, 
} from 'agora-rtc-react'
import { IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng'
import signal from '../../utils/signal'
import { videoChat } from '../../utils/video-chat/video-chat'
import { canUnmute } from '../../utils/video-chat/meeting'
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
    const forceMicRef = useRef(false)
    const forceCameraRef = useRef(false)

    // Idempotent: only mutes when the track is live, and says so only when it changed something.
    const forceMicOff = async (message: string) => {
        try {
            if (await videoChat.muteMicrophone()) {
                setIsMicMuted(true)
                signal.emit('officeFeedback', { message })
            }
        } catch {}
    }
    const forceCameraOff = async () => {
        try {
            if (await videoChat.turnOffCamera()) {
                setIsCameraMuted(true)
                signal.emit('officeFeedback', { message: 'O apresentador desligou sua câmera.' })
            }
        } catch {}
    }

    useEffect(() => {
        const onChange = (sharing: boolean) => setIsScreenSharing(sharing)
        const onCamera = (muted: boolean) => setIsCameraMuted(muted)
        const onMicrophone = (muted: boolean) => setIsMicMuted(muted)
        signal.on('screen-share-changed', onChange)
        signal.on('local-camera-changed', onCamera)
        signal.on('local-microphone-changed', onMicrophone)
        const lockNotice = 'O apresentador bloqueou os microfones. Clique em Pedir para falar.'
        const onForce = (force: { mic?: false, camera?: false }) => {
            if (force.mic === false) {
                if (pendingMicrophone.current) forceMicRef.current = true
                else void forceMicOff('O apresentador desligou seu microfone.')
            }
            if (force.camera === false) {
                if (pendingCamera.current) forceCameraRef.current = true
                else void forceCameraOff()
            }
        }
        const onMeetingState = () => {
            // A pending toggle re-checks canUnmute() when it settles.
            if (canUnmute() || pendingMicrophone.current) return
            void forceMicOff(lockNotice)
        }
        signal.on('meetingState', onMeetingState)
        signal.on('meetingForce', onForce)
        return () => {
            signal.off('meetingForce', onForce)
            signal.off('meetingState', onMeetingState)
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
        finally {
            pendingCamera.current = false
            setIsCameraBusy(false)
            if (forceCameraRef.current) { forceCameraRef.current = false; await forceCameraOff() }
        }
    }

    const toggleMicrophone = async () => {
        if (pendingMicrophone.current) return
        if (videoChat.isMicrophoneMuted() && !canUnmute()) {
            signal.emit('officeFeedback', { message: 'O apresentador bloqueou os microfones. Clique em Pedir para falar.' })
            return
        }
        pendingMicrophone.current = true
        setIsMicBusy(true)
        try { setIsMicMuted(await videoChat.toggleMicrophone()) }
        catch (error) { signal.emit('officeFeedback', { message: mediaErrorMessage(error, 'microfone') }) }
        finally {
            pendingMicrophone.current = false
            setIsMicBusy(false)
            // A force or lock that arrived mid-toggle, or an unmute that raced a lock, ends muted.
            if (forceMicRef.current) { forceMicRef.current = false; await forceMicOff('O apresentador desligou seu microfone.') }
            else if (!canUnmute()) await forceMicOff('O apresentador bloqueou os microfones. Clique em Pedir para falar.')
        }
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
