import { z } from 'zod'
import { Session } from '../session'

export const JoinRealm = z.object({
    realmId: z.string(),
    shareId: z.string(),
    displayName: z.string().trim().min(1).max(32).regex(/^[^\u0000-\u001f\u007f]+$/u).optional(),
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
export const ChatMessage = z.object({
    channel: z.enum(['public', 'nearby']),
    text: z.string().trim().min(1).max(300).regex(/^[^\u0000-\u001f\u007f]+$/u),
})

export const OfficeStep = z.object({ x: z.number().int(), y: z.number().int() })
export const OfficeAction = z.object({
    objectId: z.string().max(64),
    action: z.enum(['occupy', 'release', 'drink', 'snack', 'startGame', 'joinGame', 'returnBall', 'leaveGame']),
})
export const OfficeReadNotes = z.object({ objectId: z.string().min(1).max(64) })
export const OfficeAddNote = z.object({ objectId: z.string().min(1).max(64), body: z.string().max(500) })
export const OfficeExternalGet = z.object({ objectId: z.string().min(1).max(64) })
export const OfficeExternalSetRoom = z.object({ objectId: z.string().min(1).max(64), url: z.string().min(1).max(2048), revision: z.number().int().min(0) })
export const PresentationTarget = z.object({ objectId: z.string().min(1).max(64) })
export const PresentationSlide = PresentationTarget.extend({ index: z.number().int().min(0), revision: z.number().int().min(0) })
export const SpeakerTarget = z.object({ objectId: z.string().min(1).max(64) })
export const AvatarAction = z.object({ action: z.enum(['idle', 'dance', 'pet']), objectId: z.string().min(1).max(64).optional() })
export const AvatarRun = z.object({ running: z.boolean() })

export type OnEventCallback = (args: { session: Session, data?: any }) => void
