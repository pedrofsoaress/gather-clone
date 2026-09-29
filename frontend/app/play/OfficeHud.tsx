'use client'

import { useEffect, useRef, useState } from 'react'
import type { OfficeObject } from '@/utils/pixi/types'
import signal from '@/utils/signal'

type OfficeHudProps = { objects: OfficeObject[] }

export default function OfficeHud({ objects }: OfficeHudProps) {
    const [openId, setOpenId] = useState<string | null>(null)
    const [nearbyId, setNearbyId] = useState<string | null>(null)
    const [hoverId, setHoverId] = useState<string | null>(null)
    const [feedback, setFeedback] = useState('')
    const headingRef = useRef<HTMLHeadingElement>(null)

    useEffect(() => {
        const onOpen = ({ objectId }: { objectId: string }) => setOpenId(objectId)
        const onNearby = ({ objectId }: { objectId: string | null }) => setNearbyId(objectId)
        const onHover = ({ objectId }: { objectId: string | null }) => setHoverId(objectId)
        const onFeedback = ({ message }: { message: string }) => setFeedback(message)
        signal.on('officeOpen', onOpen)
        signal.on('officeNearby', onNearby)
        signal.on('officeHover', onHover)
        signal.on('officeFeedback', onFeedback)
        return () => {
            signal.off('officeOpen', onOpen)
            signal.off('officeNearby', onNearby)
            signal.off('officeHover', onHover)
            signal.off('officeFeedback', onFeedback)
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

    if (objects.length === 0) return null

    return <>
        {!active && <div className="absolute right-3 top-3 z-20 rounded-xl border border-teal-300/40 bg-slate-950/85 px-3 py-2 text-sm text-white shadow-lg">
            {hovered ? `Clique em ${hovered.label}` : nearby ? `E · ${nearby.label}` : 'Clique em um ponto verde para interagir'}
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
                {active.kind === 'guide' ? <div className="mt-4 space-y-2 text-sm text-slate-200">
                    <p>Bem-vindo ao escritório Matte.</p>
                    <p>Clique em um ponto verde para ir até um objeto. Perto dele, use E ou o botão Interagir no celular.</p>
                    <p>Converse por proximidade e use a sala de reunião para uma conversa privada.</p>
                </div> : <p className="mt-4 text-sm text-slate-200">Você chegou ao objeto. As ações desta área aparecem aqui.</p>}
            </section>
        </div>}
    </>
}
