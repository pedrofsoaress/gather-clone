import type { MeetingSnapshot } from './meeting'

// Agora bills each person by the video they receive. In a meeting room (the training
// room) the audience only receives the video of the people on the stage and shared
// screens; the people on the stage still see everyone. Audio is never filtered here.
// Outside a meeting room everyone receives everyone's video, as before.
export function shouldSubscribeVideo({ remoteUid, localUid, meeting }: {
    remoteUid: string
    localUid: string
    meeting: Pick<MeetingSnapshot, 'moderators'> | null
}): boolean {
    if (!meeting) return true
    if (remoteUid.endsWith('-screen')) return true
    // Agora uids are the office uid (36 chars), plus "-screen" for a shared screen.
    return meeting.moderators.includes(localUid.slice(0, 36)) || meeting.moderators.includes(remoteUid.slice(0, 36))
}
