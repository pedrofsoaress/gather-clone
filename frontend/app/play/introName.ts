// Guests get a generated name like "Guest-a1b2c3" at sign-in. It is English and
// meaningless to the team, so the character page asks for a real name instead.
export function suggestedName(username: string): string {
    return /^Guest-[0-9a-f]{6}$/.test(username) ? '' : username
}
