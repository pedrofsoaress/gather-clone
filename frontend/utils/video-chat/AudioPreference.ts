export type DeviceKind = 'audioinput' | 'videoinput' | 'audiooutput'

export function resolveDevicePreference(deviceId: string, kind: DeviceKind, devices: Pick<MediaDeviceInfo, 'deviceId' | 'kind'>[]): string {
    return deviceId && devices.some(device => device.kind === kind && device.deviceId === deviceId) ? deviceId : ''
}

type DeviceList = Pick<MediaDeviceInfo, 'deviceId' | 'kind'>[]

export function defaultDeviceId(kind: DeviceKind, devices: DeviceList): string | undefined {
    const matching = devices.filter(device => device.kind === kind && device.deviceId)
    return matching.find(device => device.deviceId === 'default')?.deviceId ?? matching[0]?.deviceId
}

function errorCode(error: unknown): string {
    const value = error as { code?: unknown, name?: unknown } | null
    return String(value?.code ?? value?.name ?? '')
}

export async function createWithDeviceFallback<T>(preferredId: string, kind: DeviceKind, devices: DeviceList, create: (deviceId: string) => Promise<T>): Promise<{ track: T, deviceId: string }> {
    const deviceId = resolveDevicePreference(preferredId, kind, devices)
    try { return { track: await create(deviceId), deviceId } }
    catch (error) {
        // The hardware may disappear after enumeration. Do not retry a denied permission.
        if (!deviceId || !['DEVICE_NOT_FOUND', 'NotFoundError', 'OverconstrainedError', 'CONSTRAINT_NOT_SATISFIED'].includes(errorCode(error))) throw error
        return { track: await create(''), deviceId: '' }
    }
}

export function mediaErrorMessage(error: unknown, device: 'câmera' | 'microfone' | 'dispositivo'): string {
    const code = errorCode(error)
    if (['PERMISSION_DENIED', 'NotAllowedError', 'SecurityError'].includes(code)) return `Permita o acesso ao ${device === 'câmera' ? 'vídeo' : device} nas configurações do navegador para usar ${device === 'câmera' ? 'a câmera' : 'o ' + device}.`
    if (['DEVICE_NOT_FOUND', 'NotFoundError', 'OverconstrainedError', 'CONSTRAINT_NOT_SATISFIED'].includes(code)) return `Nenhum ${device === 'câmera' ? 'dispositivo de câmera' : device} disponível. Conecte um dispositivo e tente novamente.`
    if (['NOT_READABLE', 'NotReadableError', 'TRACK_IS_DISABLED'].includes(code)) return `Não foi possível acessar ${device === 'câmera' ? 'a câmera' : 'o ' + device}. Verifique se outro aplicativo está usando o dispositivo.`
    return error instanceof Error && error.message ? error.message : `Não foi possível atualizar ${device === 'câmera' ? 'a câmera' : 'o ' + device}. Tente novamente.`
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
