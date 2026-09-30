'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type InstallPromptEvent = Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const InstallContext = createContext<{
    prompt: InstallPromptEvent | null
    installed: boolean
    clearPrompt: () => void
}>({ prompt: null, installed: false, clearPrompt: () => undefined })

export const useInstallPrompt = () => useContext(InstallContext)

/** Install support only: the office, session and media always use the network. */
export default function PwaRegistration({ children }: { children: ReactNode }) {
    const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
    const [installed, setInstalled] = useState(false)

    // Keep the prompt across client-side navigation to the installation page.
    useEffect(() => {
        const mode = window.matchMedia('(display-mode: standalone)')
        const update = () => setInstalled(mode.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
        const onPrompt = (event: Event) => {
            event.preventDefault()
            setPrompt(event as InstallPromptEvent)
        }
        const onInstalled = () => { setInstalled(true); setPrompt(null) }
        update()
        mode.addEventListener('change', update)
        window.addEventListener('beforeinstallprompt', onPrompt)
        window.addEventListener('appinstalled', onInstalled)
        return () => {
            mode.removeEventListener('change', update)
            window.removeEventListener('beforeinstallprompt', onPrompt)
            window.removeEventListener('appinstalled', onInstalled)
        }
    }, [])

    useEffect(() => {
        if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return

        let disposed = false
        let registration: ServiceWorkerRegistration | undefined
        const update = () => {
            if (!disposed && document.visibilityState === 'visible') {
                void registration?.update().catch(() => undefined)
            }
        }

        void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
            .then((worker) => {
                registration = worker
                if (!disposed) document.addEventListener('visibilitychange', update)
            })
            .catch(() => {
                // Installation is optional. A restricted browser still opens the web office.
            })

        return () => {
            disposed = true
            document.removeEventListener('visibilitychange', update)
        }
    }, [])

    return <InstallContext.Provider value={{ prompt, installed, clearPrompt: () => setPrompt(null) }}>{children}</InstallContext.Provider>
}
