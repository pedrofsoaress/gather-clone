const NOTICE_MS = 4500
/** Bound both the live queue and the lifetime; repeated network events remain one notice. */
export function enqueueNotice(queue, notice, now = Date.now()) {
    const message = String(notice?.message ?? '').trim().slice(0, 220)
    const live = queue.filter(item => item.expiresAt > now)
    if (!message) return live
    const key = notice.key || message
    const previous = live.find(item => item.key === key)
    if (previous) return live
    return [...live, { id: `${now}:${key}`, key, message, kind: notice.kind || 'info', expiresAt: now + NOTICE_MS }].slice(-3)
}

export function notificationCanSound({ enabled, hidden, busy }) {
    return Boolean(enabled && !hidden && !busy)
}
