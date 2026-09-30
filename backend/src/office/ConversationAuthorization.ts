import { createHash } from 'node:crypto'
import type { Session } from '../session'

export function conversationChannel(realmId: string, roomIndex: number, groupId: string): string {
  return createHash('md5').update(`${realmId}-${roomIndex}-${groupId}`).digest('hex').slice(0, 16)
}

export function authorizeConversation(session: Session | undefined, authenticatedUid: string, channel: string, mediaUid: string): { channel: string, uid: string } | null {
  const player = session?.getPlayer(authenticatedUid)
  if (!session || !player || (mediaUid !== authenticatedUid && mediaUid !== `${authenticatedUid}-screen`)) return null
  const position = session.featuresFor(authenticatedUid).office.verifiedPosition(authenticatedUid)
  if (!position) return null
  const room = session.map_data.rooms[player.room]
  const group = room.tilemap[`${position.x}, ${position.y}`]?.privateAreaId || player.proximityId
  if (!group || conversationChannel(session.id, player.room, group) !== channel) return null
  return { channel, uid: mediaUid }
}
