'use client'

import { useState } from 'react'
import type { OfficeObject } from '@/utils/pixi/types'
import type { PresentationSession } from '@/utils/pixi/office/types'
import { server } from '@/utils/backend/server'

export default function PresentationViewer({ object, session, uid, compact, onExpand, onClose }: {
    object: OfficeObject,
    session: PresentationSession,
    uid: string,
    compact: boolean,
    onExpand: () => void,
    onClose: () => void,
}) {
    const config = object.config && 'deckId' in object.config ? object.config : null
    const slides = config?.slides ?? []
    const slide = slides[session.slideIndex]
    const presenter = session.presenterUid === uid
    const [error, setError] = useState('')
    const action = (event: string, payload: Record<string, unknown>) => {
        setError('')
        server.socket.timeout(8000).emit(event, { objectId: object.id, ...payload }, (timeout: Error | null, result: { ok: boolean, error?: string }) => {
            if (timeout || !result?.ok) setError(result?.error ?? 'Não foi possível atualizar a apresentação.')
        })
    }

    return <div className={`relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-teal-400/40 bg-[#1d2534] text-white ${compact ? 'w-[220px]' : 'w-full'}`}>
        <header className="flex items-center justify-between gap-2 border-b border-slate-600 px-3 py-2 text-xs font-semibold">
            <span className="truncate">{object.label} · {session.slideIndex + 1}/{slides.length}</span>
            <div className="flex gap-1">
                {compact && <button type="button" onClick={onExpand} className="rounded bg-teal-500 px-2 py-1 text-slate-950">Expandir</button>}
                <button type="button" onClick={onClose} aria-label="Ocultar apresentação" className="rounded bg-slate-700 px-2 py-1">×</button>
            </div>
        </header>
        <div className={`flex min-h-0 grow flex-col justify-center overflow-auto px-5 py-4 ${compact ? 'text-sm' : 'px-8 text-lg'}`}>
            {slide?.imageUrl && <img src={slide.imageUrl} alt="" className={`mb-4 max-h-[55%] w-full object-contain ${compact ? 'hidden' : ''}`} />}
            <h2 className={`font-bold leading-tight ${compact ? 'text-base' : 'text-3xl'}`}>{slide?.title ?? 'Slide indisponível'}</h2>
            {!compact && slide?.body && <p className="mt-4 whitespace-pre-wrap text-slate-200">{slide.body}</p>}
        </div>
        {!compact && <footer className="flex flex-wrap items-center gap-2 border-t border-slate-600 p-3 text-sm">
            {presenter ? <>
                <button type="button" disabled={session.slideIndex === 0} onClick={() => action('presentationSlide', { index: session.slideIndex - 1, revision: session.revision })} className="rounded bg-slate-700 px-3 py-2 disabled:opacity-40">Anterior</button>
                <button type="button" disabled={session.slideIndex >= slides.length - 1} onClick={() => action('presentationSlide', { index: session.slideIndex + 1, revision: session.revision })} className="rounded bg-teal-500 px-3 py-2 font-semibold text-slate-950 disabled:opacity-40">Próximo</button>
                <button type="button" onClick={() => action('presentationEnd', {})} className="ml-auto rounded bg-red-900 px-3 py-2">Encerrar</button>
                {session.raisedHands.length > 0 && <span className="text-amber-200">{session.raisedHands.length} pedido(s) de fala</span>}
            </> : <button type="button" disabled={session.raisedHands.includes(uid)} onClick={() => action('presentationRaiseHand', {})} className="rounded bg-slate-700 px-3 py-2 disabled:opacity-50">{session.raisedHands.includes(uid) ? 'Mão levantada' : 'Pedir a palavra'}</button>}
            {error && <p role="alert" className="w-full text-red-300">{error}</p>}
        </footer>}
    </div>
}
