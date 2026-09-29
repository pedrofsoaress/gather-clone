const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function agoraUidForProfile(uid: string, _displayName: string): string {
    if (!USER_ID_PATTERN.test(uid)) throw new Error('Invalid Agora user id')
    return uid
}
