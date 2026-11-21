// 🪢 Live tug of war — the game page (drawn on a 1080x1920 canvas, made for a vertical TikTok live).
// Events come from TikFinity's local feed (ws), or from the settings page's test buttons, or from ?demo=1 bots.
(() => {
  const W = 1080, H = 1920;
  const cv = document.getElementById('cv'), g = cv.getContext('2d');
  let cfg = liveLoad(), gifts = liveGiftMap(cfg.giftPower);

  // ---------- state ----------
  const S = {
    pos: 0, shown: 0,               // rope position: <0 team 1 winning, >0 team 2
    phase: 'play', endAt: 0, startAt: Date.now(), winner: 0, mvp: null,
    members: new Map(),             // uid → { name, team, pts }
    pts: [0, 0],                    // total pull per team this round
    feed: [], banner: null, parts: [], shake: 0,
    ws: 'off', last: { winner: 0 },
  };
  const streak = new Map();         // (uid|gift) → last repeatCount (streak gifts arrive many times)
  const now = () => Date.now();
  const teamName = t => t === 1 ? cfg.t1Name : cfg.t2Name, teamColor = t => t === 1 ? cfg.t1Color : cfg.t2Color;
  const count = t => { let n = 0; for (const m of S.members.values()) if (m.team === t) n++; return n; };

  function newRound() {
    S.pos = 0; S.phase = 'play'; S.startAt = now(); S.pts = [0, 0]; S.winner = 0; S.mvp = null; S.banner = null; streak.clear();
    if (cfg.keepTeams) for (const m of S.members.values()) m.pts = 0; else S.members.clear();
    say('🔔 รอบใหม่เริ่มแล้ว! พิมพ์ ' + cfg.t1Key + ' หรือ ' + cfg.t2Key, '#ffe07a');
    snd('start');
  }
  function join(uid, name, team, quiet) {
    const m = S.members.get(uid);
    if (m && (m.team === team || !cfg.allowSwitch)) return m;
    if (m) { m.team = team; say(`${name} ย้ายไป${teamName(team)}`, teamColor(team)); return m; }
    const n = { name, team, pts: 0 }; S.members.set(uid, n);
    if (!quiet && !cfg.donorOnly) say(`${name} เข้า${teamName(team)}`, teamColor(team));
    return n;
  }
  function who(uid, name) {
    const m = S.members.get(uid); if (m) return m;
    if (cfg.noTeam !== 'auto') return null;
    return join(uid, name, count(1) <= count(2) ? 1 : 2, true);
  }
  function pull(m, amt) {
    if (S.phase !== 'play' || !(amt > 0)) return;
    // comeback: the team that is behind pulls a bit harder (up to cfg.comeback at the very edge)
    const behind = (m.team === 1 && S.pos > 0) || (m.team === 2 && S.pos < 0);
    if (behind) amt *= 1 + (cfg.comeback || 0) * Math.min(1, Math.abs(S.pos) / cfg.winAt);
    S.pos = Math.max(-cfg.winAt, Math.min(cfg.winAt, S.pos + (m.team === 1 ? -amt : amt))); m.pts += amt; S.pts[m.team - 1] += amt;
    if (Math.abs(S.pos) >= cfg.winAt) win(S.pos < 0 ? 1 : 2);
  }
  function win(t) {
    S.phase = 'win'; S.winner = t; S.endAt = now() + cfg.restartSec * 1000;
    let best = null; for (const m of S.members.values()) if (m.team === t && (!best || m.pts > best.pts)) best = m;
    S.mvp = best; S.last.winner = t; S.shake = 30; snd('win');
    for (let i = 0; i < 120; i++) spark(W / 2, H * 0.42, teamColor(t), 18);
  }

  // ---------- events (TikFinity / TikTok-Live-Connector shape) ----------
  function onEvent(ev) {
    if (!ev || !ev.event) return;
    const d = ev.data || {}, uid = String(d.uniqueId || d.userId || d.nickname || 'anon'), name = String(d.nickname || d.uniqueId || 'ผู้ชม').slice(0, 20);
    if (ev.event === 'chat') {
      const c = String(d.comment || '').trim().toLowerCase();
      if (c === String(cfg.t1Key).toLowerCase()) return void join(uid, name, 1);
      if (c === String(cfg.t2Key).toLowerCase()) return void join(uid, name, 2);
      const m = S.members.get(uid); if (m && cfg.chatPower > 0 && !cfg.donorOnly) pull(m, cfg.chatPower);
    } else if (ev.event === 'like') {
      if (cfg.donorOnly) return;   // donors only: hearts don't pull
      const m = who(uid, name); if (!m) return;
      const n = Math.max(1, Math.min(500, +d.likeCount || 1)); pull(m, n * cfg.likePower);
      if (Math.random() < 0.3) spark(m.team === 1 ? 260 : 820, H * 0.42, '#ff7aa8', 8, '❤');
    } else if (ev.event === 'gift') {
      // a streak gift arrives again and again with a growing repeatCount: count only what is new
      const key = uid + '|' + (d.giftId ?? d.giftName), rc = Math.max(1, +d.repeatCount || 1);
      let add = rc;
      if (+d.giftType === 1) { const was = streak.get(key) || 0; add = rc >= was ? rc - was : rc; streak.set(key, rc); if (d.repeatEnd) streak.delete(key); }
      if (add <= 0) return;
      const m = who(uid, name); if (!m) return;
      if (d.profilePictureUrl && m.pic !== d.profilePictureUrl) { m.pic = d.profilePictureUrl; m.img = new Image(); m.img.referrerPolicy = 'no-referrer'; m.img.src = m.pic; }
      const gname = String(d.giftName || 'ของขวัญ'), per = gifts[gname.toLowerCase()] ?? (Math.max(1, +d.diamondCount || 1) * cfg.diamondPower);
      const dia = Math.max(1, +d.diamondCount || 1) * add;
      pull(m, Math.min(per * add, cfg.winAt * (cfg.giftCap || 1)));   // one gift can't end the round alone (giftCap)
      say(`🎁 ${name} ส่ง ${gname} x${add}`, teamColor(m.team));
      for (let i = 0; i < Math.min(60, 6 + dia); i++) spark(m.team === 1 ? 260 : 820, H * 0.42, teamColor(m.team), 12);
      if (dia >= cfg.bigGift) { S.banner = { txt: `${name}`, sub: `${gname} x${add} → ${teamName(m.team)} ดึงสุดแรง!`, c: teamColor(m.team), until: now() + 4000 }; S.shake = 20; snd('big'); } else snd('gift');
    } else if (ev.event === 'follow' || ev.event === 'share') {
      const m = S.members.get(uid); if (m && !cfg.donorOnly) { pull(m, 2); say(`${name} ${ev.event === 'follow' ? 'กดติดตาม' : 'แชร์ไลฟ์'} +2`, teamColor(m.team)); }
    }
  }
  function say(txt, c) { S.feed.unshift({ txt, c, at: now() }); S.feed.length = Math.min(S.feed.length, 7); }
  function spark(x, y, c, sp, ch) {
    const a = Math.random() * Math.PI * 2, v = Math.random() * sp;
    S.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6, c, ch, life: 60 + Math.random() * 40 });
    if (S.parts.length > 600) S.parts.splice(0, S.parts.length - 600);
  }

  // ---------- TikFinity link ----------
  let ws = null, retry = 0;
  function connect() {
    if (!cfg.wsUrl) { S.ws = 'off'; return; }
    try { ws = new WebSocket(cfg.wsUrl); } catch { S.ws = 'err'; return void setTimeout(connect, 3000); }
    S.ws = 'wait';
    ws.onopen = () => { S.ws = 'on'; retry = 0; };
    ws.onmessage = e => { try { onEvent(JSON.parse(e.data)); } catch {} };
    ws.onclose = () => { S.ws = 'err'; ws = null; setTimeout(connect, Math.min(10000, 1000 * ++retry)); };
  }
  function reconnect() { if (ws) { ws.onclose = null; ws.close(); ws = null; } connect(); }

  // ---------- settings page link ----------
  liveChan.on(m => {
    if (m.t === 'cfg') { const url = cfg.wsUrl; cfg = { ...LIVE_DEFAULTS, ...m.cfg }; gifts = liveGiftMap(cfg.giftPower); if (cfg.wsUrl !== url) reconnect(); }
    else if (m.t === 'ev') onEvent(m.ev);
    else if (m.t === 'reset') newRound();
    else if (m.t === 'win') win(m.team);
  });
  setInterval(() => liveChan.post({ t: 'status', ws: S.ws, phase: S.phase, pos: Math.round(S.pos), n1: count(1), n2: count(2) }), 1000);
  window.__live = { S, onEvent, newRound };

  // ---------- sound (tiny beeps, no files) ----------
  let ac = null;
  function snd(k) {
    if (!cfg.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const seq = { gift: [660, 880], big: [440, 660, 880, 1320], win: [523, 659, 784, 1047, 1319], start: [392, 523] }[k] || [600];
      seq.forEach((f, i) => {
        const o = ac.createOscillator(), v = ac.createGain(), t = ac.currentTime + i * 0.09;
        o.type = 'square'; o.frequency.value = f; v.gain.setValueAtTime(cfg.volume * 0.15, t); v.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        o.connect(v).connect(ac.destination); o.start(t); o.stop(t + 0.13);
      });
    } catch {}
  }
  document.addEventListener('pointerdown', () => { try { ac = ac || new AudioContext(); ac.resume(); } catch {} });

  // ---------- drawing ----------
  const F = (s, w = 700) => `${w} ${s}px Kanit, system-ui, sans-serif`;
  function text(t, x, y, s, c, al = 'center', w = 700) { g.font = F(s, w); g.textAlign = al; g.lineWidth = s / 6; g.strokeStyle = '#000'; g.strokeText(t, x, y); g.fillStyle = c; g.fillText(t, x, y); }
  function rr(x, y, w, h, r, c) { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = c; g.fill(); }
  function guy(x, y, c, lean, t, m, top) {
    const k = Math.sin(t / 90 + x) * 4, img = m && m.img && m.img.complete && m.img.naturalWidth ? m.img : null;
    g.save(); g.translate(x, y); g.rotate(lean);
    g.fillStyle = c; g.strokeStyle = '#111'; g.lineWidth = 6;
    g.beginPath(); g.arc(0, -150, 34, 0, 7); g.fill(); g.stroke();                // head
    rr(-26, -116, 52, 90, 18, c); g.strokeRect(-26, -116, 52, 90);               // body
    g.beginPath(); g.moveTo(-14, -26); g.lineTo(-30 + k, 40); g.moveTo(14, -26); g.lineTo(26 - k, 40); g.stroke();   // legs
    if (img) {   // the donor's TikTok profile picture as the head
      g.save(); g.beginPath(); g.arc(0, -150, 46, 0, 7); g.clip(); g.drawImage(img, -46, -196, 92, 92); g.restore();
      g.strokeStyle = c; g.lineWidth = 7; g.beginPath(); g.arc(0, -150, 46, 0, 7); g.stroke();
    } else if (m) { g.fillStyle = '#fff'; g.font = F(40); g.textAlign = 'center'; g.fillText(m.name.slice(0, 1).toUpperCase(), 0, -136); }
    else { g.fillStyle = '#111'; g.beginPath(); g.arc(-10, -154, 5, 0, 7); g.arc(12, -154, 5, 0, 7); g.fill(); }
    g.restore();
    if (top) { g.font = F(48); g.textAlign = 'center'; g.fillText('👑', x, y - 210); }
    if (m) text(m.name.length > 9 ? m.name.slice(0, 8) + '…' : m.name, x, y + 84, 26, '#fff', 'center', 600);
  }
  function frame() {
    const t = now();
    if (S.phase === 'play' && cfg.roundSec > 0 && t - S.startAt >= cfg.roundSec * 1000) win(S.pos < 0 ? 1 : S.pos > 0 ? 2 : (S.pts[0] >= S.pts[1] ? 1 : 2));
    if (S.phase === 'win' && t >= S.endAt) newRound();
    S.shown += (S.pos - S.shown) * 0.12;
    const sh = S.shake > 0 ? (S.shake--, (Math.random() - 0.5) * S.shake) : 0;

    // background
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#1b1036'); bg.addColorStop(1, '#0b0716'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const half = Math.max(-1, Math.min(1, S.shown / cfg.winAt));
    g.globalAlpha = 0.18; g.fillStyle = cfg.t1Color; g.fillRect(0, 0, W / 2 + half * W / 2, H); g.fillStyle = cfg.t2Color; g.fillRect(W / 2 + half * W / 2, 0, W, H); g.globalAlpha = 1;

    g.save(); g.translate(sh, sh);
    // title + timer
    text(cfg.title, W / 2, 120, 76, '#ffe07a');
    if (S.phase === 'play' && cfg.roundSec > 0) {
      const left = Math.max(0, Math.ceil((cfg.roundSec * 1000 - (t - S.startAt)) / 1000));
      text(`⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, W / 2, 210, 60, left <= 10 ? '#ff6a5a' : '#fff');
    }
    // team boxes
    [1, 2].forEach(tm => {
      const x = tm === 1 ? 40 : W / 2 + 10, c = teamColor(tm);
      rr(x, 260, W / 2 - 50, 170, 24, 'rgba(0,0,0,.45)'); g.strokeStyle = c; g.lineWidth = 6; g.beginPath(); g.roundRect(x, 260, W / 2 - 50, 170, 24); g.stroke();
      text(teamName(tm), x + (W / 2 - 50) / 2, 330, 54, c);
      text(`พิมพ์ "${tm === 1 ? cfg.t1Key : cfg.t2Key}" • ${count(tm)} คน`, x + (W / 2 - 50) / 2, 400, 36, '#fff', 'center', 500);
    });

    // the rope
    const ry = H * 0.42, off = half * (W / 2 - 170), lean = half * 0.25;
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.setLineDash([16, 16]); g.lineWidth = 4; g.beginPath(); g.moveTo(W / 2, ry - 260); g.lineTo(W / 2, ry + 160); g.stroke(); g.setLineDash([]);
    [130, W - 130].forEach((x, i) => { g.strokeStyle = i ? cfg.t2Color : cfg.t1Color; g.lineWidth = 8; g.beginPath(); g.moveTo(x, ry - 220); g.lineTo(x, ry + 140); g.stroke(); });
    g.strokeStyle = '#c99a5b'; g.lineWidth = 18; g.beginPath(); g.moveTo(60 + off, ry - 40); g.lineTo(W - 60 + off, ry - 40); g.stroke();
    g.strokeStyle = '#8a6236'; g.lineWidth = 4; for (let x = 70; x < W - 60; x += 26) { g.beginPath(); g.moveTo(x + off, ry - 49); g.lineTo(x + 14 + off, ry - 31); g.stroke(); }
    // the flag in the middle of the rope
    g.fillStyle = '#ffe07a'; g.beginPath(); g.moveTo(W / 2 + off, ry - 40); g.lineTo(W / 2 + off - 26, ry + 40); g.lineTo(W / 2 + off + 26, ry + 40); g.fill();
    // the pullers on the rope = the team's donors (most first, with their picture and name); nobody yet: plain stand-ins
    const N = Math.max(1, Math.min(5, cfg.showN || 4)), gap = Math.min(110, 400 / N);
    [1, 2].forEach(tm => {
      const ds = [...S.members.values()].filter(m => m.team === tm && m.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, N);
      const n = ds.length || 2;
      for (let i = n - 1; i >= 0; i--) {
        const x = (tm === 1 ? 120 + i * gap : W - 120 - i * gap) + off * 0.35;   // (pullers move less than the rope: the top donor stays on screen)
        if (!ds.length) g.globalAlpha = 0.35;
        guy(x, ry + 60, teamColor(tm), (tm === 1 ? -0.25 : 0.25) + lean, t + i * 70, ds[i], i === 0 && !!ds[i]);
        g.globalAlpha = 1;
      }
    });

    // power bar
    const by = ry + 190; rr(60, by, W - 120, 44, 22, 'rgba(255,255,255,.12)');
    const mid = W / 2, bw = (W - 120) / 2 * Math.abs(half);
    rr(half < 0 ? mid - bw : mid, by, bw, 44, 22, half < 0 ? cfg.t1Color : cfg.t2Color);
    text(`${Math.round(Math.abs(S.shown) / cfg.winAt * 100)}%`, W / 2, by + 36, 34, '#fff');

    // top pullers
    [1, 2].forEach(tm => {
      const x = tm === 1 ? 40 : W / 2 + 10, list = [...S.members.values()].filter(m => m.team === tm && m.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, 5);
      text(`🏆 แรงดึงสูงสุด`, x + 20, by + 130, 38, teamColor(tm), 'left');
      list.forEach((m, i) => { text(`${i + 1}. ${m.name}`, x + 20, by + 190 + i * 56, 36, '#fff', 'left', 500); text(`${Math.round(m.pts)}`, x + W / 2 - 80, by + 190 + i * 56, 36, '#ffe07a', 'right'); });
      if (!list.length) text('ยังไม่มีใครดึง', x + 20, by + 190, 34, 'rgba(255,255,255,.5)', 'left', 400);
    });

    // feed
    S.feed.forEach((f, i) => { const a = Math.max(0, 1 - (t - f.at) / 9000); if (!a) return; g.globalAlpha = a; text(f.txt, W / 2, H - 380 + i * 46, 34, f.c, 'center', 500); g.globalAlpha = 1; });
    // help line
    rr(30, H - 110, W - 60, 80, 20, 'rgba(0,0,0,.55)'); text(cfg.help, W / 2, H - 56, 32, '#fff', 'center', 500);
    g.restore();

    // sparks
    for (const p of S.parts) { p.x += p.vx; p.y += p.vy; p.vy += 0.35; p.life--; g.globalAlpha = Math.max(0, p.life / 80); if (p.ch) { g.font = F(36); g.fillText(p.ch, p.x, p.y); } else { g.fillStyle = p.c; g.fillRect(p.x, p.y, 10, 10); } }
    g.globalAlpha = 1; S.parts = S.parts.filter(p => p.life > 0);

    // big gift banner
    if (S.banner && t < S.banner.until && S.phase === 'play') {
      const k = Math.min(1, (S.banner.until - t) / 300, (4000 - (S.banner.until - t)) / 200 + 0.2);
      g.globalAlpha = k; rr(40, H * 0.56, W - 80, 220, 30, 'rgba(0,0,0,.8)'); g.strokeStyle = S.banner.c; g.lineWidth = 10; g.beginPath(); g.roundRect(40, H * 0.56, W - 80, 220, 30); g.stroke();
      text('🎁 ' + S.banner.txt, W / 2, H * 0.56 + 100, 70, '#ffe07a'); text(S.banner.sub, W / 2, H * 0.56 + 175, 40, '#fff', 'center', 500); g.globalAlpha = 1;
    }
    // win screen
    if (S.phase === 'win') {
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, 0, W, H);
      text('🏆 ' + teamName(S.winner) + ' ชนะ!', W / 2, H * 0.36, 100, teamColor(S.winner));
      if (S.mvp) { text('⭐ MVP', W / 2, H * 0.36 + 130, 56, '#ffe07a'); text(S.mvp.name, W / 2, H * 0.36 + 210, 72, '#fff'); }
      text(`รอบใหม่ใน ${Math.max(0, Math.ceil((S.endAt - t) / 1000))} วินาที`, W / 2, H * 0.36 + 330, 44, '#ddd', 'center', 500);
    }
    // link status (small, corner)
    if (cfg.showStatus) { const c = { on: '#4cd964', wait: '#ffcc00', err: '#ff3b30', off: '#888' }[S.ws]; g.fillStyle = c; g.beginPath(); g.arc(30, 30, 12, 0, 7); g.fill(); }
    requestAnimationFrame(frame);
  }

  // fit the 1080x1920 canvas to the window
  function fit() { const s = Math.min(innerWidth / W, innerHeight / H); cv.style.width = W * s + 'px'; cv.style.height = H * s + 'px'; }
  addEventListener('resize', fit); fit();

  // ?demo=1: bots play so the page can be seen without a live
  if (/demo=1/.test(location.search)) {
    const names = ['มะม่วง', 'ส้มโอ', 'Kitty', 'บอส', 'น้องหมู', 'ToeyX', 'Mint', 'ปลาทู', 'แบงค์', 'Jay'];
    setInterval(() => {
      const n = names[Math.floor(Math.random() * names.length)], r = Math.random(), d = { uniqueId: n, nickname: n };
      if (r < 0.2) onEvent({ event: 'chat', data: { ...d, comment: Math.random() < 0.5 ? cfg.t1Key : cfg.t2Key } });
      else if (r < 0.85) onEvent({ event: 'like', data: { ...d, likeCount: 5 + Math.floor(Math.random() * 20) } });
      else onEvent({ event: 'gift', data: { ...d, giftName: Math.random() < 0.9 ? 'Rose' : 'Lion', diamondCount: Math.random() < 0.9 ? 1 : 299, repeatCount: 1, giftType: 0 } });
    }, 250);
  }
  connect(); say('🔔 เริ่มแล้ว! พิมพ์ ' + cfg.t1Key + ' หรือ ' + cfg.t2Key + ' เพื่อเข้าทีม', '#ffe07a');
  requestAnimationFrame(frame);
})();
