'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { ChatCircleDots, PaperPlaneTilt, X } from '@phosphor-icons/react'
import signal from '@/utils/signal'
import { server } from '@/utils/backend/server'

type Channel = 'public' | 'nearby'
type ChatMessage = { id: string, channel: Channel, text: string, uid: string, name: string, sentAt: number }

export default function OfficeChat({ uid, meetingMode = false }: { uid: string, meetingMode?: boolean }) {
    const [open, setOpen] = useState(false)
    const [channel, setChannel] = useState<Channel>('public')
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [draft, setDraft] = useState('')
    const [feedback, setFeedback] = useState('')
    const [sending, setSending] = useState(false)
    const [unread, setUnread] = useState(0)
    const endRef = useRef<HTMLDivElement>(null)
    const openRef = useRef(open)
    const channelRef = useRef(channel)
    openRef.current = open
    channelRef.current = channel

    useEffect(() => {
        if (meetingMode) {
            if (window.matchMedia('(min-width: 640px)').matches) setOpen(true)
            setChannel('nearby')
        }
    }, [meetingMode])

    useEffect(() => {
        const attach = () => {
            const socket = server.socket
            const receive = (message: ChatMessage) => {
                setMessages(previous => [...previous.slice(-99), message])
                if (!openRef.current || channelRef.current !== message.channel) setUnread(count => count + 1)
            }
            socket.on('receiveChatMessage', receive)
            return () => socket.off('receiveChatMessage', receive)
        }
        let detach: (() => void) | undefined
        const onReady = () => { detach?.(); detach = attach() }
        signal.on('officeReady', onReady)
        if (server.socket.connected) onReady()
        return () => { signal.off('officeReady', onReady); detach?.() }
    }, [])

    useEffect(() => { if (open) { setUnread(0); endRef.current?.scrollIntoView({ block: 'end' }) } }, [open, channel, messages])
    useEffect(() => { signal.emit('disableInput', open) }, [open])

    const send = (event: FormEvent) => {
        event.preventDefault()
        const text = draft.trim()
        if (!text || sending) return
        if (!server.socket.connected) { setFeedback('Aguardando conexão com o escritório.'); return }
        setSending(true)
        setFeedback('')
        server.socket.timeout(8000).emit('sendChatMessage', { channel, text }, (timeout: Error | null, result: { ok: boolean, error?: string }) => {
            setSending(false)
            if (timeout || !result?.ok) setFeedback(result?.error || 'Não foi possível enviar a mensagem.')
            else setDraft('')
        })
    }
    const visible = messages.filter(message => message.channel === channel)

    return <div className={meetingMode && open ? 'absolute bottom-14 right-0 top-0 z-40 w-full font-sans text-white sm:w-[340px]' : meetingMode ? 'absolute bottom-16 right-3 z-40 font-sans text-white' : 'absolute bottom-16 left-3 z-20 font-sans text-white'}>
        {!open && <button type="button" onClick={() => setOpen(true)} aria-label="Abrir chat" className="flex items-center gap-2 rounded-xl border border-teal-300/40 bg-slate-950/90 px-4 py-3 shadow-xl hover:bg-slate-800">
            <ChatCircleDots size={22} /> Chat {unread > 0 && <span className="rounded-full bg-teal-400 px-2 text-xs font-bold text-slate-950">{unread}</span>}
        </button>}
        {open && <section aria-label="Chat do escritório" className={meetingMode ? 'flex h-full w-full flex-col overflow-hidden border-l border-slate-700 bg-[#202743] shadow-2xl' : 'flex h-[min(440px,65vh)] w-[min(370px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-teal-300/40 bg-slate-950/95 shadow-2xl'}>
            <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3"><strong>Conversas</strong><button type="button" aria-label="Fechar chat" onClick={() => setOpen(false)}><X size={20}/></button></div>
            <div className="flex border-b border-slate-700" role="tablist" aria-label="Canal do chat">
                {(['public', 'nearby'] as const).map(option => <button key={option} type="button" role="tab" aria-selected={channel === option} onClick={() => { setChannel(option); setFeedback('') }} className={`flex-1 px-3 py-2 text-sm ${channel === option ? 'border-b-2 border-teal-400 bg-slate-800 font-semibold' : 'text-slate-300 hover:bg-slate-800'}`}>{option === 'public' ? 'Público' : 'Por perto'}</button>)}
            </div>
            <p className="px-4 pt-2 text-xs text-slate-400">{channel === 'public' ? 'Todos no escritório recebem.' : 'Só pessoas a até 6 passos de você recebem.'}</p>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3" role="log" aria-live="polite">
                {visible.length === 0 && <p className="text-sm text-slate-400">Ainda não há mensagens neste canal.</p>}
                {visible.map(message => <div key={message.id} className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${message.uid === uid ? 'ml-auto bg-teal-700/70' : 'bg-slate-800'}`}><div className="mb-1 flex justify-between gap-3 text-xs text-teal-200"><strong className="truncate">{message.name}</strong><time dateTime={new Date(message.sentAt).toISOString()}>{new Date(message.sentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time></div><p className="break-words whitespace-pre-wrap">{message.text}</p></div>)}
                <div ref={endRef}/>
            </div>
            {feedback && <p role="status" className="px-4 pb-2 text-xs text-amber-300">{feedback}</p>}
            <form onSubmit={send} className="flex gap-2 border-t border-slate-700 p-3"><input aria-label={`Mensagem no chat ${channel === 'public' ? 'público' : 'por perto'}`} value={draft} onChange={event => setDraft(event.target.value)} maxLength={300} placeholder="Escreva uma mensagem..." className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm outline-none focus:border-teal-400"/><button type="submit" disabled={!draft.trim() || sending} aria-label="Enviar mensagem" className="rounded-lg bg-teal-400 px-3 text-slate-950 disabled:opacity-50"><PaperPlaneTilt size={18}/></button></form>
        </section>}
    </div>
}
