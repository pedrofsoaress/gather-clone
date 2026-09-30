'use client'

import { useState } from 'react'
import { PresentationSlidesSchema } from '@/utils/pixi/zod'

type Slide = { title: string, body?: string, imageUrl?: string }

export default function PresentationDeckEditor({ slides, onChange }: { slides: Slide[], onChange: (slides: Slide[]) => void }) {
    const [error, setError] = useState('')
    const update = (index: number, patch: Partial<Slide>) => onChange(slides.map((slide, i) => i === index ? { ...slide, ...patch } : slide))
    const importDeck = async (file?: File) => {
        if (!file) return
        setError('')
        if (!file.name.toLowerCase().endsWith('.json') || file.size > 128_000) return setError('Escolha um arquivo JSON de até 128 KB.')
        try {
            const parsed = PresentationSlidesSchema.safeParse(JSON.parse(await file.text()))
            if (!parsed.success) return setError('O arquivo precisa conter uma lista de 1 a 40 slides com título, texto opcional e imagem HTTPS opcional.')
            onChange(parsed.data)
        } catch {
            setError('Não foi possível ler o arquivo JSON.')
        }
    }
    return <fieldset className="space-y-3 border-t border-slate-600 pt-3">
        <legend>Slides da apresentação</legend>
        <label className="block">Importar slides JSON (até 128 KB)<input type="file" accept=".json,application/json" onChange={event => { void importDeck(event.target.files?.[0]); event.target.value = '' }} className="mt-1 block w-full text-xs" /></label>
        <p className="text-xs text-slate-400">Formato: [{'{'}"title":"Título","body":"Texto","imageUrl":"https://..."{'}'}]. Os slides são salvos junto com o mapa do escritório.</p>
        {error && <p role="alert" className="text-red-300">{error}</p>}
        {slides.map((slide, index) => <div key={index} className="space-y-2 rounded border border-slate-600 p-2">
            <div className="flex justify-between"><strong>Slide {index + 1}</strong>{slides.length > 1 && <button type="button" onClick={() => onChange(slides.filter((_, i) => i !== index))} className="text-red-300">Remover</button>}</div>
            <label className="block">Título<input value={slide.title} onChange={event => update(index, { title: event.target.value })} className="mt-1 w-full rounded bg-slate-800 px-2 py-1" /></label>
            <label className="block">Texto<textarea value={slide.body ?? ''} onChange={event => update(index, { body: event.target.value })} rows={3} className="mt-1 w-full rounded bg-slate-800 px-2 py-1" /></label>
            <label className="block">Imagem HTTPS (opcional)<input type="url" value={slide.imageUrl ?? ''} onChange={event => update(index, { imageUrl: event.target.value || undefined })} className="mt-1 w-full rounded bg-slate-800 px-2 py-1" /></label>
        </div>)}
        {slides.length < 40 && <button type="button" onClick={() => onChange([...slides, { title: `Slide ${slides.length + 1}` }])} className="rounded bg-slate-700 px-3 py-2">Adicionar slide</button>}
    </fieldset>
}
