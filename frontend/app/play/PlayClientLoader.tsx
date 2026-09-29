'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import type PlayClient from './PlayClient'

const ClientOnlyPlay = dynamic(() => import('./PlayClient'), { ssr: false })

export default function PlayClientLoader(props: ComponentProps<typeof PlayClient>) {
    return <ClientOnlyPlay {...props} />
}
