'use client'

import { useState } from 'react'
import { useInstallPrompt } from './PwaRegistration'

export default function InstallButton() {
    const { prompt, installed, clearPrompt } = useInstallPrompt()
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState('')

    async function install() {
        if (!prompt || busy) return
        setBusy(true)
        setMessage('')
        try {
            await prompt.prompt()
            const choice = await prompt.userChoice
            setMessage(choice.outcome === 'accepted' ? 'Instalação solicitada ao navegador.' : 'Você pode instalar quando quiser pelo menu do navegador.')
        } catch {
            setMessage('Abra o menu do navegador para instalar o Matte Office.')
        } finally {
            clearPrompt()
            setBusy(false)
        }
    }

    return <div className='my-6' aria-live='polite'>
        {installed ? <p className='font-semibold text-[#00d4b2]'>Você já está usando o Matte Office como aplicativo.</p>
            : prompt ? <button type='button' disabled={busy} onClick={() => void install()}
                className='rounded-lg bg-[#00d4b2] px-5 py-3 font-bold text-[#191e32] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white disabled:opacity-50'>
                {busy ? 'Abrindo instalação…' : 'Instalar Matte Office'}
            </button>
                : <p className='text-[#cad8ff]'>Use o menu do navegador conforme as instruções abaixo.</p>}
        {message && <p className='mt-3 text-sm text-[#cad8ff]'>{message}</p>}
    </div>
}
