import { createHash } from 'node:crypto'
import type { Session } from '../session'

export function conversationChannel(realmId: string, roomIndex: number, groupId: string): string {
  return createHash('md5').update(`${realmId}-${roomIndex}-${groupId}`).digest('hex').slice(0, 16)
}

// The Agora channel of the conversation `uid` is in now: the private area of their
// verified tile, else their proximity call. Null when they are in none.
export function conversationChannelFor(session: Session, uid: string): string | null {
  const group = conversationGroupFor(session, uid)
  return group ? conversationChannel(session.id, group.room, group.group) : null
}

// What conversationChannelFor hashes: the floor and the private area or proximity group. Cheap, no hash.
export function conversationGroupFor(session: Session, uid: string): { room: number, group: string } | null {
  const player = session.getPlayer(uid)
  if (!player) return null
  const position = session.featuresFor(uid).office.verifiedPosition(uid)
  if (!position) return null
  const room = session.map_data.rooms[player.room]
  const group = room.tilemap[`${position.x}, ${position.y}`]?.privateAreaId || player.proximityId
  return group ? { room: player.room, group } : null
}

export function authorizeConversation(session: Session | undefined, authenticatedUid: string, channel: string, mediaUid: string): { channel: string, uid: string } | null {
  if (!session || (mediaUid !== authenticatedUid && mediaUid !== `${authenticatedUid}-screen`)) return null
  if (conversationChannelFor(session, authenticatedUid) !== channel) return null
  return { channel, uid: mediaUid }
}
