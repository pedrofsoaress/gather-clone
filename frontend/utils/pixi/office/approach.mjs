export function canApproach(start, end, blocked, findPath) {
  if (blocked.has(`${end.x}, ${end.y}`)) return false
  if (start.x === end.x && start.y === end.y) return true
  return (findPath([start.x, start.y], [end.x, end.y], blocked)?.length ?? 0) > 0
}

export function nextPendingAfterMove(pendingObjectId, source) {
  return source === 'interaction' ? pendingObjectId : null
}
