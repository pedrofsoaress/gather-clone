'use client'
import React, { useEffect, useState, type FormEvent } from 'react'
import BasicButton from '@/components/BasicButton'
import AnimatedCharacter from './SkinMenu/AnimatedCharacter'
import { useVideoChat } from '../hooks/useVideoChat'
import MicAndCameraButtons from '@/components/VideoChat/MicAndCameraButtons'

type IntroScreenProps = {
    realmName: string
    skin: string
    username: string
    onJoin: (displayName: string) => void
}

const IntroScreen:React.FC<IntroScreenProps> = ({ realmName, skin, username, onJoin }) => {

    const src = '/sprites/characters/Character_' + skin + '.png'
    const [name, setName] = useState(username)
    useEffect(() => setName(username), [username])
    const normalizedName = name.trim()
    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (normalizedName && normalizedName.length <= 32) onJoin(normalizedName)
    }

    return (
        <main className='dark-gradient w-full min-h-screen flex flex-col items-center px-4 py-12 sm:pt-28'>
            <h1 className='text-center text-3xl sm:text-4xl font-semibold'>Bem-vindo ao <span className='text-[#CAD8FF]'>{realmName}</span></h1>
            <section className='flex flex-col sm:flex-row mt-10 sm:mt-32 items-center gap-10 sm:gap-24'>
                <div className='flex flex-col items-center gap-4'>
                    <div className='aspect-video w-[min(337px,90vw)] bg-black rounded-xl border-2 border-[#3F4776] overflow-hidden'>
                        <LocalVideo/>
                    </div>
                    <MicAndCameraButtons/>
                </div>
                <form className='flex w-full max-w-xs flex-col items-center gap-4' onSubmit={submit}>
                    <div className='flex flex-row items-center'>
                        <AnimatedCharacter src={src} noAnimation/>
                        <p className='relative top-4 max-w-48 truncate'>{normalizedName || 'Seu personagem'}</p>
                    </div>
                    <label htmlFor='office-display-name' className='w-full text-sm font-medium text-slate-200'>Seu nome no escritório</label>
                    <input id='office-display-name' type='text' autoComplete='nickname' required maxLength={32}
                        value={name} onChange={event => setName(event.target.value)}
                        className='w-full rounded-lg border border-[#6673aa] bg-[#1b203b] px-4 py-3 text-white outline-none focus:border-[#cad8ff]' />
                    <BasicButton className='w-full py-3' type='submit' disabled={!normalizedName || normalizedName.length > 32}>
                        Entrar no escritório
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
