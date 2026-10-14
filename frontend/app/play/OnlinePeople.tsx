'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from '@phosphor-icons/react'
import signal from '@/utils/signal'
import { otherFloorNotice, parsePresence, placeLabel, sortPresence, type PresenceEntry } from './presence'

type RoomInfo = { name: string, areas?: Record<string, { label: string }> }

// The latest list of who is online (any floor), pushed by the office whenever someone
// arrives, leaves, or changes floor or area. Null until the first list arrives.
export function usePresence(): PresenceEntry[] | null {
    const [presence, setPresence] = useState<PresenceEntry[] | null>(null)
    useEffect(() => {
        const onPresence = (value: unknown) => {
            const parsed = parsePresence(value)
            if (parsed) setPresence(parsed)
        }
        signal.on('officePresence', onPresence)
        return () => signal.off('officePresence', onPresence)
    }, [])
    return presence
}

// The toolbar button: a green dot and how many people are in the office.
export function OnlineCounter({ count, open, onToggle }: { count: number | null, open: boolean, onToggle: () => void }) {
    const label = count === null ? 'Pessoas online' : `${count} ${count === 1 ? 'pessoa' : 'pessoas'} online`
    return <button type='button' onClick={onToggle} aria-expanded={open} aria-controls='online-people' aria-label={label} title='Quem está online'
        className={`flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm text-white outline-none hover:bg-light-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300 sm:gap-2 sm:px-3 ${open ? 'bg-light-secondary' : 'bg-secondary'}`}>
        <span aria-hidden='true' className='h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.2)]' />
        <span className='tabular-nums'>{count ?? '…'}</span>
        <span className='hidden sm:inline'>online</span>
    </button>
}

type PanelProps = {
    presence: PresenceEntry[] | null
    uid: string
    rooms: RoomInfo[]
    meetingMode: boolean
    onClose: () => void
}

// "Quem está online": everyone in the office, where they are, and "Seguir" for people on the same floor.
export function OnlinePeoplePanel({ presence, uid, rooms, meetingMode, onClose }: PanelProps) {
    const people = sortPresence(presence ?? [], uid)
    const self = people.find(person => person.uid === uid)
    const [status, setStatus] = useState<string | null>(null)
    const statusTimer = useRef<number | undefined>(undefined)
    useEffect(() => () => window.clearTimeout(statusTimer.current), [])

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    const follow = (person: PresenceEntry) => {
        // Following starts on the same floor only: for someone elsewhere the list says where they are,
        // inside the panel so it is never hidden behind it.
        if (self && person.room !== self.room) {
            setStatus(otherFloorNotice(person.name, rooms, person.room))
            window.clearTimeout(statusTimer.current)
            statusTimer.current = window.setTimeout(() => setStatus(null), 5000)
            return
        }
        signal.emit('followStart', { uid: person.uid })
        onClose()
    }

    // Bottom right, above the toolbar: the chat and the notices live on the left, the call strip at the top
    // (the height stops below it). In the expanded call it sits above the chat button. On a phone it spans
    // the width above the chat button and the "Avisos" chip.
    return <section id='online-people' aria-label='Quem está online'
        className={`absolute inset-x-3 bottom-[168px] flex max-h-[min(420px,calc(100vh-380px))] flex-col overflow-hidden rounded-2xl border border-teal-300/40 bg-slate-950/95 font-sans text-white shadow-2xl sm:left-auto sm:w-80 ${meetingMode ? 'z-40 sm:bottom-[120px] sm:max-h-[min(420px,calc(100vh-200px))]' : 'z-30 sm:bottom-16 sm:max-h-[min(420px,calc(100vh-280px))]'}`}>
        <div className='flex items-center justify-between border-b border-slate-700 px-4 py-3'>
            <strong className='text-sm'>Quem está online{presence ? ` · ${presence.length}` : ''}</strong>
            <button type='button' aria-label='Fechar lista de pessoas online' onClick={onClose} className='rounded p-0.5 text-slate-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300'><X size={18} /></button>
        </div>
        {!presence && <p className='px-4 py-3 text-sm text-slate-400'>Carregando...</p>}
        {presence && <ul className='min-h-0 flex-1 divide-y divide-slate-800 overflow-y-auto'>
            {people.map(person => <li key={person.uid} className='flex items-center gap-3 px-4 py-2.5'>
                <span aria-hidden='true' className='h-2 w-2 shrink-0 rounded-full bg-emerald-400' />
                <div className='min-w-0 flex-1'>
                    <p className='truncate text-sm font-semibold' title={person.name}>{person.name}{person.uid === uid && <span className='font-normal text-slate-400'> (você)</span>}</p>
                    <p className='truncate text-xs text-slate-400'>{placeLabel(rooms, person)}</p>
                </div>
                {person.uid !== uid && <button type='button' onClick={() => follow(person)} aria-label={`Seguir ${person.name}`}
                    className='shrink-0 rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300'>Seguir</button>}
            </li>)}
        </ul>}
        <p role='status' className='border-t border-slate-700 px-4 py-2 text-xs text-amber-300 empty:hidden'>{status}</p>
    </section>
}
