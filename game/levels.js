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
  place: { xp: 25, cap: 3, gap: 10, first: 0, label: "A new place", keyed: true, keys: 40 } // once per place, never twice
};
const SERVER_KINDS = { flatStart: { xp: 20, cap: 4, label: "Starting a flat upgrade" }, flatDone: { xp: 0, cap: 4, label: "Finishing a flat upgrade" }, help: { xp: 15, cap: 6, label: "Helping a friend build" }, helped: { xp: 10, cap: 6, label: "A friend helped you" } };
const SOFT = 500; // after this much XP in a day, more XP counts half (nobody has to play for hours)
const SOCIAL = 1.25; // helping friends gives a quarter more
const gift = (lv) => (lv % 5 === 0 ? 500 : 100) * lv; // cash for reaching a level (a bigger one every 5th)

module.exports = function (X) {
  const { db, send, persist, peers, mailTo, allow } = X;
  db.lvl = db.lvl && typeof db.lvl === "object" ? db.lvl : {};
  const dayNo = () => Math.floor((Date.now() + MUT) / 86400000);
  const rec = (uid) => { const r = db.lvl[uid] || (db.lvl[uid] = { xp: 0, level: 1, day: 0, today: 0, n: {}, last: {}, firsts: {}, places: 0 }); if (r.day !== dayNo()) { r.day = dayNo(); r.today = 0; r.n = {}; } return r; };
  const levelOfXp = (xp) => { let lv = 1, x = xp; while (lv < MAX && x >= need(lv)) { x -= need(lv); lv++; } return { level: lv, into: lv >= MAX ? 0 : x, need: lv >= MAX ? 0 : need(lv) }; };
  const level = (uid) => rec(uid).level;
  function view(uid) { const r = rec(uid), L = levelOfXp(r.xp), next = TITLES.find(([l]) => l > r.level), perks = Object.entries(FLAT_REQ).map(([f, l]) => ({ lv: l, text: "Flat level " + f + " opens", done: r.level >= l })).sort((a, b) => a.lv - b.lv);
    return { ok: true, level: r.level, xp: r.xp, into: L.into, need: L.need, max: MAX, title: titleOf(r.level), nextTitle: next ? { lv: next[0], name: next[1] } : null, today: r.today, soft: SOFT, perks, nextGift: r.level < MAX ? gift(r.level + 1) : 0,
      ways: Object.keys(KINDS).map((k) => ({ k, label: KINDS[k].label, xp: KINDS[k].xp, left: Math.max(0, KINDS[k].cap - (r.n[k] || 0)), first: KINDS[k].first && !r.firsts[k] ? KINDS[k].first : 0 })) }; }
  function push(uid, o) { for (const [, p] of peers) if (p.uid === uid && p.ws) send(p.ws, Object.assign({ t: "lvl", ev: "xp" }, o)); }
  function add(uid, amount, kind, social) { // add XP, pay for any levels reached, return what happened
    const r = rec(uid); let gain = Math.round(amount * (social ? SOCIAL : 1)); if (gain <= 0) return { gained: 0 }; if (r.today >= SOFT) gain = Math.max(1, Math.round(gain / 2));
    r.xp += gain; r.today += gain; const was = r.level, up = []; r.level = levelOfXp(r.xp).level;
    for (let l = was + 1; l <= r.level; l++) { const g = gift(l); up.push({ level: l, gift: g, title: titleOf(l), milestone: l % 5 === 0 }); if (mailTo) mailTo(uid, g, "Level " + l + " reward: " + titleOf(l), "Island Standing"); }
    persist(); return { gained: gain, up, level: r.level, kind };
  }
  function grant(uid, kind, amount, opt) { // used by the server's own modules (flat, help): the server decided it happened
    if (!db.players[uid]) return null; const K = SERVER_KINDS[kind]; if (!K) return null; const r = rec(uid); if ((r.n[kind] || 0) >= K.cap) return null; r.n[kind] = (r.n[kind] || 0) + 1;
    const out = add(uid, amount === undefined ? K.xp : amount, kind, !!(opt && opt.social)); if (out.gained) push(uid, Object.assign({ label: K.label }, out, { view: view(uid) })); return out; }
  function handle(ws, me, m) {
    const reply = (o) => send(ws, Object.assign({ t: "lvl", rid: m.rid }, o));
    if (!me.uid || !db.players[me.uid]) return reply({ ok: false, error: "Play a little first." }); if (!allow(me)) return reply({ ok: false, error: "Slow down a little." });
    const uid = me.uid;
    if (m.t === "lvl.state") return reply(view(uid));
    if (m.t === "lvl.gain") {
      const k = String(m.kind || ""), K = KINDS[k]; if (!K) return reply({ ok: false, error: "That does not give XP." }); const r = rec(uid), now = Date.now();
      let amt = K.xp, key = "", fk = ""; if (K.keyed) { key = String(m.key || "").slice(0, 24).replace(/[^\w:.-]/g, ""); if (!key) return reply({ ok: false, error: "Which place?" }); fk = k + ":" + key; if (r.firsts[fk]) return reply(Object.assign(view(uid), { ok: true, gained: 0, seen: true })); }
      if ((r.n[k] || 0) >= K.cap || (K.keyed && r.places >= K.keys)) return reply(Object.assign(view(uid), { ok: true, gained: 0, capped: true })); if (now - (r.last[k] || 0) < K.gap * 1000) return reply(Object.assign(view(uid), { ok: true, gained: 0, wait: true }));
      if (K.keyed) { r.firsts[fk] = 1; r.places++; }
      else if (K.first && !r.firsts[k]) { r.firsts[k] = 1; amt += K.first; }
      r.last[k] = now; r.n[k] = (r.n[k] || 0) + 1; const out = add(uid, amt, k); return reply(Object.assign(view(uid), { ok: true, label: K.label, first: !!(K.first && amt > K.xp) }, out));
    }
    return reply({ ok: false, error: "Unknown request." });
  }
  return { handle, grant, level, view, titleOf, need, levelOfXp, FLAT_REQ, MAX };
};
