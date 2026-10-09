import React, { useEffect, useState } from 'react'
import signal from '@/utils/signal'
import { server } from '@/utils/backend/server'
import { getMeeting, isModerator, type MeetingSnapshot } from '@/utils/video-chat/meeting'
import { usePeerProfile } from './useRemoteUsers'

export function useMeeting() {
    const [meeting, setMeeting] = useState<MeetingSnapshot | null>(getMeeting())
    useEffect(() => {
        signal.on('meetingState', setMeeting)
        return () => signal.off('meetingState', setMeeting)
    }, [])
    return meeting
}

type Action = 'mute' | 'cameraOff' | 'muteAll' | 'lock' | 'unlock' | 'allow' | 'deny'

export function moderate(action: Action, targetUid?: string) {
    server.socket.timeout(8000).emit('meetingModerate', { action, targetUid }, (timeout: Error | null, result: { ok: boolean, error?: string }) => {
        if (timeout || !result?.ok) signal.emit('officeFeedback', { message: result?.error ?? 'Não foi possível concluir a ação.' })
    })
}

function raiseHand(raised: boolean) {
    server.socket.timeout(8000).emit('meetingRaiseHand', { raised }, (timeout: Error | null, result: { ok: boolean, error?: string }) => {
        if (timeout || !result?.ok) signal.emit('officeFeedback', { message: result?.error ?? 'Não foi possível enviar o pedido.' })
    })
}

function RaisedHand({ uid }: { uid: string }) {
    const { name } = usePeerProfile(uid)
    return <li className='flex items-center justify-between gap-2'>
        <span className='truncate'>{name}</span>
        <button type='button' onClick={() => moderate('allow', uid)} className='rounded bg-teal-500 px-2 py-0.5 text-xs font-semibold text-slate-950 hover:bg-teal-400'>Liberar</button>
    </li>
}

// Training-room meeting controls: stage moderators get the panel; others get "Pedir para falar" while locked.
export default function MeetingControls({ localUid }: { localUid: string }) {
    const meeting = useMeeting()
    if (!meeting) return null
    if (isModerator(localUid)) return <div className='pointer-events-auto w-72 max-w-[calc(100vw-24px)] space-y-2 rounded-xl bg-slate-950/90 p-3 text-xs text-white shadow-xl'>
        <p className='font-semibold'>Você está no palco: é o apresentador.</p>
        <div className='flex gap-2'>
            <button type='button' onClick={() => moderate('muteAll')} className='flex-1 rounded bg-slate-700 px-2 py-1.5 hover:bg-slate-600'>Silenciar todos</button>
            <button type='button' onClick={() => moderate(meeting.locked ? 'unlock' : 'lock')} className={`flex-1 rounded px-2 py-1.5 ${meeting.locked ? 'bg-rose-700 hover:bg-rose-600' : 'bg-slate-700 hover:bg-slate-600'}`}>{meeting.locked ? 'Liberar microfones' : 'Bloquear microfones'}</button>
        </div>
        {meeting.raised.length > 0 && <div>
            <p className='mb-1 text-white/70'>Pedidos para falar</p>
            <ul className='space-y-1'>{meeting.raised.map(uid => <RaisedHand key={uid} uid={uid} />)}</ul>
        </div>}
    </div>
    if (!meeting.locked) return null
    const allowed = meeting.allowed.includes(localUid)
    const raised = meeting.raised.includes(localUid)
    return <div className='pointer-events-auto w-72 max-w-[calc(100vw-24px)] space-y-2 rounded-xl bg-slate-950/90 p-3 text-xs text-white shadow-xl'>
        <p>{allowed ? 'O apresentador liberou seu microfone.' : 'O apresentador bloqueou os microfones.'}</p>
        {!allowed && <button type='button' onClick={() => raiseHand(!raised)} className='w-full rounded bg-teal-500 px-2 py-1.5 font-semibold text-slate-950 hover:bg-teal-400'>{raised ? 'Cancelar pedido' : 'Pedir para falar'}</button>}
    </div>
}
