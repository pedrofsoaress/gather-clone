export type AvatarActionState = {
    action: 'idle' | 'dance' | 'pet',
    running: boolean,
    objectId?: string,
    expiresAt: number | null,
}
export type AvatarSnapshot = Record<string, AvatarActionState>
type Facing = 'up' | 'down' | 'left' | 'right'

export const movementSpeed = (running: boolean): number => 3.5 * (running ? 1.65 : 1)

export function actionFrames<T>(animations: Record<string, T[]>, action: AvatarActionState['action'], direction: Facing): T[] {
    return animations[`${action}_${direction}`] ?? animations[action] ?? animations[`walk_${direction}`] ?? animations[`idle_${direction}`] ?? animations.idle_down ?? []
}

/** Original motion choreography, applied to each visitor's existing skin. */
export function actionPose(action: AvatarActionState['action'], elapsedMs: number) {
    if (action === 'dance') {
        const beat = elapsedMs / 175
        return { x: Math.sin(beat) * 3, y: -Math.abs(Math.sin(beat * 2)) * 5, rotation: Math.sin(beat) * 0.16, scaleY: 1 }
    }
    if (action === 'pet') {
        const beat = elapsedMs / 180
        return { x: 0, y: 0, rotation: Math.sin(beat) * 0.045, scaleY: 0.90 + Math.cos(beat) * 0.025 }
    }
    return { x: 0, y: 0, rotation: 0, scaleY: 1 }
}
