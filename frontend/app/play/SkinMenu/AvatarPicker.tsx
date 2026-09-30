import React, { useState } from 'react'
import { skins, defaultSkin } from '@/utils/pixi/Player/skins'

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

export default function AvatarPicker({ value, onChange, disabled }: AvatarPickerProps) {
    const [showAll, setShowAll] = useState(false)
    const selected = skins.includes(value) ? value : defaultSkin
    const index = skins.indexOf(selected)
    const step = (direction: number) => onChange(skins[(index + direction + skins.length) % skins.length])
    const arrowClass = 'grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-slate-600 text-3xl text-slate-100 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300 disabled:opacity-50'

    return <fieldset disabled={disabled} className='w-full min-w-0'>
        <legend className='mb-2 text-sm font-medium text-slate-200'>Escolha seu boneco</legend>
        <div className='flex items-center justify-between rounded-xl border border-[#3f4776] bg-[#1b203b] px-4'>
            <button type='button' aria-label='Boneco anterior' onClick={() => step(-1)} className={arrowClass}>‹</button>
            <div className='flex flex-col items-center pb-3'>
                <span role='img' aria-label={`Prévia do boneco ${index + 1}`} style={characterStyle(selected, 112)} />
                <span aria-live='polite' className='text-xs text-slate-300'>Boneco {index + 1} de {skins.length}</span>
            </div>
            <button type='button' aria-label='Próximo boneco' onClick={() => step(1)} className={arrowClass}>›</button>
        </div>
        <button type='button' aria-expanded={showAll} aria-controls='office-avatar-options' onClick={() => setShowAll(!showAll)}
            className='mt-2 w-full rounded-md py-2 text-sm text-[#cad8ff] underline underline-offset-4 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300'>
            {showAll ? 'Fechar lista de bonecos' : `Ver todos os ${skins.length} bonecos`}
        </button>
        {showAll && <div id='office-avatar-options' role='group' aria-label='Todos os bonecos'
            className='mt-2 grid max-h-44 grid-cols-6 gap-1 overflow-y-auto overscroll-contain rounded-lg border border-[#3f4776] bg-[#13182d] p-2'>
            {skins.map((skin, skinIndex) => <button key={skin} type='button' aria-label={`Selecionar boneco ${skinIndex + 1}`}
                aria-pressed={selected === skin} title={`Boneco ${skinIndex + 1}`} onClick={() => onChange(skin)}
                className={`grid min-h-11 place-items-center rounded-md border focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${selected === skin ? 'border-teal-300 bg-teal-300/20' : 'border-transparent hover:bg-slate-700'}`}>
                <span aria-hidden='true' style={characterStyle(skin, 40)} />
            </button>)}
        </div>}
    </fieldset>
}
