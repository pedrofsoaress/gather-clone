'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import type PlayClient from './PlayClient'

// The loading shell matches the sign-in and character pages, so there is no navy flash between them.
const ClientOnlyPlay = dynamic(() => import('./PlayClient'), {
    ssr: false,
    loading: () => <main className='matte-backdrop min-h-screen' />,
})

export default function PlayClientLoader(props: ComponentProps<typeof PlayClient>) {
    return <ClientOnlyPlay {...props} />
}
