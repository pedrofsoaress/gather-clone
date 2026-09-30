'use client'

import { useEffect, useRef, useState } from 'react'
import signal from '@/utils/signal'
import { enqueueNotice, notificationCanSound } from '@/utils/pixi/office/notifications.mjs'

type Notice = { id: string, key: string, message: string, kind: string, expiresAt: number }
type GamepadLegend = { connected: boolean, name?: string, actionLabel?: string, backLabel?: string, danceLabel?: string, runLabel?: string }
const SOUND_KEY = 'matte.office.noticeSound'

export default function OfficeNotifications({ meetingMode = false }: { meetingMode?: boolean }) {
    const [notices, setNotices] = useState<Notice[]>([])
    const [soundEnabled, setSoundEnabled] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [gamepad, setGamepad] = useState<GamepadLegend>({ connected: false })
    const sound = useRef(false)
    const busy = useRef({ call: false, presentation: false })
    const audio = useRef<AudioContext | null>(null)
    const lastTone = useRef(0)

    useEffect(() => {
        try { sound.current = localStorage.getItem(SOUND_KEY) === 'true'; setSoundEnabled(sound.current) } catch { /* Preferences remain local when storage is unavailable. */ }
        const onNotice = (notice: { message: string, key?: string, kind?: string }) => {
            if (!notice?.message) return
            setNotices(current => enqueueNotice(current, notice))
            const canSound = notificationCanSound({ enabled: sound.current, hidden: document.hidden, busy: busy.current.call || busy.current.presentation })
            const context = audio.current
            if (!canSound || !context || context.state !== 'running' || Date.now() - lastTone.current < 1500) return
            lastTone.current = Date.now()
            const oscillator = context.createOscillator()
            const gain = context.createGain()
            oscillator.type = 'sine'
            oscillator.frequency.setValueAtTime(660, context.currentTime)
            gain.gain.setValueAtTime(0.025, context.currentTime)
            gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.16)
            oscillator.connect(gain).connect(context.destination)
            oscillator.start()
            oscillator.stop(context.currentTime + 0.17)
            oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
        }
        const onFocus = ({ active }: { active: boolean }) => { busy.current.presentation = active }
        const onBusy = (active: boolean) => { busy.current.call = active }
        const onGamepad = (legend: GamepadLegend) => setGamepad(legend)
        const unlockSound = () => {
            if (!sound.current) return
            try {
                audio.current ??= new AudioContext()
                if (audio.current.state === 'suspended') void audio.current.resume().catch(() => {})
            } catch { /* Keep visual notices in browsers without Web Audio. */ }
        }
        window.addEventListener('pointerdown', unlockSound)
        window.addEventListener('keydown', unlockSound)
        signal.on('officeNotice', onNotice)
        signal.on('officeFeedback', onNotice)
        signal.on('officePresentationFocus', onFocus)
        signal.on('officeAudioBusy', onBusy)
        signal.on('officeGamepad', onGamepad)
        const timer = window.setInterval(() => setNotices(current => current.some(item => item.expiresAt <= Date.now()) ? current.filter(item => item.expiresAt > Date.now()) : current), 500)
        return () => {
            signal.off('officeNotice', onNotice)
            signal.off('officeFeedback', onNotice)
            signal.off('officePresentationFocus', onFocus)
            signal.off('officeAudioBusy', onBusy)
            signal.off('officeGamepad', onGamepad)
            window.clearInterval(timer)
            window.removeEventListener('pointerdown', unlockSound)
            window.removeEventListener('keydown', unlockSound)
            void audio.current?.close()
            audio.current = null
        }
    }, [])

    const changeSound = async () => {
        const enabled = !sound.current
        sound.current = enabled
        setSoundEnabled(enabled)
        try { localStorage.setItem(SOUND_KEY, String(enabled)) } catch { /* Nonpersistent preferences still work. */ }
        if (enabled) {
            try {
                audio.current ??= new AudioContext()
                await audio.current.resume()
            } catch { signal.emit('officeNotice', { message: 'Os avisos continuam visuais. Este navegador não liberou o som.' }) }
        } else if (audio.current) await audio.current.suspend()
    }

    return <div className={`pointer-events-none absolute bottom-32 left-3 w-[calc(100vw_-_1.5rem)] max-w-sm space-y-2 ${meetingMode ? 'z-40' : 'z-20'}`}>
        <div aria-live="polite" aria-relevant="additions" className="space-y-2">
            {notices.map(notice => <div key={notice.id} className="pointer-events-auto flex items-start gap-3 rounded-xl border border-slate-600/70 bg-slate-950/95 px-3 py-2 text-sm text-white shadow-lg">
                <p className="flex-1 break-words">{notice.message}</p>
                <button type="button" aria-label="Dispensar aviso" className="rounded px-1 text-slate-400 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300" onClick={() => setNotices(current => current.filter(item => item.id !== notice.id))}>×</button>
            </div>)}
        </div>
        {gamepad.connected && <p className="rounded-lg bg-slate-950/85 px-3 py-2 text-xs text-slate-200">Controle · Analógico/D-pad mover · {gamepad.actionLabel} interagir · {gamepad.backLabel} fechar · {gamepad.danceLabel} dançar · {gamepad.runLabel} correr</p>}
        {settingsOpen && <section aria-label="Preferências de avisos" className="pointer-events-auto rounded-xl border border-slate-600 bg-slate-950 p-3 text-sm text-white shadow-lg">
            <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={soundEnabled} onChange={() => void changeSound()} className="accent-teal-400" />Tocar som nos avisos</label>
            <p className="mt-2 text-xs text-slate-400">O som pausa durante chamadas, apresentações e quando você sai desta aba.</p>
        </section>}
        <button type="button" aria-label="Preferências de avisos" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(open => !open)} className="pointer-events-auto rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300">{soundEnabled ? '♪ Avisos' : 'Avisos silenciosos'}</button>
    </div>
}
