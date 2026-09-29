import React, { useEffect, useRef, useState } from 'react'
import { IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng'
import signal from '@/utils/signal'
import { ArrowsOut, ArrowsIn, MicrophoneSlash } from '@phosphor-icons/react'
import AnimatedCharacter from '@/app/play/SkinMenu/AnimatedCharacter'

interface RemoteUser {
    uid: string
    micEnabled: boolean
    cameraEnabled: boolean
    user: IAgoraRTCRemoteUser
}

const VideoBar:React.FC = () => {

    const [remoteUsers, setRemoteUsers] = useState<{ [uid: string]: RemoteUser }>({})

    useEffect(() => {
        const onUserInfoUpdated = (user: IAgoraRTCRemoteUser) => {
            setRemoteUsers(prev => ({ ...prev, [user.uid]: {
                uid: user.uid.toString(),
                micEnabled: user.hasAudio,
                cameraEnabled: user.hasVideo,
                user: user,
            } }))
        }
        const onResetUsers = () => {
            setRemoteUsers({})
        }
        const onUserLeft = (user: IAgoraRTCRemoteUser) => {
            setRemoteUsers(prev => {
                const newUsers = { ...prev }
                delete newUsers[user.uid]
                return newUsers
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

    }, [remoteUsers])

    return (
        <main className='absolute z-10 w-full flex flex-col items-center pt-2 top-0'>
            <section className='flex flex-row items-center gap-4' id='video-container'>
                {Object.values(remoteUsers).map(user => (
                    <RemoteUser key={user.uid} user={user} />
                ))}
            </section>
        </main>
    )
}

export default VideoBar

function RemoteUser({ user }: { user: RemoteUser }) {

    const containerRef = useRef<HTMLDivElement>(null)
    const [skin, setSkin] = useState<string>('')
    const [name, setName] = useState<string>('Visitante')
    const [expanded, setExpanded] = useState(false)

    useEffect(() => {
        const onVideoSkin = (data: { skin: string, uid: string, name?: string }) => {
            const slicedUid = user.user.uid.toString().slice(0, 36)
            if (data.uid === slicedUid) {
                setSkin(data.skin)
                if (data.name) setName(data.name)
            }
        }

        signal.on('video-skin', onVideoSkin)

        signal.emit('getSkinForUid', user.user.uid.toString().slice(0, 36))
        return () => {
            signal.off('video-skin', onVideoSkin)
        }
    }, [])

    useEffect(() => {
        if (user.cameraEnabled) {
            // if the container has a child, remove it
            if (containerRef.current?.firstChild) {
                containerRef.current.removeChild(containerRef.current.firstChild)
            }

            user.user.videoTrack?.play(`remote-user-${user.uid}`)
        }

    }, [user])

    return (
        <div className={`${expanded ? 'fixed left-1/2 top-1/2 z-50 h-[min(70vh,700px)] w-[min(90vw,1200px)] -translate-x-1/2 -translate-y-1/2 shadow-2xl' : 'relative h-[130px] w-[233px]'} overflow-hidden rounded-lg bg-[#0f0f1d] bg-opacity-90`}>
            <div className='absolute w-full h-full grid place-items-center'>
                <div className='w-[48px] h-[48px] bg-[#222222] rounded-full border-2 border-[#424A61] grid place-items-center overflow-hidden'>
                    {skin && <AnimatedCharacter src={`/sprites/characters/Character_${skin}.png`} noAnimation className='w-full h-full relative bottom-1'/>}
                </div>
            </div>
            <div ref={containerRef} id={`remote-user-${user.uid}`} className='w-full h-full'></div>
            <p className='absolute bottom-1 left-2 bg-black bg-opacity-70 rounded-full z-10 text-xs p-1 px-2 select-none flex flex-row items-center gap-1'>
                {!user.micEnabled && <MicrophoneSlash className='w-3 h-3 text-[#FF2F49]' />}
                {name}
            </p>
            {user.cameraEnabled && <button type="button" aria-label={expanded ? 'Reduzir vídeo' : 'Ampliar vídeo ou tela compartilhada'} onClick={() => setExpanded(value => !value)} className="absolute right-2 top-2 z-10 rounded-lg bg-black/70 p-2 text-white hover:bg-black">{expanded ? <ArrowsIn size={18}/> : <ArrowsOut size={18}/>}</button>}
        </div>
    )
}
