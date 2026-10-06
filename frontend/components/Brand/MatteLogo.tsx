import React from 'react'

const MARK_PATH = 'M122.012 101.162L382.472 101L382.449 378.618L318.546 378.591C316.798 325.049 318.598 264.725 318.256 210.468C302.059 228.367 281.709 254.775 265.966 274.029C237.617 308.11 208.942 344.919 180.126 378.302C156.634 379.691 121.867 378.583 97.5273 378.568C110.221 361.252 129.894 338.567 143.797 321.57L228.429 218.025C238.217 206.084 267.8 171.685 275.234 160.095L121.977 160.185C121.873 140.511 121.885 120.836 122.012 101.162Z'

// The Matte arrow, without the white square of the app icon, for dark backgrounds.
export function MatteMark({ size = 28, className = '' }: { size?: number, className?: string }) {
    return <svg viewBox='96 100 288 280' width={size} height={size} aria-hidden='true' className={className}>
        <path d={MARK_PATH} fill='#D3135A' />
    </svg>
}

export default function MatteLogo({ size = 28, label = 'Matte', className = '' }: { size?: number, label?: string, className?: string }) {
    return <span className={`inline-flex items-center gap-2.5 ${className}`}>
        <MatteMark size={size} />
        <span className='text-lg font-extrabold tracking-tight text-white'>{label}</span>
    </span>
}
