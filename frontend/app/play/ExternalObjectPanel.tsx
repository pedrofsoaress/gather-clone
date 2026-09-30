'use client'

import { useEffect, useState } from 'react'
import type { OfficeObject } from '@/utils/pixi/types'
import { server } from '@/utils/backend/server'

type SharedRoom = { ok: boolean, url?: string, revision?: number, error?: string }

export default function ExternalObjectPanel({ object }: { object: OfficeObject }) {
    const config = object.config && 'url' in object.config ? object.config : null
    const [shared, setShared] = useState<SharedRoom | null>(null)
    const [draftUrl, setDraftUrl] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        if (!config) return
        const onState = (next: { objectId: string, url: string, revision: number }) => {
            if (next.objectId === object.id) {
                setShared({ ok: true, url: next.url, revision: next.revision })
                setDraftUrl(next.url)
            }
        }
        server.socket.timeout(8000).emit('officeExternalGet', { objectId: object.id }, (timeout: Error | null, result: SharedRoom) => {
            if (timeout || !result?.ok) { setError(result?.error ?? 'Não foi possível abrir esta experiência.'); return }
            setShared(result)
            setDraftUrl(result.url ?? '')
        })
        server.socket.on('officeExternalState', onState)
        return () => { server.socket.off('officeExternalState', onState) }
    }, [object.id, config?.url])

    if (!config) return <p className="mt-4 text-red-200">Configuração indisponível.</p>

    const saveRoom = () => {
        if (!shared?.ok || shared.revision === undefined || saving) return
        setSaving(true)
        setError('')
        server.socket.timeout(8000).emit('officeExternalSetRoom', { objectId: object.id, url: draftUrl, revision: shared.revision }, (timeout: Error | null, result: SharedRoom) => {
            setSaving(false)
            if (timeout || !result?.ok) { setError(result?.error ?? 'Não foi possível alterar a sala.'); return }
            setShared(result)
        })
    }

    return <div className="mt-4 space-y-3">
        {error && <p role="alert" className="rounded bg-red-950 px-3 py-2 text-red-200">{error}</p>}
        {!shared?.ok ? <p role="status" className="text-slate-300">Carregando sala compartilhada…</p> : <>
            <div className="relative h-[min(58vh,580px)] min-h-[260px] overflow-hidden rounded-lg border border-slate-600 bg-white">
                <iframe key={shared.url} src={shared.url} title={object.label} sandbox="allow-forms allow-popups allow-scripts allow-same-origin" allow="fullscreen" referrerPolicy="no-referrer" className="h-full w-full" />
            </div>
            <p className="text-xs text-slate-300">Se o site não permitir a incorporação, abra a mesma sala em outra aba.</p>
            <a href={shared.url} target="_blank" rel="noopener noreferrer" className="inline-block rounded bg-slate-700 px-3 py-2 text-sm hover:bg-slate-600">Abrir em nova aba</a>
            {config.roomEditable && <div className="flex flex-col gap-2 border-t border-slate-700 pt-3 sm:flex-row">
                <label className="grow text-sm">Link da sala para todos<input type="url" value={draftUrl} onChange={event => setDraftUrl(event.target.value)} className="mt-1 w-full rounded bg-slate-800 px-3 py-2" /></label>
                <button type="button" disabled={saving} onClick={saveRoom} className="self-end rounded bg-teal-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">Atualizar sala</button>
            </div>}
        </>}
    </div>
}
