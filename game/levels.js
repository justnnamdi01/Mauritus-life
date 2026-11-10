// Island Standing: the player's level (docs/CORE.md section 3.8). One number for "how much of your own life you have built".
// Every level can be reached alone; friends only make it faster (a social bonus on top).
// The SERVER owns XP and levels. The phone only says what happened ("a shift ended"); the server decides if it counts, how much, and the daily caps.
// The numbers are placeholders to be tuned with the pacing script.
"use strict";
const MUT = 4 * 3600000; // Mauritius is UTC+4
const MAX = 50;
const need = (lv) => 60 + 40 * lv + 3 * lv * lv; // XP to go from level lv to lv+1
const TITLES = [[1, "Newcomer"], [3, "Local"], [6, "Regular"], [10, "Lakaz Owner"], [15, "Well Known"], [20, "Boss"], [30, "Big Name"], [40, "Island Star"], [50, "Legend"]];
const titleOf = (lv) => { let t = TITLES[0][1]; for (const [l, n] of TITLES) if (lv >= l) t = n; return t; };
const FLAT_REQ = { 5: 5, 6: 8, 7: 10, 8: 13, 9: 16, 10: 20 }; // the flat level on the left needs this player level (the flat is how you see your level)
const KINDS = { // what the phone may report: xp each time, how many count per day, seconds between two, and a bonus the first time ever
  shift: { xp: 12, cap: 15, gap: 8, first: 40, label: "A finished shift" },
  hustle: { xp: 25, cap: 8, gap: 8, first: 40, label: "A side hustle" },
  ferris: { xp: 6, cap: 3, gap: 30, first: 25, label: "A Ferris wheel ride" },
  promo: { xp: 60, cap: 3, gap: 5, first: 0, label: "A promotion at work" },
  visit: { xp: 0, cap: 12, gap: 20, first: 0, label: "Visiting a place" }, // gives no XP itself, only counts for "Your day"
  place: { xp: 25, cap: 3, gap: 10, first: 0, label: "A new place", keyed: true, keys: 40 } // once per place, never twice
};
const SERVER_KINDS = { flatStart: { xp: 20, cap: 4, label: "Starting a flat upgrade" }, flatDone: { xp: 0, cap: 4, label: "Finishing a flat upgrade" }, help: { xp: 15, cap: 6, label: "Helping a friend build" }, helped: { xp: 10, cap: 6, label: "A friend helped you" } };
const POOL = [ // "Your day": three small goals a day, one from each row, the same for the whole day (chosen from the player id and the date)
  [{ id: "shift2", k: "shift", n: 2, text: "Finish 2 shifts" }, { id: "shift3", k: "shift", n: 3, text: "Finish 3 shifts" }],
  [{ id: "hustle1", k: "hustle", n: 1, text: "Do a side hustle" }, { id: "hustle2", k: "hustle", n: 2, text: "Do 2 side hustles" }, { id: "ferris1", k: "ferris", n: 1, text: "Ride the Ferris wheel" }],
  [{ id: "visit3", k: "visit", n: 3, text: "Visit 3 places" }, { id: "visit5", k: "visit", n: 5, text: "Visit 5 places" }]
];
const GOAL_XP = 30, GOAL_CASH = 150, ALL_XP = 60, ALL_CASH = 400;
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const BUCKET = [ // the Island Checklist: Auntie Marie pays once for each, in any order (the server pays; nothing here can be done twice)
  { id: "ride", text: "Ride a vehicle", pay: 500 }, { id: "chat", text: "Send a chat message", pay: 200 }, { id: "snack", text: "Grab a snack", pay: 100 }, { id: "style", text: "Style your avatar at the mirror", pay: 300 },
  { id: "enter", text: "Walk into a shop or building", pay: 100 }, { id: "phone", text: "Open your phone", pay: 100 }, { id: "work", text: "Earn your first wages", pay: 500 }, { id: "fun", text: "Try something fun", pay: 300 }
]; const BUCKET_ALL = 400; // a bonus for finishing the whole list
const SOFT = 500; // after this much XP in a day, more XP counts half (nobody has to play for hours)
const SOCIAL = 1.25; // helping friends gives a quarter more
const gift = (lv) => (lv % 5 === 0 ? 500 : 100) * lv; // cash for reaching a level (a bigger one every 5th)

