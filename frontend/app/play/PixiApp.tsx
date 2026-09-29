'use client'
import React from 'react'
import { PlayApp } from '@/utils/pixi/PlayApp'
import { useEffect } from 'react'
import { RealmData } from '@/utils/pixi/types'
import { useModal } from '../hooks/useModal'
import { server } from '@/utils/backend/server'
import signal from '@/utils/signal'

type PixiAppProps = {
    className?: string
    mapData: RealmData
    username: string
    access_token: string
    realmId: string
    uid: string
    shareId: string
    initialSkin: string
}

const PixiApp:React.FC<PixiAppProps> = ({ className, mapData, username, access_token, realmId, uid, shareId, initialSkin }) => {

    const { setModal, setLoadingText, setFailedConnectionMessage, setErrorModal } = useModal()

    useEffect(() => {
        let cancelled = false
        let app: PlayApp | null = null
        const mount = async () => {
            if (cancelled) return
            app = new PlayApp(uid, realmId, mapData, username, initialSkin)
            setModal('Loading')
            setLoadingText('Connecting to server... This can take a minute after inactivity.')
            const { success, errorMessage } = await server.connect(realmId, uid, shareId, access_token, username)
            if (cancelled) return
            if (!success) {
                setErrorModal('Failed To Connect')
                setFailedConnectionMessage(errorMessage)
                return
            }

            setLoadingText('Loading game...')
            await app.init()
            if (cancelled) return
            setModal('None')
            signal.emit('officeReady')
            const pixiApp = app.getApp()
            pixiApp.canvas.tabIndex = 0
            pixiApp.canvas.setAttribute('aria-label', 'Escritório virtual Matte')
            document.getElementById('app-container')!.replaceChildren(pixiApp.canvas)
        }

        // React's development remount cancels the first setup before it opens a socket.
        queueMicrotask(mount)
        
        return () => {
            cancelled = true
            app?.destroy()
            document.getElementById('app-container')?.replaceChildren()
        }
    }, [])

    return (
        <div id='app-container' className={`overflow-hidden ${className}`}>
            
        </div>
    )
}

export default PixiApp
