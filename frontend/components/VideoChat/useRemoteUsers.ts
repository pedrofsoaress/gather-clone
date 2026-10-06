import { useEffect, useState } from 'react'
import { IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng'
import signal from '@/utils/signal'

export interface RemoteUser {
    uid: string
    micEnabled: boolean
    cameraEnabled: boolean
    user: IAgoraRTCRemoteUser
}

// People currently in the Agora conversation, shared by the meeting view and the floating window.
export function useRemoteUsers() {
    const [remoteUsers, setRemoteUsers] = useState<Record<string, RemoteUser>>({})

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

    return remoteUsers
}

// Name and avatar of the office visitor behind an Agora uid.
export function usePeerProfile(agoraUid: string, enabled = true) {
    const [profile, setProfile] = useState({ name: 'Visitante', skin: '' })

    useEffect(() => {
        if (!enabled) return
        const uid = agoraUid.slice(0, 36)
        const onVideoSkin = (data: { skin: string, uid: string, name?: string }) => {
            if (data.uid === uid) setProfile(previous => ({ skin: data.skin, name: data.name || previous.name }))
        }
        signal.on('video-skin', onVideoSkin)
        signal.emit('getSkinForUid', uid)
        return () => signal.off('video-skin', onVideoSkin)
    }, [agoraUid, enabled])

    return profile
}

// Whether the floating call window currently shows the conversation's video.
// Kept outside React so tiles that mount while it is open start with the right value.
let floatingOpen = false

export function setFloatingOpen(open: boolean) {
    floatingOpen = open
    signal.emit('floating-call-changed', open)
}

export function useFloatingOpen() {
    const [open, setOpen] = useState(floatingOpen)
    useEffect(() => {
        signal.on('floating-call-changed', setOpen)
        return () => signal.off('floating-call-changed', setOpen)
    }, [])
    return open
}
