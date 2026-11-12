// The war as the client sees it: the latest state from the server (systems/war.ts via act 'warSync'), which side the
// player is watching, and the feed lines already shown. Lives across scene restarts (switching sides restarts the scene).
import { act, refused } from '../net/client';
import { S } from '../core/events';
import { guildOf } from '../systems/guild';
import { pctLeft, type War } from '../systems/war';

export const WC = { war: null as War | null, side: null as null | 'home' | 'enemy', seen: 0, t: 0 };

/** ask the server for the war as it stands now */
export function syncWar(): War | null {
  const r = act('warSync', {});
  WC.war = refused(r) ? null : r.war;
  return WC.war;
}
/** a war is going on (or just ended and its result has not been cleared yet) */
export const warOn = () => !!(WC.war ?? guildOf(S())?.war);
/** new feed lines since the last call (oldest first) */
export function newFeed(w: War) {
  const fresh = w.feed.filter(f => f.t > WC.seen).reverse();
  if (w.feed.length) WC.seen = Math.max(WC.seen, w.feed[0].t);
  return fresh;
}
export const warLine = (w: War, now = Date.now()) => {
  const l = Math.max(0, Math.ceil((w.end - now) / 1000));
  return `⚔ สงคราม vs ${w.rival.name} • ⏱ ${Math.floor(l / 60)}:${String(l % 60).padStart(2, '0')} • 🏠 เรา ${Math.round(pctLeft(w.ours) * 100)}% | ศัตรู ${Math.round(pctLeft(w.theirs) * 100)}%`;
};
