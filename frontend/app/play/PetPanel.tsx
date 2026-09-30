'use client'

import { useEffect, useRef, useState } from 'react'
import type { OfficeObject } from '@/utils/pixi/types'
import { server } from '@/utils/backend/server'
import signal from '@/utils/signal'

export default function PetPanel({ object }: { object: OfficeObject }) {
    const [pending, setPending] = useState(false)
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')
    const cooldown = useRef<ReturnType<typeof setTimeout>>()
    useEffect(() => () => { if (cooldown.current) clearTimeout(cooldown.current) }, [])

    const pet = () => {
        if (pending) return
        setPending(true)
        setError('')
        server.socket.timeout(8000).emit('avatarAction', { action: 'pet', objectId: object.id }, (timeout: Error | null, result: { ok: boolean, error?: string }) => {
            if (timeout || !result?.ok) {
                setPending(false)
                setError(result?.error ?? 'Não foi possível fazer carinho agora.')
                return
            }
            setMessage(`${object.label} gostou do carinho ♥`)
            signal.emit('officeFeedback', { message: `${object.label} está ronronando.` })
            cooldown.current = setTimeout(() => { setPending(false) }, 2600)
        })
    }

    return <div className="mt-4 space-y-4">
        <p className="text-slate-300">Uma pausa com o pet do escritório. Aproxime-se e faça carinho para todo mundo ver.</p>
        {error && <p role="alert" className="rounded bg-red-950 p-3 text-red-200">{error}</p>}
        {message && <p role="status" className="text-pink-200">{message}</p>}
        <button type="button" onClick={pet} disabled={pending} className="rounded-lg bg-pink-300 px-4 py-3 font-semibold text-slate-950 hover:bg-pink-200 disabled:opacity-60">{pending ? 'Recebendo carinho…' : `Fazer carinho em ${object.label}`}</button>
        <p className="text-xs text-slate-400">No mapa: Z para dançar · Segure Shift ao andar para correr.</p>
    </div>
}
