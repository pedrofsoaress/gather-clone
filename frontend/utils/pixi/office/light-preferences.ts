const KEY = 'matte.office.lights'

export function isLightEnabled(id: string): boolean {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}')[id] !== false } catch { return true }
}

export function saveLightPreference(id: string, enabled: boolean) {
    try {
        const current = JSON.parse(localStorage.getItem(KEY) || '{}')
        localStorage.setItem(KEY, JSON.stringify({ ...current, [id]: enabled }))
    } catch { /* Lighting still responds when storage is unavailable. */ }
}
