import signal from '../signal'

export type MeetingSnapshot = { areaId: string, locked: boolean, allowed: string[], raised: string[], moderators: string[] }

// Latest training-meeting state sent by the server (null outside a meeting room).
let current: MeetingSnapshot | null = null
let localUid = ''

export function setLocalMeetingUid(uid: string) { localUid = uid }

export function setMeeting(snapshot: MeetingSnapshot | null) {
    current = snapshot
    signal.emit('meetingState', snapshot)
}

export function getMeeting(): MeetingSnapshot | null { return current }

export function isModerator(uid = localUid): boolean { return Boolean(current?.moderators.includes(uid)) }

export function canUnmute(): boolean {
    return !current || !current.locked || isModerator() || current.allowed.includes(localUid)
}
