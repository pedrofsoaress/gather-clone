'use client'

import { useState } from 'react'
import type { OfficeObject } from '@/utils/pixi/types'
import type { PresentationSession } from '@/utils/pixi/office/types'
import { server } from '@/utils/backend/server'

export default function PresentationPanel({ object, session, uid, onFocus, onClose }: {
    object: OfficeObject,
    session?: PresentationSession,
    uid: string,
    onFocus: () => void,
    onClose: () => void,
}) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const slides = object.config && 'slides' in object.config ? object.config.slides : []
    const send = (event: string, after?: () => void) => {
        setBusy(true)
        setError('')
        server.socket.timeout(8000).emit(event, { objectId: object.id }, (timeout: Error | null, result: { ok: boolean, error?: string }) => {
            setBusy(false)
            if (timeout || !result?.ok) return setError(result?.error ?? 'Não foi possível atualizar a apresentação.')
            after?.()
        })
    }
    return <div className="mt-4 space-y-4 text-sm text-slate-200">
        <p>{session ? `Apresentação em andamento · slide ${session.slideIndex + 1} de ${slides.length}` : `${slides.length} slides prontos para apresentar.`}</p>
        {session?.raisedHands.length ? <p className="text-amber-200">{session.raisedHands.length} pessoa(s) pediram a palavra.</p> : null}
        <div className="flex flex-wrap gap-2">
            {!session && <button type="button" disabled={busy || slides.length === 0} onClick={() => send('presentationStart', () => { onFocus(); onClose() })} className="rounded bg-teal-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">Iniciar apresentação</button>}
            {session && <button type="button" onClick={() => { onFocus(); onClose() }} className="rounded bg-teal-400 px-4 py-2 font-semibold text-slate-950">Ver slides</button>}
            {session && session.presenterUid !== uid && <button type="button" disabled={busy || session.raisedHands.includes(uid)} onClick={() => send('presentationRaiseHand')} className="rounded bg-slate-700 px-4 py-2 disabled:opacity-50">{session.raisedHands.includes(uid) ? 'Mão levantada' : 'Pedir a palavra'}</button>}
            {session?.presenterUid === uid && <button type="button" disabled={busy} onClick={() => send('presentationEnd', onClose)} className="rounded bg-red-900 px-4 py-2">Encerrar</button>}
        </div>
        {error && <p role="alert" className="text-red-300">{error}</p>}
    </div>
}
