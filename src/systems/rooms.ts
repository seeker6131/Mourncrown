// Automatic rooms (channels) per map (docs/ONLINE_RISKS.md 10). Players never choose: entering a map puts you in the
// fullest room that still has space, so rooms feel alive and a new room opens only when every room is full.
// Online the server keeps the real counts; offline the test bots stand in for other players.

/** index of the room a new player joins (counts.length = open a new room) */
export function pickRoom(counts: number[], cap: number): number {
  let best = -1;
  counts.forEach((c, i) => { if (c < cap && (best < 0 || c > counts[best])) best = i; });
  return best >= 0 ? best : counts.length;
}
/** `total` players arriving one by one */
export function fillRooms(total: number, cap: number): number[] {
  const rooms: number[] = [];
  for (let i = 0; i < total; i++) { const r = pickRoom(rooms, cap); rooms[r] = (rooms[r] ?? 0) + 1; }
  return rooms;
}
