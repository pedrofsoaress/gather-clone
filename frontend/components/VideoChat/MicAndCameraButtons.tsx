import React from 'react'
import { VideoCameraSlash, MicrophoneSlash, VideoCamera, Microphone } from '@phosphor-icons/react'
import { useVideoChat } from '@/app/hooks/useVideoChat'

type MicAndCameraButtonsProps = {
    variant?: 'office' | 'brand'
}

const MicAndCameraButtons:React.FC<MicAndCameraButtonsProps> = ({ variant = 'office' }) => {

    const { isCameraMuted, isMicMuted, isCameraBusy, isMicBusy, toggleCamera, toggleMicrophone } = useVideoChat()

    const brand = variant === 'brand'
    const iconClass = (on: boolean) => `w-6 h-6 ${on ? (brand ? 'text-white' : 'text-[#08D6A0]') : (brand ? 'text-matte-pink' : 'text-[#FF2F49]')}`
    const buttonClass = (on: boolean) => on
        ? (brand ? 'bg-white/10 hover:bg-white/20' : 'bg-[#2A4B54] hover:bg-[#3b6975]')
        : (brand ? 'bg-matte-pink/20 hover:bg-matte-pink/30' : 'bg-[#682E44] hover:bg-[#7a3650]')
    // 'brand' buttons reach a 44px tap target; the office bar keeps its 40px buttons.
    const padding = brand ? 'p-2.5' : 'p-2'
    const micClass = iconClass(!isMicMuted)
    const cameraClass = iconClass(!isCameraMuted)
    return (
        <section className='flex flex-row gap-2'>
            <button 
                type='button'
                aria-label={isMicMuted ? 'Ativar microfone' : 'Desativar microfone'}
                aria-pressed={!isMicMuted}
                disabled={isMicBusy}
                className={`${buttonClass(!isMicMuted)} 
                ${padding} rounded-full animate-colors outline-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-white`}
                onClick={toggleMicrophone}
            >
                {isMicMuted ? <MicrophoneSlash className={micClass} /> : <Microphone className={micClass} />}
            </button>
            <button 
                type='button'
                aria-label={isCameraMuted ? 'Ativar câmera' : 'Desativar câmera'}
                aria-pressed={!isCameraMuted}
                disabled={isCameraBusy}
                className={`${buttonClass(!isCameraMuted)} 
                ${padding} rounded-full animate-colors outline-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-white`}
                onClick={toggleCamera}
            >
                {isCameraMuted ? <VideoCameraSlash className={cameraClass} /> : <VideoCamera className={cameraClass} />}
            </button>
        </section>
        
    )
}

export default MicAndCameraButtons
