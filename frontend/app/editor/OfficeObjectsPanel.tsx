'use client'

import { useEffect, useState } from 'react'
import signal from '@/utils/signal'
import type { OfficeObject, RealmData } from '@/utils/pixi/types'
import { OfficeObjectSchema } from '@/utils/pixi/zod'

type Kind = OfficeObject['kind']
const kinds: { value: Kind, label: string }[] = [
    { value: 'external', label: 'Quadro ou jogo externo' },
    { value: 'presentation', label: 'Apresentação' },
    { value: 'speaker', label: 'Caixa de som' },
    { value: 'pet', label: 'Pet' },
    { value: 'light', label: 'Luz' },
    { value: 'guide', label: 'Guia' },
    { value: 'seat', label: 'Assento' },
    { value: 'desk', label: 'Estação' },
    { value: 'board', label: 'Quadro de recados' },
    { value: 'guestbook', label: 'Livro de visitas' },
    { value: 'drink', label: 'Bebida' },
    { value: 'snack', label: 'Lanche' },
    { value: 'pingpong', label: 'Pingue-pongue' },
]

function configFor(kind: Kind): OfficeObject['config'] {
    if (kind === 'external') return { url: 'https://miro.com/', allowedHosts: ['miro.com'], roomEditable: true }
    if (kind === 'presentation') return { deckId: 'apresentacao-matte' }
    if (kind === 'speaker') return { rangeTiles: 7 }
    if (kind === 'pet') return { animationSet: 'gato-matte' }
    if (kind === 'light') return { radiusTiles: 5, color: '#fff2bb', intensity: 0.6 }
    return undefined
}

function newObject(point: { x: number, y: number }): OfficeObject {
    return {
        id: `objeto-${Date.now().toString(36)}`,
        kind: 'external', label: 'Novo quadro',
        bounds: { x: point.x, y: point.y, width: 1, height: 1 },
        approach: { x: point.x, y: point.y },
        config: configFor('external'),
    }
}

