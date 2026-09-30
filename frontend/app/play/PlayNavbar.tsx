import React from 'react'
import { TShirt, MonitorArrowUp, GearSix } from '@phosphor-icons/react'
import { useModal } from '../hooks/useModal'
import signal from '@/utils/signal'
import { ArrowLeftEndOnRectangleIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import MicAndCameraButtons from '@/components/VideoChat/MicAndCameraButtons'
import { useVideoChat } from '../hooks/useVideoChat'
import AnimatedCharacter from './SkinMenu/AnimatedCharacter'
import { useEffect, useState } from 'react'
import { videoChat } from '@/utils/video-chat/video-chat'
import DeviceSettings from '@/components/VideoChat/DeviceSettings'

type PlayNavbarProps = {
    username: string
    skin: string
}


const PlayNavbar:React.FC<PlayNavbarProps> = ({ username, skin }) => {

    const { setModal } = useModal()
    const { isCameraMuted, isScreenSharing, toggleScreenShare } = useVideoChat()
    const [deviceSettingsOpen, setDeviceSettingsOpen] = useState(false)
    function onClickSkinButton() {
        setModal('Skin')
        signal.emit('requestSkin')
    }

    useEffect(() => {
        videoChat.playVideoTrackAtElementId('local-video')
    }, [])

    return (
        <div className='bg-primary w-full h-14 absolute bottom-0 flex flex-row items-center p-1 gap-1 sm:p-2 sm:gap-3 select-none'>
            <Link href='/app' aria-label='Sair do escritório' title='Sair do escritório' className='h-10 w-10 shrink-0 aspect-square grid place-items-center rounded-lg p-1 outline-none bg-secondary hover:bg-light-secondary animate-colors'>
                <ArrowLeftEndOnRectangleIcon className='h-8 w-8'/>
            </Link>
            <div className='h-10 w-8 shrink-0 sm:w-[180px] bg-secondary rounded-lg overflow-hidden flex flex-row'>
                <div className='w-8 sm:w-[52px] shrink-0 h-full border-r-[1px] border-light-gray relative grid place-items-center'>
                    <AnimatedCharacter src={'/sprites/characters/Character_' + skin + '.png'} noAnimation className='w-8 h-8 absolute bottom-1' />
                        <div id='local-video' className={`w-full h-full absolute ${!isCameraMuted ? 'block' : 'hidden'}`}>

                        </div>
                </div>
                <div className='hidden min-w-0 flex-1 sm:flex flex-col p-1 pl-2'>
                    <p className='truncate text-white text-xs' title={username}>{username}</p>
                    <p className='text-[#BDBDBD] text-xs'>Disponível</p>
                </div>
            </div>
            <MicAndCameraButtons />
            <button type="button" onClick={() => { void toggleScreenShare().catch(error => signal.emit('officeFeedback', { message: error instanceof Error && error.message.startsWith('Aproxime-se') ? error.message : 'Não foi possível iniciar a captura. Mantenha esta aba ativa e permita o compartilhamento no navegador.' })) }} aria-label={isScreenSharing ? 'Parar compartilhamento de tela' : 'Compartilhar tela'} title={isScreenSharing ? 'Parar compartilhamento' : 'Compartilhar tela na chamada'} className={`flex h-10 shrink-0 items-center gap-2 rounded-lg px-2 text-sm text-white outline-none hover:bg-light-secondary ${isScreenSharing ? 'bg-teal-700' : 'bg-secondary'}`}><MonitorArrowUp size={24}/><span className="hidden md:inline">{isScreenSharing ? 'Parar tela' : 'Compartilhar tela'}</span></button>
            <button type="button" aria-label="Configurar microfone, câmera e áudio" title="Dispositivos" onClick={() => setDeviceSettingsOpen(true)} className="h-10 w-10 shrink-0 aspect-square grid place-items-center rounded-lg bg-secondary p-2 text-white hover:bg-light-secondary"><GearSix size={27} /></button>
            <button type='button' aria-label='Alterar avatar' title='Alterar avatar' className='h-10 w-10 shrink-0 aspect-square grid place-items-center rounded-lg p-1 outline-none bg-secondary hover:bg-light-secondary ml-auto animate-colors' onClick={onClickSkinButton}>
                <TShirt className='h-8 w-8'/>
            </button>
            {deviceSettingsOpen && <DeviceSettings onClose={() => setDeviceSettingsOpen(false)} />}
        </div>
    )
}

export default PlayNavbar
