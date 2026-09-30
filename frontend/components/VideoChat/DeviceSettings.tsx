'use client'

import { useEffect, useRef, useState } from 'react'
import { videoChat } from '@/utils/video-chat/video-chat'
import type { MediaPreferences } from '@/utils/video-chat/AudioPreference'
import signal from '@/utils/signal'
import { setOfficeInputLock } from '@/utils/pixi/office/input-locks'

type DeviceKind = 'audioinput' | 'videoinput' | 'audiooutput'

export default function DeviceSettings({ onClose }: { onClose: () => void }) {
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
    const [preferences, setPreferences] = useState<MediaPreferences>(videoChat.getDevicePreferences())
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const heading = useRef<HTMLHeadingElement>(null)
    const panel = useRef<HTMLElement>(null)
    const closeRef = useRef(onClose)
    closeRef.current = onClose
    useEffect(() => {
        let disposed = false
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
        setOfficeInputLock('devices', true)
        const onDevices = (next: MediaDeviceInfo[]) => { if (!disposed) { setDevices(next); setPreferences(videoChat.getDevicePreferences()) } }
        const refresh = () => { void videoChat.listDevices().then(onDevices).catch(reason => { if (!disposed) setError(reason instanceof Error ? reason.message : 'Não foi possível listar dispositivos.') }) }
        refresh()
        heading.current?.focus()
        signal.on('media-devices-changed', onDevices)
        const close = () => closeRef.current()
        signal.on('officeClose', close)
        return () => {
            disposed = true
            signal.off('media-devices-changed', onDevices)
            signal.off('officeClose', close)
            setOfficeInputLock('devices', false)
            if (previousFocus?.isConnected) previousFocus.focus()
        }
    }, [])
    const choose = async (kind: DeviceKind, value: string) => {
        setBusy(true)
        setError('')
        try {
            if (kind === 'audioinput') await videoChat.selectMicrophone(value)
            if (kind === 'videoinput') await videoChat.selectCamera(value)
            if (kind === 'audiooutput') await videoChat.selectOutput(value)
            setPreferences(videoChat.getDevicePreferences())
        } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível trocar o dispositivo.') }
        finally { setBusy(false) }
    }
    const selection = (kind: DeviceKind, label: string, value: string, disabled = false) => <label className="block text-sm text-slate-200">{label}
        <select value={value} disabled={busy || disabled} onChange={event => { void choose(kind, event.target.value) }} className="mt-1 w-full rounded-lg bg-slate-800 p-2 text-white disabled:opacity-50">
            <option value="">Padrão do navegador</option>
            {devices.filter(device => device.kind === kind && device.deviceId).map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `${label} ${index + 1}`}</option>)}
        </select>
    </label>
    return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4" onMouseDown={event => event.stopPropagation()}>
        <section ref={panel} role="dialog" aria-modal="true" aria-labelledby="device-settings-title" onKeyDown={event => {
            event.stopPropagation()
            if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
            if (event.key !== 'Tab') return
            const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex="0"]') ?? [])
            const first = items[0], last = items[items.length - 1]
            if (!first) { event.preventDefault(); return }
            if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) { event.preventDefault(); last.focus() }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
        }} className="max-h-[calc(100dvh-2rem)] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl border border-teal-400/40 bg-slate-900 p-5 text-white shadow-2xl">
            <div className="flex justify-between gap-3"><h2 ref={heading} tabIndex={-1} id="device-settings-title" className="text-lg font-bold outline-none">Dispositivos da chamada</h2><button type="button" onClick={onClose} className="rounded bg-slate-700 px-3 py-1">Fechar</button></div>
            {selection('audioinput', 'Microfone', preferences.microphoneId)}
            {selection('videoinput', 'Câmera', preferences.cameraId)}
            {selection('audiooutput', 'Saída de áudio', preferences.outputId, !videoChat.outputSupported)}
            {!videoChat.outputSupported && <p className="text-xs text-amber-200">Este navegador escolhe a saída de áudio pelo sistema.</p>}
            <p className="text-xs text-slate-400">A escolha fica salva apenas neste navegador. Permita câmera ou microfone para ver os nomes dos dispositivos.</p>
            {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        </section>
    </div>
}
