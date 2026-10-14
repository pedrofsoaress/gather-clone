import type { MeetingSnapshot } from './meeting'

type StageList = Pick<MeetingSnapshot, 'moderators'>

// The private area behind the Agora channel this page is in (null for a proximity conversation).
export type ChannelArea = { areaId: string, isMeetingArea: boolean }

// Agora bills each person by the video they receive. In a meeting room (the training
// room) the audience only receives the video of the people on the stage and shared
// screens; the people on the stage still see everyone. Audio is never filtered here.
// Outside a meeting room everyone receives everyone's video, except your own shared
// screen: the sharer sees it from the local track instead of receiving it back.
export function shouldSubscribeVideo({ remoteUid, localUid, meeting }: {
    remoteUid: string
    localUid: string
    meeting: StageList | null
}): boolean {
    if (localUid && remoteUid === `${localUid}-screen`) return false
    if (!meeting) return true
    if (remoteUid.endsWith('-screen')) return true
    // Agora uids are the office uid (36 chars), plus "-screen" for a shared screen.
    return meeting.moderators.includes(localUid.slice(0, 36)) || meeting.moderators.includes(remoteUid.slice(0, 36))
}

// The stage that applies to the current channel. The policy follows the channel, not only
// the server's snapshot, which can arrive late or go stale:
// - not a meeting area: no filter, even if a snapshot from another area is still around;
// - a snapshot for this area: use it;
// - otherwise (entering before the snapshot arrives, or the server already sent null while
//   this page is still in the training channel on the way out): keep the last stage known
//   for this channel, or treat everyone as audience when none is known yet.
export function channelMeeting(area: ChannelArea | null, snapshot: MeetingSnapshot | null, lastKnown: StageList | null): StageList | null {
    if (!area?.isMeetingArea) return null
    if (snapshot?.areaId === area.areaId) return snapshot
    return lastKnown ?? { moderators: [] }
}
