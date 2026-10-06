// Document Picture-in-Picture: a small always-on-top window, like Google Meet's,
// that keeps the conversation visible while the person works in other apps.
// It only renders the call; it never touches the office connection.

type DocumentPictureInPicture = {
    window: Window | null
    requestWindow(options?: { width?: number, height?: number, preferInitialWindowPlacement?: boolean }): Promise<Window>
}

// Opens as a slim strip; the person can drag it larger to see the full tiles.
export const FLOATING_SIZE = { width: 300, height: 80, preferInitialWindowPlacement: true }

// Below this height the window shows the compact strip instead of the tile grid.
export const COMPACT_MAX_HEIGHT = 200

export function isCompact(height: number) {
    return height < COMPACT_MAX_HEIGHT
}

export function floatingApi(win: any = typeof window === 'undefined' ? undefined : window): DocumentPictureInPicture | null {
    return win?.documentPictureInPicture ?? null
}

// The floating document starts empty; give it the office stylesheets so the
// Tailwind classes render the same. Absolute URLs because it has no base URL.
export function copyStyles(from: Document, to: Document) {
    for (const sheet of Array.from(from.styleSheets)) {
        try {
            const style = to.createElement('style')
            style.textContent = Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n')
            to.head.appendChild(style)
        } catch {
            if (!sheet.href) continue
            const link = to.createElement('link')
            link.rel = 'stylesheet'
            link.href = sheet.href
            to.head.appendChild(link)
        }
    }
}

// Chrome opens the window by itself when the person leaves a tab that is in a
// call, if the page handles this Media Session action. Browsers without the
// action throw, which simply means no automatic window.
export function registerAutoOpen(open: () => void, session: any = typeof navigator === 'undefined' ? undefined : navigator.mediaSession): () => void {
    if (!session?.setActionHandler) return () => {}
    try {
        session.setActionHandler('enterpictureinpicture', open)
    } catch {
        return () => {}
    }
    return () => {
        try { session.setActionHandler('enterpictureinpicture', null) } catch {}
    }
}
