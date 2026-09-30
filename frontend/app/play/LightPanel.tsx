'use client'

import { useState } from 'react'
import type { OfficeObject } from '@/utils/pixi/types'
import signal from '@/utils/signal'
import { isLightEnabled, saveLightPreference } from '@/utils/pixi/office/light-preferences'

export default function LightPanel({ object }: { object: OfficeObject }) {
    const [enabled, setEnabled] = useState(() => isLightEnabled(object.id))
    return <div className="mt-4 space-y-3">
        <p className="text-sm text-slate-300">Ajuste esta luz para você. Durante uma apresentação, a iluminação fica suave e volta ao terminar.</p>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-slate-800 p-3">
            <input type="checkbox" className="h-5 w-5 accent-teal-400" checked={enabled} onChange={event => {
                const next = event.target.checked
                setEnabled(next)
                saveLightPreference(object.id, next)
                signal.emit('officeLightPreference', { objectId: object.id, enabled: next })
            }} />Luz {enabled ? 'acesa' : 'apagada'}
        </label>
    </div>
}
