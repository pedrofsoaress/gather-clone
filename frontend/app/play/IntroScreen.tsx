'use client'
import React, { useEffect, useRef, useState, type FormEvent } from 'react'
import { MicrophoneSlash, VideoCameraSlash } from '@phosphor-icons/react'
import AvatarPicker from './SkinMenu/AvatarPicker'
import { skins, defaultSkin } from '@/utils/pixi/Player/skins'
import { useVideoChat } from '../hooks/useVideoChat'
import MicAndCameraButtons from '@/components/VideoChat/MicAndCameraButtons'
import MatteLogo from '@/components/Brand/MatteLogo'
import { card, kicker, primaryButton } from '@/components/Brand/styles'
import { suggestedName } from './introName'
import signal from '@/utils/signal'

const brandThemeColor = '#0B0B0F'

type IntroScreenProps = {
    realmName: string
    skin: string
    username: string
    onJoin: (displayName: string, skin: string) => Promise<void>
}

const IntroScreen:React.FC<IntroScreenProps> = ({ realmName, skin, username, onJoin }) => {

    const [name, setName] = useState(suggestedName(username))
    const [selectedSkin, setSelectedSkin] = useState(skins.includes(skin) ? skin : defaultSkin)
    const [joining, setJoining] = useState(false)
    const [error, setError] = useState('')
    const [mediaFeedback, setMediaFeedback] = useState('')
    const joiningRef = useRef(false)
    useEffect(() => setName(suggestedName(username)), [username])

    // This page lives under /play, which inherits the office's navy browser bar.
    // Paint it black while choosing, and give the office its color back on join.
    useEffect(() => {
        const existing = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
        const created = !existing
        const meta = existing ?? document.createElement('meta')
        if (created) {
            meta.name = 'theme-color'
            document.head.appendChild(meta)
        }
        const previous = meta.content
        meta.content = brandThemeColor
        return () => {
            if (created) meta.remove()
            else meta.content = previous
        }
    }, [])

    // Office notifications only mount after joining, so camera and microphone
    // errors (for example, permission blocked) are shown here in the camera card.
    useEffect(() => {
        const onFeedback = (data: { message?: string }) => { if (data?.message) setMediaFeedback(data.message) }
        signal.on('officeFeedback', onFeedback)
        return () => signal.off('officeFeedback', onFeedback)
    }, [])
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
        <main className='matte-backdrop min-h-screen w-full text-white'>
            <header className='mx-auto flex max-w-5xl items-center gap-3 px-4 py-5 sm:px-6'>
                <MatteLogo />
                <span aria-hidden='true' className='h-5 w-px shrink-0 bg-white/15' />
                <span className='min-w-0 truncate text-sm font-semibold text-white/70'>{realmName}</span>
            </header>
            <div className='mx-auto max-w-5xl px-4 pb-12 sm:px-6'>
                <p className={kicker}>Antes de entrar</p>
                <h1 className='mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl'>Prepare sua entrada</h1>
                <p className='mt-2 text-white/60'>Escolha seu boneco e seu nome, e confira câmera e microfone.</p>
                <section className='mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]'>
                    <div className={`${card} flex flex-col p-4 sm:p-5`}>
                        <div className='relative aspect-video w-full overflow-hidden rounded-xl bg-black lg:aspect-auto lg:min-h-[16rem] lg:flex-1'>
                            <LocalVideo />
                        </div>
                        <div className='mt-4 flex flex-wrap items-center justify-between gap-3'>
                            <p role='status' className={`min-w-0 text-sm ${mediaFeedback ? 'text-white/80' : 'text-white/60'}`}>{mediaFeedback || 'Câmera e microfone começam desligados.'}</p>
                            <div className='ml-auto'>
                                <MicAndCameraButtons variant='brand' />
                            </div>
                        </div>
                    </div>
                    <form className={`${card} flex min-w-0 flex-col gap-5 p-4 sm:p-6`} onSubmit={submit} aria-busy={joining}>
                        <AvatarPicker value={selectedSkin} onChange={setSelectedSkin} disabled={joining} />
                        <div className='flex flex-col gap-2'>
                            <label htmlFor='office-display-name' className='text-sm font-semibold'>Seu nome no escritório</label>
                            <input id='office-display-name' type='text' autoComplete='nickname' required maxLength={32}
                                placeholder='Como o time vai te ver'
                                value={name} onChange={event => setName(event.target.value)} disabled={joining}
                                className='w-full min-w-0 rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none transition-colors placeholder:text-white/50 focus:border-matte-pink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white' />
                        </div>
                        {error && <p role='alert' className='text-sm text-rose-300'>{error}</p>}
                        <button type='submit' className={`${primaryButton} w-full`} disabled={joining || !normalizedName || normalizedName.length > 32}>
                            {joining ? 'Preparando seu boneco…' : 'Entrar no escritório'}
                        </button>
                    </form>
                </section>
            </div>
        </main>
    )
}

export default IntroScreen

function LocalVideo() {
    const { isCameraMuted, isMicMuted } = useVideoChat()

    return (
        <div className='absolute inset-0 grid place-items-center bg-[#111114]'>
            <div id='local-video' className='h-full w-full' />
            {isCameraMuted && <div className='absolute flex select-none flex-col items-center gap-2 text-sm text-white/70'>
                <VideoCameraSlash size={28} className='text-matte-pink' />
                <p>Câmera desligada</p>
            </div>}
            {isMicMuted && <p className='absolute bottom-2 right-2 inline-flex select-none items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-xs text-white'>
                <MicrophoneSlash size={14} className='text-matte-pink' /> Microfone desligado
            </p>}
        </div>
    )
}
