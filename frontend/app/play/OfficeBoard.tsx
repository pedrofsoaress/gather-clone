'use client'

import { useEffect, useState, type FormEvent } from 'react'
import type { OfficeObject } from '@/utils/pixi/types'
import { server } from '@/utils/backend/server'

type OfficeNote = { id: string, objectId: string, author: string, body: string, createdAt: string }
type NotesResponse = { ok: boolean, error?: string, notes?: OfficeNote[] }

export default function OfficeBoard({ object }: { object: OfficeObject }) {
    const [notes, setNotes] = useState<OfficeNote[]>([])
    const [body, setBody] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const maxLength = object.kind === 'guestbook' ? 280 : 500

    useEffect(() => {
        let mounted = true
        setLoading(true)
        setError('')
        setNotes([])
        server.socket.timeout(8000).emit('officeReadNotes', { objectId: object.id }, (timeout: Error | null, response: NotesResponse) => {
            if (!mounted) return
            setLoading(false)
            if (timeout || !response?.ok) setError(response?.error || 'Não foi possível carregar os recados.')
            else setNotes(response.notes ?? [])
        })
        const onCreated = (note: OfficeNote) => {
            if (mounted && note.objectId === object.id) setNotes(current => [note, ...current.filter(item => item.id !== note.id)].slice(0, 100))
        }
        server.socket.on('officeNoteCreated', onCreated)
        return () => { mounted = false; server.socket.off('officeNoteCreated', onCreated) }
    }, [object.id])

    const submitNote = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (saving || !body.trim()) return
        setSaving(true)
        setError('')
        server.socket.timeout(8000).emit('officeAddNote', { objectId: object.id, body },
            (timeout: Error | null, response: { ok: boolean, error?: string }) => {
                setSaving(false)
                if (timeout || !response?.ok) setError(response?.error || 'Não foi possível salvar o recado.')
                else setBody('')
            })
    }

    return <div className="mt-4 border-t border-slate-700 pt-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-teal-300">{object.kind === 'guestbook' ? 'Livro de visitas' : 'Recados compartilhados'}</h3>
        <form onSubmit={submitNote} className="mt-3 space-y-2">
            <textarea value={body} maxLength={maxLength} onChange={event => setBody(event.target.value)}
                aria-label="Escrever recado" placeholder="Deixe um recado para a equipe…"
                className="min-h-24 w-full rounded-lg border border-slate-600 bg-slate-800 p-3 text-sm text-white outline-none focus:border-teal-300" />
            <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400">{body.length}/{maxLength}</span>
                <button type="submit" disabled={saving || !body.trim()}
                    className="rounded-lg bg-teal-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300">
                    {saving ? 'Salvando…' : 'Publicar'}
                </button>
            </div>
        </form>
        {error && <p role="alert" className="mt-2 text-sm text-rose-300">{error}</p>}
        <div aria-live="polite" className="mt-4 max-h-52 space-y-2 overflow-y-auto">
            {loading ? <p className="text-sm text-slate-400">Carregando recados…</p> : notes.length === 0 ? <p className="text-sm text-slate-400">Ainda não há recados aqui.</p> :
                notes.map(note => <article key={note.id} className="rounded-lg bg-slate-800 p-3 text-sm">
                    <div className="flex justify-between gap-2 text-xs text-slate-400">
                        <strong className="text-teal-200">{note.author}</strong>
                        <time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</time>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-slate-100">{note.body}</p>
                </article>)}
        </div>
    </div>
}
