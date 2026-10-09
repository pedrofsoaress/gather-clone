export type AnnexConfig = { reveal: { x: number, y: number, width: number, height: number }, triggers: [number, number][] }
export type AnnexSign = { text: string, x: number, y: number }

export function isAnnexTrigger(annex: AnnexConfig | undefined, x: number, y: number): boolean {
    return Boolean(annex?.triggers.some(([triggerX, triggerY]) => triggerX === x && triggerY === y))
}

// The wing lights up on the passage, and also when the visitor is already
// inside it (a reconnection resumes them where they stood).
export function shouldReveal(annex: AnnexConfig | undefined, x: number, y: number): boolean {
    if (!annex) return false
    if (isAnnexTrigger(annex, x, y)) return true
    const { reveal } = annex
    return x >= reveal.x && x < reveal.x + reveal.width && y >= reveal.y && y < reveal.y + reveal.height
}
