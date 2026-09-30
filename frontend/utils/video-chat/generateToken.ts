'use server'
import { RtcRole, RtcTokenBuilder } from 'agora-token'
import { createClient } from '../supabase/server'
import { isConversationTokenRequest } from './agoraIdentity'

export async function generateToken(channelName: string, uid: string) {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session || !isConversationTokenRequest(channelName, uid, session.user.id)) return null

    const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID!
    const appCertificate = process.env.APP_CERTIFICATE!
    if (!appCertificate) return null
    try {
        const query = new URLSearchParams({ channel: channelName, uid })
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/conversationAuthorization?${query}`, {
            headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store',
        })
        if (!response.ok) return null
        const authorization = await response.json() as { channel?: string, uid?: string }
        if (authorization.channel !== channelName || authorization.uid !== uid) return null
    } catch { return null }
    const role = RtcRole.PUBLISHER
    const expireTime = 3600

    const token = RtcTokenBuilder.buildTokenWithUserAccount(
        appId,
        appCertificate,
        channelName,
        uid,
        role,
        expireTime,
        expireTime,
    )

    return token
}

export async function generateSpeakerToken(objectId: string, publish: boolean) {
    if (!/^[a-z0-9-]{1,64}$/.test(objectId) || typeof publish !== 'boolean') return null
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session || !process.env.APP_CERTIFICATE) return null
    const query = new URLSearchParams({ objectId, publish: String(publish) })
    const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/speakerAuthorization?${query}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store',
    }).catch(() => null)
    if (!response?.ok) return null
    const authorization = await response.json() as { channel: string, uid: string, publish: boolean }
    if (!authorization.channel?.startsWith('speaker-') || authorization.uid !== `${session.user.id}-${publish ? 'speaker' : 'listen'}` || authorization.publish !== publish) return null
    const expires = 600
    const token = RtcTokenBuilder.buildTokenWithUserAccount(process.env.NEXT_PUBLIC_AGORA_APP_ID!, process.env.APP_CERTIFICATE, authorization.channel, authorization.uid, publish ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER, expires, expires)
    return { ...authorization, token }
}
