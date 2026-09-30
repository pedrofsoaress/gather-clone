'use client'
import { useEffect } from 'react'
import signal from '@/utils/signal'
import { server } from '@/utils/backend/server'
import { spatialAudio, type SpeakerSnapshot } from '@/utils/video-chat/SpatialAudio'

export default function SpeakerRuntime({ uid }: { uid: string }) {
    useEffect(() => {
        const onState = (snapshot: SpeakerSnapshot) => spatialAudio.update(snapshot, uid)
        const onDisconnect = () => spatialAudio.destroy()
        const onDevices = () => spatialAudio.refreshOutput()
        const refresh = () => server.socket.timeout(8000).emit('speakerGetSnapshot', (timeout: Error | null, result: { ok: boolean, snapshot?: SpeakerSnapshot }) => {
            if (!timeout && result?.snapshot) onState(result.snapshot)
        })
        const ready = () => {
            server.socket.on('speakerState', onState)
            server.socket.on('disconnect', onDisconnect)
            server.socket.on('joinedRealm', refresh)
            refresh()
        }
        signal.on('officeReady', ready)
        signal.on('media-preferences-changed', onDevices)
        return () => {
            signal.off('officeReady', ready)
            signal.off('media-preferences-changed', onDevices)
            server.socket.off?.('speakerState', onState)
            server.socket.off?.('disconnect', onDisconnect)
            server.socket.off?.('joinedRealm', refresh)
            spatialAudio.destroy()
        }
    }, [uid])
    return null
}
