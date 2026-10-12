import { RtcRole, RtcTokenBuilder } from 'agora-token'
import type { Session } from '../session'
import { conversationChannelFor } from './ConversationAuthorization'

const TOKEN_EXPIRE_SECONDS = 3600
// The client trusts a pushed token for 50 minutes; send it again before that.
const RESEND_AFTER_MS = 45 * 60 * 1000

// Same token the frontend's generateToken mints. Null until the server has the Agora credentials.
export function mintConversationToken(channel: string, uid: string): string | null {
  const appId = process.env.AGORA_APP_ID
  const certificate = process.env.APP_CERTIFICATE
  if (!appId || !certificate) return null
  return RtcTokenBuilder.buildTokenWithUserAccount(appId, certificate, channel, uid, RtcRole.PUBLISHER, TOKEN_EXPIRE_SECONDS, TOKEN_EXPIRE_SECONDS)
}

// Remembers the channel last pushed to each visitor, so steps inside the same conversation push nothing.
export class ConversationTokens {
  private readonly sent = new Map<string, { channel: string, at: number }>()

  // The token to push to `uid` now, or null when they are in no conversation or already have it.
  public next(session: Session, uid: string, now = Date.now()): { channel: string, token: string } | null {
    const channel = conversationChannelFor(session, uid)
    if (!channel) {
      this.sent.delete(uid)
      return null
    }
    const last = this.sent.get(uid)
    if (last && last.channel === channel && now - last.at < RESEND_AFTER_MS) return null
    const token = mintConversationToken(channel, uid)
    if (!token) return null
    this.sent.set(uid, { channel, at: now })
    return { channel, token }
  }

  public forget(uid: string) {
    this.sent.delete(uid)
  }
}
