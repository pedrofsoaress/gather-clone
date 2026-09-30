export type DeviceKind = 'audioinput' | 'videoinput' | 'audiooutput'

export function resolveDevicePreference(deviceId: string, kind: DeviceKind, devices: Pick<MediaDeviceInfo, 'deviceId' | 'kind'>[]): string {
    return deviceId && devices.some(device => device.kind === kind && device.deviceId === deviceId) ? deviceId : ''
}

export function clampRemoteVolume(volume: number): number {
    return Number.isFinite(volume) ? Math.max(0, Math.min(100, Math.round(volume))) : 100
}

const storageKey = 'matte-office-media-preferences'
export type MediaPreferences = { microphoneId: string, cameraId: string, outputId: string }
const defaults: MediaPreferences = { microphoneId: '', cameraId: '', outputId: '' }

export function readMediaPreferences(): MediaPreferences {
    try {
        const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}')
        return {
            microphoneId: typeof stored.microphoneId === 'string' ? stored.microphoneId : '',
            cameraId: typeof stored.cameraId === 'string' ? stored.cameraId : '',
            outputId: typeof stored.outputId === 'string' ? stored.outputId : '',
        }
    } catch { return { ...defaults } }
}

export function saveMediaPreferences(preferences: MediaPreferences): void {
    try { window.localStorage.setItem(storageKey, JSON.stringify(preferences)) } catch { /* private browsing */ }
}
