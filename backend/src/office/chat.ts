import type { OfficePosition } from './OfficeState'

export const NEARBY_CHAT_RADIUS = 6

export function canReceiveNearbyChat(sender: OfficePosition | null, recipient: OfficePosition | null): boolean {
  return Boolean(sender && recipient &&
    Math.abs(sender.x - recipient.x) <= NEARBY_CHAT_RADIUS &&
    Math.abs(sender.y - recipient.y) <= NEARBY_CHAT_RADIUS)
}