export default function OfficeObjectsPanel({ realmData, roomIndex }: { realmData: RealmData, roomIndex: number }) {
    const [objects, setObjects] = useState<OfficeObject[]>(realmData.rooms[roomIndex]?.interactions ?? [])
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [draft, setDraft] = useState<OfficeObject | null>(null)
    const [cursor, setCursor] = useState({ x: 0, y: 0 })
    const [error, setError] = useState('')

    useEffect(() => {
        const onObjects = (next: OfficeObject[]) => setObjects(next)
        const onCursor = (point: { x: number, y: number }) => setCursor(point)
        const onError = (message: string) => setError(message)
        const onSaved = (id: string) => { setSelectedId(id); setError(''); setDraft(null) }
        const onRoomChanged = () => { setSelectedId(null); setDraft(null); setError('') }
        signal.on('officeObjectsChanged', onObjects)
        signal.on('coordinates', onCursor)
        signal.on('officeObjectError', onError)
        signal.on('officeObjectSaved', onSaved)
        signal.on('roomChanged', onRoomChanged)
        return () => {
            signal.off('officeObjectsChanged', onObjects)
            signal.off('coordinates', onCursor)
            signal.off('officeObjectError', onError)
            signal.off('officeObjectSaved', onSaved)
            signal.off('roomChanged', onRoomChanged)
        }
    }, [])

    const selected = objects.find(object => object.id === selectedId)
    const current = draft ?? selected ?? null
    const change = (patch: Partial<OfficeObject>) => { if (current) setDraft({ ...current, ...patch }) }
    const changeBounds = (key: keyof OfficeObject['bounds'], value: number) => {
        if (current) change({ bounds: { ...current.bounds, [key]: value } })
    }
    const changeApproach = (key: 'x' | 'y', value: number) => {
        if (current) change({ approach: { ...current.approach, [key]: value } })
    }
    const changeConfig = (patch: Record<string, unknown>) => {
        if (current) change({ config: { ...current.config, ...patch } as OfficeObject['config'] })
    }
    const save = () => {
        if (!current) return
        const parsed = OfficeObjectSchema.safeParse(current)
        if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Objeto inválido.'); return }
        setError('')
        signal.emit('upsertOfficeObject', parsed.data)
    }

    return <div className="h-[calc(100vh-100px)] overflow-y-auto p-3 text-sm text-white">
        <p className="mb-2 text-slate-300">Escolha um objeto ou crie um no tile sob o cursor. Arraste o mapa com o botão direito.</p>
        <button type="button" onClick={() => { const object = newObject(cursor); setSelectedId(null); setDraft(object); setError('') }} className="mb-3 w-full rounded bg-teal-400 px-3 py-2 font-semibold text-slate-950">Adicionar objeto</button>
        <div className="mb-4 max-h-32 overflow-y-auto rounded border border-slate-600">
            {objects.length === 0 && <p className="p-2 text-slate-400">Nenhum objeto nesta sala.</p>}
            {objects.map(object => <button key={object.id} type="button" onClick={() => { setSelectedId(object.id); setDraft(null); setError('') }} className={`block w-full truncate px-2 py-1.5 text-left hover:bg-slate-700 ${selectedId === object.id ? 'bg-teal-900' : ''}`}>{object.label} <span className="text-slate-400">· {object.id}</span></button>)}
        </div>
        {current && <div className="space-y-3">
            <label className="block">ID<input value={current.id} disabled={Boolean(selected)} onChange={event => change({ id: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} className="mt-1 w-full rounded bg-slate-800 px-2 py-1 disabled:opacity-60" /></label>
            <label className="block">Nome<input value={current.label} onChange={event => change({ label: event.target.value })} className="mt-1 w-full rounded bg-slate-800 px-2 py-1" /></label>
            <label className="block">Tipo<select value={current.kind} onChange={event => { const kind = event.target.value as Kind; change({ kind, config: configFor(kind), seatVisual: undefined, effect: undefined }) }} className="mt-1 w-full rounded bg-slate-800 px-2 py-1">{kinds.map(kind => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select></label>
            <fieldset className="grid grid-cols-2 gap-2"><legend className="mb-1">Área no mapa</legend>
                {(['x', 'y', 'width', 'height'] as const).map(key => <label key={key}>{key}<input type="number" value={current.bounds[key]} onChange={event => changeBounds(key, Number(event.target.value))} className="w-full rounded bg-slate-800 px-2 py-1" /></label>)}
                <button type="button" onClick={() => change({ bounds: { ...current.bounds, x: cursor.x, y: cursor.y } })} className="col-span-2 rounded bg-slate-700 px-2 py-1">Usar cursor na área</button>
            </fieldset>
            <fieldset className="grid grid-cols-2 gap-2"><legend className="mb-1">Ponto de aproximação</legend>
                {(['x', 'y'] as const).map(key => <label key={key}>{key}<input type="number" value={current.approach[key]} onChange={event => changeApproach(key, Number(event.target.value))} className="w-full rounded bg-slate-800 px-2 py-1" /></label>)}
                <button type="button" onClick={() => change({ approach: { ...cursor } })} className="col-span-2 rounded bg-slate-700 px-2 py-1">Usar cursor como aproximação</button>
            </fieldset>
            {current.kind === 'external' && current.config && 'url' in current.config && <>
                <label className="block">URL HTTPS<input type="url" value={current.config.url} onChange={event => changeConfig({ url: event.target.value })} className="mt-1 w-full rounded bg-slate-800 px-2 py-1" /></label>
                <label className="block">Domínios permitidos, separados por vírgula<input value={current.config.allowedHosts.join(', ')} onChange={event => changeConfig({ allowedHosts: event.target.value.split(',').map(host => host.trim()).filter(Boolean) })} className="mt-1 w-full rounded bg-slate-800 px-2 py-1" /></label>
                <label className="flex gap-2"><input type="checkbox" checked={current.config.roomEditable} onChange={event => changeConfig({ roomEditable: event.target.checked })} /> Permitir mudar a sala compartilhada</label>
            </>}
            {current.kind === 'presentation' && current.config && 'deckId' in current.config && <label className="block">ID da apresentação<input value={current.config.deckId} onChange={event => changeConfig({ deckId: event.target.value })} className="mt-1 w-full rounded bg-slate-800 px-2 py-1" /></label>}
            {current.kind === 'speaker' && current.config && 'rangeTiles' in current.config && <label className="block">Raio de áudio em tiles<input type="number" value={current.config.rangeTiles} onChange={event => changeConfig({ rangeTiles: Number(event.target.value) })} className="mt-1 w-full rounded bg-slate-800 px-2 py-1" /></label>}
            {current.kind === 'pet' && current.config && 'animationSet' in current.config && <label className="block">Conjunto de animação<input value={current.config.animationSet} onChange={event => changeConfig({ animationSet: event.target.value })} className="mt-1 w-full rounded bg-slate-800 px-2 py-1" /></label>}
            {current.kind === 'light' && current.config && 'radiusTiles' in current.config && <div className="grid grid-cols-2 gap-2"><label>Raio<input type="number" value={current.config.radiusTiles} onChange={event => changeConfig({ radiusTiles: Number(event.target.value) })} className="w-full rounded bg-slate-800 px-2 py-1" /></label><label>Cor<input type="color" value={current.config.color} onChange={event => changeConfig({ color: event.target.value })} className="w-full" /></label><label className="col-span-2">Intensidade<input type="range" min="0" max="1" step="0.1" value={current.config.intensity} onChange={event => changeConfig({ intensity: Number(event.target.value) })} className="w-full" /></label></div>}
            {(current.kind === 'drink' || current.kind === 'snack') && <label className="block">Efeito<select value={current.effect ?? (current.kind === 'drink' ? 'water' : 'snack')} onChange={event => change({ effect: event.target.value as OfficeObject['effect'] })} className="mt-1 w-full rounded bg-slate-800 px-2 py-1"><option value="water">Água</option><option value="coffee">Café</option><option value="snack">Lanche</option></select></label>}
            {(current.kind === 'seat' || current.kind === 'desk') && <div className="grid grid-cols-3 gap-2"><label>Assento X<input type="number" value={current.seatVisual?.x ?? current.bounds.x} onChange={event => change({ seatVisual: { x: Number(event.target.value), y: current.seatVisual?.y ?? current.bounds.y, facing: current.seatVisual?.facing ?? 'down' } })} className="w-full rounded bg-slate-800 px-2 py-1" /></label><label>Assento Y<input type="number" value={current.seatVisual?.y ?? current.bounds.y} onChange={event => change({ seatVisual: { x: current.seatVisual?.x ?? current.bounds.x, y: Number(event.target.value), facing: current.seatVisual?.facing ?? 'down' } })} className="w-full rounded bg-slate-800 px-2 py-1" /></label><label>Direção<select value={current.seatVisual?.facing ?? 'down'} onChange={event => change({ seatVisual: { x: current.seatVisual?.x ?? current.bounds.x, y: current.seatVisual?.y ?? current.bounds.y, facing: event.target.value as 'up' | 'down' | 'left' | 'right' } })} className="w-full rounded bg-slate-800 px-2 py-1"><option value="down">Baixo</option><option value="up">Cima</option><option value="left">Esquerda</option><option value="right">Direita</option></select></label></div>}
            {error && <p role="alert" className="text-red-300">{error}</p>}
            <div className="flex gap-2"><button type="button" onClick={save} className="grow rounded bg-teal-400 px-3 py-2 font-semibold text-slate-950">Salvar objeto</button>{selected && <button type="button" onClick={() => { signal.emit('deleteOfficeObject', selected.id); setSelectedId(null); setDraft(null) }} className="rounded bg-red-900 px-3 py-2">Excluir</button>}</div>
        </div>}
    </div>
}
