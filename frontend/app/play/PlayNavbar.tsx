import React from 'react'
import { TShirt, MonitorArrowUp } from '@phosphor-icons/react'
import { useModal } from '../hooks/useModal'
import signal from '@/utils/signal'
import { ArrowLeftEndOnRectangleIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import MicAndCameraButtons from '@/components/VideoChat/MicAndCameraButtons'
import { useVideoChat } from '../hooks/useVideoChat'
import AnimatedCharacter from './SkinMenu/AnimatedCharacter'
import { useEffect, useState } from 'react'
import { videoChat } from '@/utils/video-chat/video-chat'

type PlayNavbarProps = {
    username: string
    skin: string
}


const PlayNavbar:React.FC<PlayNavbarProps> = ({ username, skin }) => {

    const { setModal } = useModal()
    const { isCameraMuted, isScreenSharing, toggleScreenShare } = useVideoChat()
    const [screenError, setScreenError] = useState('')
    function onClickSkinButton() {
        setModal('Skin')
        signal.emit('requestSkin')
    }

    useEffect(() => {
        videoChat.playVideoTrackAtElementId('local-video')
    }, [])

    return (
        <div className='bg-primary w-full h-14 absolute bottom-0 flex flex-row items-center p-2 gap-4 select-none'>
            <Link href='/app' className='aspect-square grid place-items-center rounded-lg p-1 outline-none bg-secondary hover:bg-light-secondary animate-colors'>
                <ArrowLeftEndOnRectangleIcon className='h-8 w-8'/>
            </Link>
            <div className='h-full w-[200px] bg-secondary rounded-lg overflow-hidden flex flex-row'>
                <div className='w-[60px] h-full border-r-[1px] border-light-gray relative grid place-items-center'>
                    <AnimatedCharacter src={'/sprites/characters/Character_' + skin + '.png'} noAnimation className='w-8 h-8 absolute bottom-1' />
                        <div id='local-video' className={`w-full h-full absolute ${!isCameraMuted ? 'block' : 'hidden'}`}>

                        </div>
                </div>
                <div className='w-full flex flex-col p-1 pl-2'>
                    <p className='text-white text-xs'>{username}</p>
                    <p className='text-[#BDBDBD] text-xs'>Available</p>
                </div>
            </div>
            <MicAndCameraButtons />
            <button type="button" onClick={() => { setScreenError(''); void toggleScreenShare().catch(error => setScreenError(error instanceof Error ? error.message : 'Não foi possível compartilhar a tela.')) }} aria-label={isScreenSharing ? 'Parar compartilhamento de tela' : 'Compartilhar tela'} title={isScreenSharing ? 'Parar compartilhamento' : 'Compartilhar tela na chamada'} className={`flex h-10 items-center gap-2 rounded-lg px-2 text-sm text-white outline-none hover:bg-light-secondary ${isScreenSharing ? 'bg-teal-700' : 'bg-secondary'}`}><MonitorArrowUp size={24}/><span className="hidden md:inline">{isScreenSharing ? 'Parar tela' : 'Compartilhar tela'}</span></button>
            {screenError && <p role="status" className="absolute bottom-16 left-3 max-w-sm rounded-lg bg-slate-950 px-3 py-2 text-sm text-amber-200 shadow-lg">{screenError}</p>}
            <button className='aspect-square grid place-items-center rounded-lg p-1 outline-none bg-secondary hover:bg-light-secondary ml-auto animate-colors' onClick={onClickSkinButton}>
                <TShirt className='h-8 w-8'/>
            </button>
        </div>
    )
}

export default PlayNavbar
