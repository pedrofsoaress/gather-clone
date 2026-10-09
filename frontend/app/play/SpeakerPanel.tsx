'use client'
import { useEffect, useState } from 'react'
import { spatialAudio, type SpeakerSnapshot } from '@/utils/video-chat/SpatialAudio'
import signal from '@/utils/signal'
import type { OfficeObject } from '@/utils/pixi/types'
import { server } from '@/utils/backend/server'

export default function SpeakerPanel({ object, uid }: { object: OfficeObject, uid: string }) {
    const [snapshot, setSnapshot] = useState<SpeakerSnapshot>({})
    const [muted, setMuted] = useState(spatialAudio.muted)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    useEffect(() => {
        signal.on('officeSpeakerState', setSnapshot)
        signal.on('speakerMuted', setMuted)
        server.socket.timeout(8000).emit('speakerGetSnapshot', (timeout: Error | null, result: { snapshot?: SpeakerSnapshot }) => { if (!timeout && result?.snapshot) setSnapshot(result.snapshot) })
        return () => { signal.off('officeSpeakerState', setSnapshot); signal.off('speakerMuted', setMuted) }
    }, [])
    const state = snapshot[object.id]
    const microphone = Boolean(object.config && 'flat' in object.config && object.config.flat)
    const own = state?.ownerUid === uid
    const act = async () => {
        setBusy(true); setError('')
        try { if (state?.ownerUid === uid) await spatialAudio.stop(); else await spatialAudio.start(object.id, microphone ? 'microphone' : 'tab') }
        catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível compartilhar o áudio.') }
        finally { setBusy(false) }
    }
    return <div className="mt-4 space-y-3 text-sm text-slate-200">
        <p>{microphone
            ? state ? own ? 'Seu microfone está aberto para toda a sala de treinamento.' : 'Alguém está falando neste microfone.' : 'Ligue o microfone para falar com toda a sala de treinamento.'
            : state ? own ? 'Você está compartilhando o áudio de uma aba.' : 'Alguém está compartilhando áudio aqui.' : 'Escolha uma aba com áudio. O som diminui conforme as pessoas se afastam.'}</p>
        <button type="button" disabled={busy || Boolean(state && state.ownerUid !== uid)} onClick={() => { void act() }} className="rounded bg-teal-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">{busy ? 'Aguarde…' : microphone ? own ? 'Desligar microfone' : 'Ligar microfone' : own ? 'Parar áudio da aba' : 'Compartilhar áudio de uma aba'}</button>
        <label className="flex items-center gap-2"><input type="checkbox" checked={muted} onChange={event => spatialAudio.setMuted(event.target.checked)} /> Silenciar caixas de som só para mim</label>
        {error && <p role="alert" className="text-red-300">{error}</p>}
    </div>
}
