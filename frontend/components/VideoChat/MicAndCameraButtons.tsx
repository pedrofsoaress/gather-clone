import React from 'react'
import { VideoCameraSlash, MicrophoneSlash, VideoCamera, Microphone } from '@phosphor-icons/react'
import { useVideoChat } from '@/app/hooks/useVideoChat'

type MicAndCameraButtonsProps = {
    
}

const MicAndCameraButtons:React.FC<MicAndCameraButtonsProps> = () => {

    const { isCameraMuted, isMicMuted, isCameraBusy, isMicBusy, toggleCamera, toggleMicrophone } = useVideoChat()
    

    const micClass = `w-6 h-6 ${!isMicMuted ? 'text-[#08D6A0]' : 'text-[#FF2F49]'}`
    const cameraClass = `w-6 h-6 ${!isCameraMuted ? 'text-[#08D6A0]' : 'text-[#FF2F49]'}`
    return (
        <section className='flex flex-row gap-2'>
            <button 
                type='button'
                aria-label={isMicMuted ? 'Ativar microfone' : 'Desativar microfone'}
                aria-pressed={!isMicMuted}
                disabled={isMicBusy}
                className={`${!isMicMuted ? 'bg-[#2A4B54] hover:bg-[#3b6975]' : 'bg-[#682E44] hover:bg-[#7a3650]'} 
                p-2 rounded-full animate-colors outline-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-white`}
                onClick={toggleMicrophone}
            >
                {isMicMuted ? <MicrophoneSlash className={micClass} /> : <Microphone className={micClass} />}
            </button>
            <button 
                type='button'
                aria-label={isCameraMuted ? 'Ativar câmera' : 'Desativar câmera'}
                aria-pressed={!isCameraMuted}
                disabled={isCameraBusy}
                className={`${!isCameraMuted ? 'bg-[#2A4B54] hover:bg-[#3b6975]' : 'bg-[#682E44] hover:bg-[#7a3650]'} 
                p-2 rounded-full animate-colors outline-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-white`}
                onClick={toggleCamera}
            >
                {isCameraMuted ? <VideoCameraSlash className={cameraClass} /> : <VideoCamera className={cameraClass} />}
            </button>
        </section>
        
    )
}

export default MicAndCameraButtons