module.exports = function (X) {
  const { db, send, persist, peers, mailTo, allow, nameOf } = X;
  db.lvl = db.lvl && typeof db.lvl === "object" ? db.lvl : {};
  const dayNo = () => Math.floor((Date.now() + MUT) / 86400000);
  const rec = (uid) => { const r = db.lvl[uid] || (db.lvl[uid] = { xp: 0, level: 1, day: 0, today: 0, n: {}, last: {}, firsts: {}, places: 0, g: { day: 0, p: {}, done: {} }, streak: 0, lastAll: 0, fr: [], helps: 0, hide: false, bucket: {} }); if (!r.fr) { r.fr = []; r.helps = 0; r.hide = false; } if (!r.bucket) r.bucket = {}; if (!r.g) { r.g = { day: 0, p: {}, done: {} }; r.streak = 0; r.lastAll = 0; } if (r.g.day !== dayNo()) r.g = { day: dayNo(), p: {}, done: {} }; if (r.day !== dayNo()) { r.day = dayNo(); r.today = 0; r.n = {}; } return r; };
  const levelOfXp = (xp) => { let lv = 1, x = xp; while (lv < MAX && x >= need(lv)) { x -= need(lv); lv++; } return { level: lv, into: lv >= MAX ? 0 : x, need: lv >= MAX ? 0 : need(lv) }; };
  const level = (uid) => rec(uid).level;
  const goalsOf = (uid) => POOL.map((row, i) => row[hash(uid + ":" + dayNo() + ":" + i) % row.length]);
  function goalView(uid) { const r = rec(uid); return { goals: goalsOf(uid).map((g) => ({ id: g.id, text: g.text, n: g.n, have: Math.min(g.n, r.g.p[g.k] || 0), done: !!r.g.done[g.id], xp: GOAL_XP, cash: GOAL_CASH })), allDone: !!r.g.done.all, bonus: { xp: ALL_XP, cash: ALL_CASH }, streak: r.streak }; }
  function goalProgress(uid, kind) { // an accepted event counts toward today's goals; returns what was just finished
    const r = rec(uid); r.g.p[kind] = (r.g.p[kind] || 0) + 1; const fin = [];
    for (const g of goalsOf(uid)) if (g.k === kind && !r.g.done[g.id] && r.g.p[kind] >= g.n) { r.g.done[g.id] = 1; fin.push({ id: g.id, text: g.text, xp: GOAL_XP, cash: GOAL_CASH }); }
    return fin; }
  function view(uid) { const r = rec(uid), L = levelOfXp(r.xp), next = TITLES.find(([l]) => l > r.level), perks = Object.entries(FLAT_REQ).map(([f, l]) => ({ lv: l, text: "Flat level " + f + " opens", done: r.level >= l })).sort((a, b) => a.lv - b.lv);
    return Object.assign(goalView(uid), { ok: true, bucket: { items: BUCKET.map((b) => ({ id: b.id, text: b.text, pay: b.pay, done: !!r.bucket[b.id] })), all: !!r.bucket.all, bonus: BUCKET_ALL }, level: r.level, xp: r.xp, into: L.into, need: L.need, max: MAX, title: titleOf(r.level), nextTitle: next ? { lv: next[0], name: next[1] } : null, today: r.today, soft: SOFT, perks, nextGift: r.level < MAX ? gift(r.level + 1) : 0,
      ways: Object.keys(KINDS).filter((k) => k !== "visit").map((k) => ({ k, label: KINDS[k].label, xp: KINDS[k].xp, left: Math.max(0, KINDS[k].cap - (r.n[k] || 0)), first: KINDS[k].first && !r.firsts[k] ? KINDS[k].first : 0 })) }); }
  function push(uid, o) { for (const [, p] of peers) if (p.uid === uid && p.ws) send(p.ws, Object.assign({ t: "lvl", ev: "xp" }, o)); }
  function add(uid, amount, kind, social) { // add XP, pay for any levels reached, return what happened
    const r = rec(uid); let gain = Math.round(amount * (social ? SOCIAL : 1)); if (gain <= 0) return { gained: 0 }; if (r.today >= SOFT) gain = Math.max(1, Math.round(gain / 2));
    r.xp += gain; r.today += gain; const was = r.level, up = []; r.level = levelOfXp(r.xp).level;
    for (let l = was + 1; l <= r.level; l++) { const g = gift(l); up.push({ level: l, gift: g, title: titleOf(l), milestone: l % 5 === 0 }); if (mailTo) mailTo(uid, g, "Level " + l + " reward: " + titleOf(l), "Island Standing"); }
    persist(); return { gained: gain, up, level: r.level, kind };
  }
  function grant(uid, kind, amount, opt) { // used by the server's own modules (flat, help): the server decided it happened
    if (!db.players[uid]) return null; const K = SERVER_KINDS[kind]; if (!K) return null; const r = rec(uid); if ((r.n[kind] || 0) >= K.cap) return null; r.n[kind] = (r.n[kind] || 0) + 1;
    if (kind === "help") r.helps = (r.helps || 0) + 1;
    const out = add(uid, amount === undefined ? K.xp : amount, kind, !!(opt && opt.social)); if (out.gained) push(uid, Object.assign({ label: K.label }, out, { view: view(uid) })); return out; }

  // ---------------------------------------------------------------- the Standing card and the boards (they never reset)
  const flatLevel = (uid) => Number((db.flat && db.flat[uid] || {}).level) || 0;
  const regionOf = (uid) => String((db.where || {})[uid] || "");
  const BOARDS = { // name, how a player scores, what the number means
    level: { label: "Highest level", score: (u, r) => r.xp, show: (u, r) => "Level " + r.level + " · " + titleOf(r.level) },
    flat: { label: "Best flat", score: (u, r) => flatLevel(u) * 1e6 + r.xp, show: (u) => "Flat level " + flatLevel(u) },
    rich: { label: "Richest", score: (u) => Math.round(Number((db.players[u] || {}).money) || 0), show: (u) => "Rs " + Math.round(Number((db.players[u] || {}).money) || 0).toLocaleString("en") },
    helpful: { label: "Most helpful", score: (u, r) => r.helps || 0, show: (u, r) => (r.helps || 0) + " builds helped" },
    explorer: { label: "Explorer", score: (u, r) => r.places || 0, show: (u, r) => (r.places || 0) + " places found" }
  };
  const nm = (u) => (nameOf ? nameOf(u) : "") || String((db.players[u] || {}).name || "Someone").slice(0, 16);
  const alive = (u) => db.players[u] && !(db.removed || {})[u];
  const friendsOf = (uid) => (rec(uid).fr || []).filter(alive);
  function board(uid, scope, key) { const B = BOARDS[key]; if (!B) return null; const mine = rec(uid); let ids = Object.keys(db.lvl).filter((u) => alive(u) && db.lvl[u].xp > 0 && (u === uid || !db.lvl[u].hide));
    if (scope === "friends") { const f = new Set(friendsOf(uid)); f.add(uid); ids = ids.filter((u) => f.has(u)); } else if (scope === "region") { const rg = regionOf(uid); ids = ids.filter((u) => u === uid || (rg && regionOf(u) === rg)); }
    const rows = ids.map((u) => { const r = rec(u); return { uid: u, name: nm(u), level: r.level, score: B.score(u, r), text: B.show(u, r), you: u === uid, friend: friendsOf(uid).includes(u) }; }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)); rows.forEach((x, i) => { x.rank = i + 1; });
    const me = rows.find((x) => x.you) || null, pub = (x) => ({ uid: x.you ? "" : x.uid, id: x.uid, name: x.name, level: x.level, text: x.text, rank: x.rank, you: x.you, friend: x.friend });
    const top = rows.slice(0, 10).map(pub), near = me && me.rank > 10 ? rows.slice(Math.max(10, me.rank - 4), me.rank + 2).map(pub) : [];
    return { ok: true, scope, board: key, label: B.label, total: rows.length, top, near, me: me ? { rank: me.rank, text: me.text } : null }; }
  function card(uid, o) { if (!alive(o)) return null; const r = rec(o); if (r.hide && o !== uid) return { ok: true, hidden: true, name: nm(o) }; const L = levelOfXp(r.xp);
    return { ok: true, id: o, name: nm(o), you: o === uid, level: r.level, title: titleOf(r.level), xp: r.xp, flat: flatLevel(o), helps: r.helps || 0, places: r.places || 0, streak: r.streak || 0, region: regionOf(o), friend: friendsOf(uid).includes(o), money: BOARDS.rich.score(o), pct: L.need ? Math.round(L.into / L.need * 100) : 100, hide: !!r.hide }; }
  function befriend(a, b) { for (const [x, y] of [[a, b], [b, a]]) { if (x === y || !db.players[x] || !db.players[y]) continue; const r = rec(x); if (!r.fr.includes(y) && r.fr.length < 60) r.fr.push(y); } persist(); }
  function handle(ws, me, m) {
    const reply = (o) => send(ws, Object.assign({ t: "lvl", rid: m.rid }, o));
    if (!me.uid || !db.players[me.uid]) return reply({ ok: false, error: "Play a little first." }); if (!allow(me)) return reply({ ok: false, error: "Slow down a little." });
    const uid = me.uid;
    if (m.t === "lvl.state") return reply(view(uid));
    if (m.t === "lvl.bucket") { // an item of the Island Checklist happened: pay it once
      const b = BUCKET.find((q) => q.id === String(m.id || "")); if (!b) return reply({ ok: false, error: "No such item." }); const r = rec(uid); if (r.bucket[b.id]) return reply(Object.assign(view(uid), { ok: true, already: true }));
      r.bucket[b.id] = Date.now(); if (mailTo) mailTo(uid, b.pay, "Island checklist: " + b.text, "Auntie Marie"); const out = add(uid, 15, "bucket"); let bonus = 0; if (!r.bucket.all && BUCKET.every((q) => r.bucket[q.id])) { r.bucket.all = Date.now(); bonus = BUCKET_ALL; if (mailTo) mailTo(uid, BUCKET_ALL, "Island checklist complete", "Auntie Marie"); } persist();
      return reply(Object.assign(view(uid), { ok: true, paid: b.pay, bonus }, out));
    }
    if (m.t === "lvl.board") { const b = board(uid, m.scope === "friends" || m.scope === "region" ? m.scope : "island", String(m.board || "level")); return reply(b || { ok: false, error: "No such board." }); }
    if (m.t === "lvl.card") { const c = card(uid, String(m.id || uid)); return reply(c || { ok: false, error: "No such player." }); }
    if (m.t === "lvl.friend") { const o = String(m.id || ""); if (!alive(o) || o === uid) return reply({ ok: false, error: "No such player." }); const r = rec(uid); if (m.remove) { r.fr = r.fr.filter((x) => x !== o); persist(); return reply({ ok: true, friend: false }); } if (r.fr.length >= 60) return reply({ ok: false, error: "Your friends list is full." }); if (!r.fr.includes(o)) { r.fr.push(o); persist(); } return reply({ ok: true, friend: true }); }
    if (m.t === "lvl.hide") { rec(uid).hide = !!m.on; persist(); return reply({ ok: true, hide: !!m.on }); }
    if (m.t === "lvl.gain") {
      const k = String(m.kind || ""), K = KINDS[k]; if (!K) return reply({ ok: false, error: "That does not give XP." }); const r = rec(uid), now = Date.now();
      let amt = K.xp, key = "", fk = ""; if (K.keyed) { key = String(m.key || "").slice(0, 24).replace(/[^\w:.-]/g, ""); if (!key) return reply({ ok: false, error: "Which place?" }); fk = k + ":" + key; if (r.firsts[fk]) return reply(Object.assign(view(uid), { ok: true, gained: 0, seen: true })); }
      if ((r.n[k] || 0) >= K.cap || (K.keyed && r.places >= K.keys)) return reply(Object.assign(view(uid), { ok: true, gained: 0, capped: true })); if (now - (r.last[k] || 0) < K.gap * 1000) return reply(Object.assign(view(uid), { ok: true, gained: 0, wait: true }));
      if (K.keyed) { r.firsts[fk] = 1; r.places++; }
      else if (K.first && !r.firsts[k]) { r.firsts[k] = 1; amt += K.first; }
      r.last[k] = now; r.n[k] = (r.n[k] || 0) + 1; const out = add(uid, amt, k); const fin = goalProgress(uid, k); let bonus = null;
      if (fin.length) { for (const g of fin) { const o2 = add(uid, GOAL_XP, "goal"); out.gained += o2.gained; if (o2.up) out.up = (out.up || []).concat(o2.up); if (mailTo) mailTo(uid, GOAL_CASH, "Goal done: " + g.text, "Your day"); }
        if (!r.g.done.all && goalsOf(uid).every((g) => r.g.done[g.id])) { r.g.done.all = 1; r.streak = r.lastAll >= dayNo() - 2 ? r.streak + 1 : 1; r.lastAll = dayNo(); const o3 = add(uid, ALL_XP, "goal"); out.gained += o3.gained; if (o3.up) out.up = (out.up || []).concat(o3.up); if (mailTo) mailTo(uid, ALL_CASH, "Your day: all three goals", "Your day"); bonus = { xp: ALL_XP, cash: ALL_CASH, streak: r.streak }; } persist(); }
      return reply(Object.assign(view(uid), { ok: true, label: K.label, first: !!(K.first && amt > K.xp), goalsDone: fin, allDone: bonus }, out));
    }
    return reply({ ok: false, error: "Unknown request." });
  }
  return { handle, grant, befriend, board, card, level, view, titleOf, need, levelOfXp, FLAT_REQ, MAX };
};
