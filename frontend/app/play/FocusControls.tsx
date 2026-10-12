'use client'

import { useEffect, useRef, useState } from 'react'
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
    const [pendingUid, setPendingUid] = useState<string | null>(null)
    const [talkingUid, setTalkingUid] = useState<string | null>(null)
    const inFlight = useRef(false)
    const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const clearPending = () => {
        if (pendingTimer.current) clearTimeout(pendingTimer.current)
        pendingTimer.current = null
        setPendingUid(null)
    }

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
        const onAnswered = ({ accepted, name, uid }: { accepted: boolean, name: string, uid?: string }) => {
            clearPending()
            if (accepted && uid) setTalkingUid(uid)
            signal.emit('officeFeedback', {
                message: accepted ? `${name} aceitou. Vocês estão conversando.` : `${name} está em foco agora.`,
            })
        }
        const onProximity = ({ proximityId }: { proximityId: string | null }) => { if (!proximityId) setTalkingUid(null) }
        const onNearby = (value: { uid: string, name: string } | null) => setNearby(value)

        const attach = () => {
            const socket = server.socket
            socket.on('focusKnocked', onKnocked)
            socket.on('focusKnockClosed', onClosed)
            socket.on('focusAnswered', onAnswered)
            socket.on('proximityUpdate', onProximity)
            return () => {
                socket.off('focusKnocked', onKnocked)
                socket.off('focusKnockClosed', onClosed)
                socket.off('focusAnswered', onAnswered)
                socket.off('proximityUpdate', onProximity)
            }
        }
        let detach: (() => void) | undefined
        const onReady = () => { detach?.(); detach = attach() }
        signal.on('focusNearby', onNearby)
        signal.on('officeReady', onReady)
        if (server.socket.connected) onReady()
        return () => {
            signal.off('focusNearby', onNearby)
            signal.off('officeReady', onReady)
            detach?.()
            timers.forEach(timer => clearTimeout(timer))
            timers.clear()
            if (pendingTimer.current) clearTimeout(pendingTimer.current)
        }
    }, [])

    useEffect(() => { if (talkingUid && nearby?.uid !== talkingUid) setTalkingUid(null) }, [nearby, talkingUid])

    const knock = () => {
        if (!nearby || pendingUid || inFlight.current || typeof server.socket.emit !== 'function' || !server.socket.connected) return
        const target = nearby
        inFlight.current = true
        // timeout() always calls back, even if the connection drops before the answer.
        server.socket.timeout(8000).emit('focusKnock', { targetUid: target.uid }, (timeout: Error | null, response: Ack) => {
            inFlight.current = false
            const result = timeout ? undefined : response
            if (result?.ok) {
                setPendingUid(target.uid)
                if (pendingTimer.current) clearTimeout(pendingTimer.current)
                pendingTimer.current = setTimeout(clearPending, KNOCK_LIFETIME_MS)
            }
            signal.emit('officeFeedback', { message: result?.ok ? `Chamando ${target.name}...` : result?.error ?? 'Não foi possível chamar.' })
        })
    }

    const answer = (knockId: string, accept: boolean) => {
        setKnocks(list => list.filter(item => item.knockId !== knockId))
        if (typeof server.socket.emit !== 'function') return
        server.socket.emit('focusAnswer', { knockId, accept }, (result: Ack) => {
            if (!result?.ok) signal.emit('officeFeedback', { message: result?.error ?? 'Não foi possível responder.' })
        })
    }

    return <>
        {nearby && nearby.uid !== pendingUid && nearby.uid !== talkingUid && <div className='pointer-events-none absolute bottom-24 left-1/2 z-30 -translate-x-1/2'>
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
