import { z } from 'zod'
import { Session } from '../session'

export const JoinRealm = z.object({
    realmId: z.string(),
    shareId: z.string(),
})

export const Disconnect = z.any()

export const MovePlayer = z.object({
    x: z.number(),
    y: z.number(),
})

export const Teleport = z.object({
    x: z.number(),
    y: z.number(),
    roomIndex: z.number(),
})

export const ChangedSkin = z.string()

export const NewMessage = z.string()

export const OfficeStep = z.object({ x: z.number().int(), y: z.number().int() })
export const OfficeAction = z.object({
    objectId: z.string().max(64),
    action: z.enum(['occupy', 'release', 'drink', 'startGame', 'joinGame', 'returnBall', 'leaveGame']),
})

export type OnEventCallback = (args: { session: Session, data?: any }) => void
