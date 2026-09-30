'use client'
import React, { useEffect, useRef, useState, type FormEvent } from 'react'
import BasicButton from '@/components/BasicButton'
import AvatarPicker from './SkinMenu/AvatarPicker'
import { skins, defaultSkin } from '@/utils/pixi/Player/skins'
import { useVideoChat } from '../hooks/useVideoChat'
import MicAndCameraButtons from '@/components/VideoChat/MicAndCameraButtons'

type IntroScreenProps = {
    realmName: string
    skin: string
    username: string
    onJoin: (displayName: string, skin: string) => Promise<void>
}

const IntroScreen:React.FC<IntroScreenProps> = ({ realmName, skin, username, onJoin }) => {

    const [name, setName] = useState(username)
    const [selectedSkin, setSelectedSkin] = useState(skins.includes(skin) ? skin : defaultSkin)
    const [joining, setJoining] = useState(false)
    const [error, setError] = useState('')
    const joiningRef = useRef(false)
    useEffect(() => setName(username), [username])
    const normalizedName = name.trim()
    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!normalizedName || normalizedName.length > 32 || joiningRef.current) return
        joiningRef.current = true
        setJoining(true)
        setError('')
        try {
            await onJoin(normalizedName, selectedSkin)
        } catch {
            setError('Não foi possível salvar seu boneco. Confira sua conexão e tente entrar novamente.')
        } finally {
            joiningRef.current = false
            setJoining(false)
        }
    }

    return (
        <main className='dark-gradient w-full min-h-screen flex flex-col items-center px-4 py-8 sm:py-12'>
            <h1 className='text-center text-3xl sm:text-4xl font-semibold'>Bem-vindo ao <span className='text-[#CAD8FF]'>{realmName}</span></h1>
            <section className='flex w-full max-w-4xl flex-col sm:flex-row mt-8 items-center justify-center gap-8 sm:gap-16'>
                <div className='flex flex-col items-center gap-4'>
                    <div className='aspect-video w-[min(337px,90vw)] bg-black rounded-xl border-2 border-[#3F4776] overflow-hidden'>
                        <LocalVideo/>
                    </div>
                    <MicAndCameraButtons/>
                </div>
                <form className='flex w-full max-w-xs flex-col items-center gap-4' onSubmit={submit} aria-busy={joining}>
                    <AvatarPicker value={selectedSkin} onChange={setSelectedSkin} disabled={joining} />
                    <label htmlFor='office-display-name' className='w-full text-sm font-medium text-slate-200'>Seu nome no escritório</label>
                    <input id='office-display-name' type='text' autoComplete='nickname' required maxLength={32}
                        value={name} onChange={event => setName(event.target.value)} disabled={joining}
                        className='w-full rounded-lg border border-[#6673aa] bg-[#1b203b] px-4 py-3 text-white outline-none focus:border-[#cad8ff]' />
                    {error && <p role='alert' className='w-full text-sm text-rose-200'>{error}</p>}
                    <BasicButton className='w-full py-3' type='submit' disabled={joining || !normalizedName || normalizedName.length > 32}>
                        {joining ? 'Preparando seu boneco…' : 'Entrar no escritório'}
                    </BasicButton>
                </form>
            </section>
        </main>
    )
}

export default IntroScreen

function LocalVideo() {
    const { isCameraMuted, isMicMuted } = useVideoChat()

    return (
        <div className='w-full h-full bg-[#111111] grid place-items-center relative'>
            <div id='local-video' className='w-full h-full'>

            </div>
            <div className='absolute select-none text-sm text-white items-center flex flex-col gap-1'>
                {isMicMuted && isCameraMuted && <p>You are muted</p>}
                {isCameraMuted && <p>Your camera is off</p>}
            </div>
            {isMicMuted && !isCameraMuted && <p className='absolute bottom-2 right-3 select-none text-sm text-white bg-black bg-opacity-50 p-1 px-2 rounded-full'>
                You are muted
            </p>}
        </div>
    )
}
