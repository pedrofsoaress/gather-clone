/** A pure standard-layout gamepad adapter. Commands are edges; movement is held. */
export function sampleGamepad(pad, previousHeld = []) {
    if (!pad?.connected) return { direction: null, action: false, back: false, dance: false, running: false, held: [] }
    const held = Array.from(pad.buttons ?? []).flatMap((button, index) => button?.pressed || button?.value > 0.5 ? [index] : [])
    const edge = index => held.includes(index) && !previousHeld.includes(index)
    const axis = index => Number.isFinite(pad.axes?.[index]) ? pad.axes[index] : 0
    const x = axis(0), y = axis(1)
    let direction = null
    if (held.includes(12)) direction = 'ArrowUp'
    else if (held.includes(13)) direction = 'ArrowDown'
    else if (held.includes(14)) direction = 'ArrowLeft'
    else if (held.includes(15)) direction = 'ArrowRight'
    else if (Math.max(Math.abs(x), Math.abs(y)) > 0.3) direction = Math.abs(x) > Math.abs(y) ? (x < 0 ? 'ArrowLeft' : 'ArrowRight') : (y < 0 ? 'ArrowUp' : 'ArrowDown')
    return { direction, action: edge(0), back: edge(1) || edge(9), dance: edge(2), running: held.includes(4) || held.includes(5), held }
}

export function gamepadLabels(id = '') {
    if (/playstation|dualshock|dualsense|sony|054c/i.test(id)) return { action: '×', back: '○', dance: '□', run: 'L1 / R1' }
    if (/nintendo|switch|057e/i.test(id)) return { action: 'B', back: 'A', dance: 'Y', run: 'L / R' }
    return { action: 'A', back: 'B', dance: 'X', run: 'LB / RB' }
}
