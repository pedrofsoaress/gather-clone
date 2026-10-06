import React, { useEffect, useRef, type KeyboardEvent } from 'react'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { skins, defaultSkin, stepSkin } from '@/utils/pixi/Player/skins'

type AvatarPickerProps = {
    value: string
    onChange: (skin: string) => void
    disabled?: boolean
}

function characterStyle(skin: string, size: number): React.CSSProperties {
    return {
        width: size, height: size, imageRendering: 'pixelated',
        backgroundImage: `url(/sprites/characters/Character_${skin}.png)`,
        backgroundSize: '400% 400%', backgroundPosition: '33.333333% 0%',
    }
}

const arrowClass = 'grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/15 text-white transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50'

export default function AvatarPicker({ value, onChange, disabled }: AvatarPickerProps) {
    const selected = skins.includes(value) ? value : defaultSkin
    const index = skins.indexOf(selected)
    const grid = useRef<HTMLDivElement>(null)

    // Keep the chosen avatar visible in the grid (also on load, for a saved avatar
    // low in the list). Only the grid scrolls, never the page. The grid is
    // `relative`, so it is the buttons' offsetParent and offsetTop is grid-relative.
    useEffect(() => {
        const container = grid.current
        const button = container?.querySelector<HTMLElement>('[aria-pressed="true"]')
        if (!container || !button) return
        const top = button.offsetTop
        if (top < container.scrollTop) container.scrollTop = Math.max(0, top - 8)
        else if (top + button.offsetHeight > container.scrollTop + container.clientHeight) container.scrollTop = top + button.offsetHeight - container.clientHeight + 8
    }, [selected])

    // The grid is a single Tab stop; arrow keys move the choice inside it.
    const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return
        const buttons = Array.from(grid.current?.querySelectorAll<HTMLElement>('button') ?? [])
        const columns = buttons.filter(button => button.offsetTop === buttons[0]?.offsetTop).length || 1
        const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }
        const move = moves[event.key]
        if (move === undefined) return
        event.preventDefault()
        const next = Math.min(skins.length - 1, Math.max(0, index + move))
        onChange(skins[next])
        buttons[next]?.focus({ preventScroll: true })
    }

    return <fieldset disabled={disabled} className='w-full min-w-0'>
        <legend className='mb-3 text-sm font-semibold text-white'>Escolha seu boneco</legend>
        <div className='flex items-center justify-between gap-3'>
            <button type='button' aria-label='Boneco anterior' onClick={() => onChange(stepSkin(selected, -1))} className={arrowClass}><CaretLeft size={20} weight='bold' /></button>
            <div className='relative grid h-36 min-w-0 flex-1 place-items-center'>
                <div aria-hidden='true' className='absolute bottom-4 h-6 w-28 rounded-[50%] bg-matte-pink/35 blur-md' />
                <span role='img' aria-label={`Prévia do boneco ${index + 1}`} style={characterStyle(selected, 120)} className='relative' />
            </div>
            <button type='button' aria-label='Próximo boneco' onClick={() => onChange(stepSkin(selected, 1))} className={arrowClass}><CaretRight size={20} weight='bold' /></button>
        </div>
        <p aria-live='polite' className='mt-1 text-center text-xs text-white/60'>Boneco {index + 1} de {skins.length}</p>
        <p id='office-avatar-hint' className='sr-only'>Use as setas do teclado para trocar de boneco.</p>
        <div ref={grid} id='office-avatar-options' role='group' aria-label='Todos os bonecos' aria-describedby='office-avatar-hint' onKeyDown={onGridKeyDown}
            className='relative mt-4 grid max-h-48 grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5 overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-black/30 p-2'>
            {skins.map((skin, skinIndex) => <button key={skin} type='button' aria-label={`Selecionar boneco ${skinIndex + 1}`}
                tabIndex={selected === skin ? 0 : -1}
                aria-pressed={selected === skin} title={`Boneco ${skinIndex + 1}`} onClick={() => onChange(skin)}
                className={`grid aspect-square min-h-11 place-items-center rounded-lg border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${selected === skin ? 'border-matte-pink bg-matte-pink/20' : 'border-transparent hover:bg-white/10'}`}>
                <span aria-hidden='true' style={characterStyle(skin, 36)} />
            </button>)}
        </div>
    </fieldset>
}
