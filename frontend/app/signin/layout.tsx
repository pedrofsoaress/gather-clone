import type { ReactNode } from 'react'
import type { Viewport } from 'next'

// Black browser bar on the sign-in page; the office keeps the root layout's navy.
export const viewport: Viewport = { themeColor: '#0B0B0F' }

export default function SignInLayout({ children }: { children: ReactNode }) {
    return children
}
