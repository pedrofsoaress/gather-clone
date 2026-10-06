// Shared Matte styles for the entry pages (home, sign-in, character selection).
export const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'

export const primaryButton = `inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-matte-pink px-6 py-3 text-sm font-bold text-white shadow-[0_10px_30px_rgba(211,19,90,0.35)] transition-colors hover:bg-matte-pink-hover disabled:pointer-events-none disabled:opacity-60 ${focusRing}`

export const secondaryButton = `inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-60 ${focusRing}`

export const card = 'rounded-2xl border border-white/10 bg-matte-surface/80 backdrop-blur'

// Small label: white text on a pink pill (5.24:1); pink text at this size would be too faint.
// The right padding drops the trailing letter-spacing so the text sits optically centered.
export const kicker = 'inline-flex rounded-full bg-matte-pink pl-3 pr-[calc(0.75rem-0.25em)] py-1 text-[11px] font-bold uppercase tracking-[0.25em] text-white'
