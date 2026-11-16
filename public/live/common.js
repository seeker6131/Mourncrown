// 🪢 Live tug of war: shared settings + the link between the game page and the settings page (same browser).
// Settings live in this browser (localStorage); the settings page talks to the open game through a BroadcastChannel.
const LIVE_KEY = 'mclive-cfg-v1';
const LIVE_DEFAULTS = {
  title: 'ศึกชักเยอ LIVE',
  help: 'พิมพ์ 1 หรือ 2 เพื่อเข้าทีม • ❤️ กดหัวใจ = ดึง • 🎁 ของขวัญ = ดึงแรง!',
  t1Name: 'ทีมแดง', t1Color: '#ff4d5e', t1Key: '1',
  t2Name: 'ทีมน้ำเงิน', t2Color: '#3d8bff', t2Key: '2',
  likePower: 0.05,       // pull per heart
  chatPower: 0.3,        // pull per comment from a team member (0 = off)
  diamondPower: 1,       // pull per diamond of a gift
  giftCap: 0.35,         // one gift pulls at most this share of the win distance (a single huge gift can't end a round)
  bigGift: 99,           // a gift worth this many diamonds or more gets the big banner
  winAt: 100,            // how far the rope must go to win
  roundSec: 180,         // round time limit (0 = no limit)
  restartSec: 12,        // seconds on the win screen before the next round
  keepTeams: false,      // keep everyone's team for the next round
  allowSwitch: false,    // a comment with the other keyword switches team
  noTeam: 'auto',        // gift/heart from someone without a team: 'auto' = put on the smaller team, 'ignore'
  comeback: 0.3,         // the losing team pulls this much harder at most (0 = off) — keeps rounds close
  giftPower: 'Rose=1\nTikTok=1',   // per gift name, overrides diamonds: "name=pull" per line
  wsUrl: 'ws://localhost:21213/',  // TikFinity's local event feed
  showStatus: true,
  sound: true, volume: 0.5,
};
function liveLoad() {
  try { return { ...LIVE_DEFAULTS, ...JSON.parse(localStorage.getItem(LIVE_KEY) || '{}') }; } catch { return { ...LIVE_DEFAULTS }; }
}
function liveSave(cfg) {
  try { localStorage.setItem(LIVE_KEY, JSON.stringify(cfg)); } catch {}
  liveChan.post({ t: 'cfg', cfg });
}
const liveChan = (() => {
  let bc = null; try { bc = new BroadcastChannel('mclive'); } catch {}
  const subs = [];
  if (bc) bc.onmessage = e => subs.forEach(f => f(e.data));
  return { post: m => { try { bc && bc.postMessage(m); } catch {} }, on: f => subs.push(f) };
})();
/** "Rose=1\nLion=500" → { rose: 1, lion: 500 } */
function liveGiftMap(txt) {
  const m = {};
  for (const line of String(txt || '').split(/\n|,/)) {
    const i = line.lastIndexOf('='); if (i < 1) continue;
    const k = line.slice(0, i).trim().toLowerCase(), v = parseFloat(line.slice(i + 1));
    if (k && isFinite(v)) m[k] = v;
  }
  return m;
}
