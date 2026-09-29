'use client'

import { useEffect, useRef, useState } from 'react'
import type { OfficeObject } from '@/utils/pixi/types'
import signal from '@/utils/signal'
import { server } from '@/utils/backend/server'
import type { OfficeSnapshot } from '@/utils/pixi/office/types'
import OfficeBoard from './OfficeBoard'
import PingPongPanel from './PingPongPanel'

type OfficeHudProps = { objects: OfficeObject[], uid: string }

export default function OfficeHud({ objects, uid }: OfficeHudProps) {
    const [openId, setOpenId] = useState<string | null>(null)
    const [nearbyId, setNearbyId] = useState<string | null>(null)
    const [hoverId, setHoverId] = useState<string | null>(null)
    const [feedback, setFeedback] = useState('')
    const [snapshot, setSnapshot] = useState<OfficeSnapshot>({ occupancy: {}, games: {} })
    const [busy, setBusy] = useState(false)
    const headingRef = useRef<HTMLHeadingElement>(null)

    useEffect(() => {
        const onOpen = ({ objectId }: { objectId: string }) => setOpenId(objectId)
        const onNearby = ({ objectId }: { objectId: string | null }) => setNearbyId(objectId)
        const onHover = ({ objectId }: { objectId: string | null }) => setHoverId(objectId)
        const onFeedback = ({ message }: { message: string }) => setFeedback(message)
        const onSnapshot = (next: OfficeSnapshot) => setSnapshot(next)
        signal.on('officeOpen', onOpen)
        signal.on('officeNearby', onNearby)
        signal.on('officeHover', onHover)
        signal.on('officeFeedback', onFeedback)
        signal.on('officeSnapshot', onSnapshot)
        return () => {
            signal.off('officeOpen', onOpen)
            signal.off('officeNearby', onNearby)
            signal.off('officeHover', onHover)
            signal.off('officeFeedback', onFeedback)
            signal.off('officeSnapshot', onSnapshot)
            signal.emit('disableInput', false)
        }
    }, [])

    useEffect(() => {
        signal.emit('disableInput', Boolean(openId))
        if (openId) requestAnimationFrame(() => headingRef.current?.focus())
    }, [openId])

    useEffect(() => {
        if (!feedback) return
        const timeout = window.setTimeout(() => setFeedback(''), 4000)
        return () => window.clearTimeout(timeout)
    }, [feedback])

    const close = () => {
        setOpenId(null)
        requestAnimationFrame(() => document.querySelector<HTMLCanvasElement>('#app-container canvas')?.focus())
    }
    const active = objects.find((object) => object.id === openId)
    const nearby = objects.find((object) => object.id === nearbyId)
    const hovered = objects.find((object) => object.id === hoverId)
    const occupant = active ? snapshot.occupancy[active.id] : undefined

    const act = (objectId: string, action: 'occupy' | 'release' | 'drink' | 'snack' | 'startGame' | 'joinGame' | 'returnBall' | 'leaveGame') => {
        if (busy) return
        setBusy(true)
        server.socket.timeout(8000).emit('officeAction', { objectId, action }, (timeout: Error | null, result: { ok: boolean, error?: string, verifiedPosition?: { x: number, y: number } }) => {
            setBusy(false)
            if (!timeout && !result?.ok && action === 'occupy' && result?.error === 'Aproxime-se do objeto.' && result.verifiedPosition) {
                setOpenId(null)
                signal.emit('disableInput', false)
                signal.emit('officeResync', { objectId, position: result.verifiedPosition })
                return
            }
            if (timeout || !result?.ok) setFeedback(result?.error || 'Não foi possível completar a ação.')
        })
    }

    if (objects.length === 0) return null

    return <>
        {!active && <div className="absolute right-3 top-3 z-20 rounded-xl border border-teal-300/40 bg-slate-950/85 px-3 py-2 text-sm text-white shadow-lg">
            {hovered ? `Clique em ${hovered.label}${snapshot.occupancy[hovered.id] ? ` · ${snapshot.occupancy[hovered.id].name}` : ''}` : nearby ? `E · ${nearby.label}` : 'Clique em um ponto verde para interagir'}
        </div>}
        {!active && nearby && <button
            type="button"
            className="absolute bottom-20 right-3 z-20 rounded-xl bg-teal-500 px-4 py-3 font-semibold text-slate-950 shadow-xl sm:hidden"
            onClick={() => signal.emit('officeRequest', { objectId: nearby.id })}
        >Interagir · {nearby.label}</button>}
        {feedback && <p role="status" className="absolute left-1/2 top-20 z-30 -translate-x-1/2 rounded-lg bg-slate-950 px-4 py-2 text-white shadow-lg">{feedback}</p>}
        {active && <div className="absolute inset-0 z-30 grid place-items-center bg-slate-950/55 p-4" onMouseDown={(event) => event.stopPropagation()}>
            <section role="dialog" aria-modal="true" aria-labelledby="office-action-title"
                onKeyDown={(event) => { if (event.key === 'Escape') close() }}
                className="w-full max-w-md rounded-2xl border border-teal-300/40 bg-slate-900 p-5 text-white shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                    <h2 ref={headingRef} tabIndex={-1} id="office-action-title" className="text-xl font-bold outline-none">{active.label}</h2>
                    <button type="button" aria-label="Fechar interação" className="rounded-lg bg-slate-700 px-3 py-1 hover:bg-slate-600" onClick={close}>Fechar</button>
                </div>
                {(active.kind === 'seat' || active.kind === 'desk') && <div className="mt-4 space-y-3">
                    <p className="text-sm text-slate-200">{occupant ? `Ocupado por ${occupant.name}` : 'Lugar disponível.'}</p>
                    <button type="button" disabled={busy || Boolean(occupant && occupant.uid !== uid)}
                        onClick={() => act(active.id, occupant?.uid === uid ? 'release' : 'occupy')}
                        className="rounded-lg bg-teal-400 px-4 py-2 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300">
                        {occupant?.uid === uid ? 'Levantar' : occupant ? `Ocupado por ${occupant.name}` : 'Ocupar estação'}
                    </button>
                </div>}
                {active.kind === 'guide' ? <div className="mt-4 space-y-2 text-sm text-slate-200">
                    <p>Bem-vindo ao escritório Matte.</p>
                    <p>Clique em um ponto verde para ir até um objeto. Perto dele, use E ou o botão Interagir no celular.</p>
                    <p>Converse por proximidade e use a sala de reunião para uma conversa privada.</p>
                </div> : null}
                {(active.kind === 'drink' || active.kind === 'snack') && <div className="mt-4 space-y-3">
                    <p className="text-sm text-slate-200">{active.effect === 'coffee' ? 'Prepare um café para a pausa.' : active.effect === 'water' ? 'Pegue um copo d’água.' : 'Escolha um snack para a pausa.'}</p>
                    <button type="button" disabled={busy} onClick={() => act(active.id, active.kind === 'snack' ? 'snack' : 'drink')}
                        className="rounded-lg bg-teal-400 px-5 py-3 font-bold text-slate-950 disabled:opacity-50">
                        {active.effect === 'coffee' ? 'Pegar café' : active.effect === 'water' ? 'Pegar água' : 'Pegar snack'}
                    </button>
                </div>}
                {active.kind === 'pingpong' && <PingPongPanel game={snapshot.games[active.id]} uid={uid} busy={busy}
                    onAction={action => act(active.id, action)} />}
                {['board', 'desk', 'guestbook'].includes(active.kind) && <OfficeBoard key={active.id} object={active} />}
            </section>
        </div>}
    </>
}
