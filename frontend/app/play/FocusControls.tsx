'use client'

import { useEffect, useState } from 'react'
import signal from '@/utils/signal'
import { server } from '@/utils/backend/server'

type Knock = { knockId: string, fromUid: string, fromName: string }
type Ack = { ok: boolean, error?: string }

const CARD = 'pointer-events-auto w-72 max-w-[calc(100vw-24px)] space-y-2 rounded-xl bg-slate-950 p-3 text-xs text-white shadow-xl'
const KNOCK_LIFETIME_MS = 30_000

// Focus mode: knock on a focused person nearby, and answer knocks addressed to you.
export default function FocusControls() {
    const [nearby, setNearby] = useState<{ uid: string, name: string } | null>(null)
    const [knocks, setKnocks] = useState<Knock[]>([])

    useEffect(() => {
        const timers = new Map<string, ReturnType<typeof setTimeout>>()
        const remove = (knockId: string) => {
            const timer = timers.get(knockId)
            if (timer) clearTimeout(timer)
            timers.delete(knockId)
            setKnocks(list => list.filter(knock => knock.knockId !== knockId))
        }
        const onKnocked = (knock: Knock) => {
            setKnocks(list => list.some(item => item.knockId === knock.knockId) ? list : [...list, knock])
            timers.set(knock.knockId, setTimeout(() => remove(knock.knockId), KNOCK_LIFETIME_MS))
        }
        const onClosed = ({ knockId }: { knockId: string }) => remove(knockId)
        const onAnswered = ({ accepted, name }: { accepted: boolean, name: string }) => signal.emit('officeFeedback', {
            message: accepted ? `${name} aceitou. Vocês estão conversando.` : `${name} está em foco agora.`,
        })
        const onNearby = (value: { uid: string, name: string } | null) => setNearby(value)

        signal.on('focusNearby', onNearby)
        server.socket.on('focusKnocked', onKnocked)
        server.socket.on('focusKnockClosed', onClosed)
        server.socket.on('focusAnswered', onAnswered)
        return () => {
            signal.off('focusNearby', onNearby)
            server.socket.off('focusKnocked', onKnocked)
            server.socket.off('focusKnockClosed', onClosed)
            server.socket.off('focusAnswered', onAnswered)
            timers.forEach(timer => clearTimeout(timer))
            timers.clear()
        }
    }, [])

    const knock = () => {
        if (!nearby) return
        const target = nearby
        server.socket.emit('focusKnock', { targetUid: target.uid }, (result: Ack) => {
            signal.emit('officeFeedback', { message: result?.ok ? `Chamando ${target.name}...` : result?.error ?? 'Não foi possível chamar.' })
        })
    }

    const answer = (knockId: string, accept: boolean) => {
        setKnocks(list => list.filter(item => item.knockId !== knockId))
        server.socket.emit('focusAnswer', { knockId, accept }, (result: Ack) => {
            if (!result?.ok) signal.emit('officeFeedback', { message: result?.error ?? 'Não foi possível responder.' })
        })
    }

    return <>
        {nearby && <div className='pointer-events-none absolute bottom-24 left-1/2 z-30 -translate-x-1/2'>
            <button type='button' onClick={knock} className='pointer-events-auto rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-xl hover:bg-teal-400'>Chamar {nearby.name}</button>
        </div>}
        {knocks.length > 0 && <div className='pointer-events-none absolute left-1/2 top-16 z-30 flex -translate-x-1/2 flex-col gap-2'>
            {knocks.map(item => <div key={item.knockId} className={CARD}>
                <p className='font-semibold'>{item.fromName} quer falar com você</p>
                <div className='flex gap-2'>
                    <button type='button' onClick={() => answer(item.knockId, true)} className='flex-1 rounded bg-teal-500 px-2 py-1.5 font-semibold text-slate-950 hover:bg-teal-400'>Aceitar</button>
                    <button type='button' onClick={() => answer(item.knockId, false)} className='flex-1 rounded bg-slate-700 px-2 py-1.5 hover:bg-slate-600'>Agora não</button>
                </div>
            </div>)}
        </div>}
    </>
}
