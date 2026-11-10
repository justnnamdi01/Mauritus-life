// Side hustles in Port Louis: the small jobs people really do on the island for a bit of extra money (selling gato piment on the street, fishing off the quay, busking at the stage).
// The SERVER decides what a hustle costs, how long it takes, what it pays and how many a player may do a day. The phone only acts it out.
// A run is: hustle.start (the server notes the time and charges the stake) then hustle.finish after the time is up (the server pays by mail). Safe to repeat: a finish with no open run pays nothing.
"use strict";
const crypto = require("crypto");
const rnd = (n) => crypto.randomInt(n);
const between = (a, b) => a + rnd(b - a + 1);
const SCALE = Math.max(0.05, +process.env.HUSTLE_TIME_SCALE || 1); // tests make the waits short

const DEFS = { // secs: how long it takes on screen · cool: seconds before the next one · cap: runs a day · from/to: opening hours (Mauritius time)
  gato: { name: "Gato piment round", icon: "🧺", where: "Victoria Urban Terminal", cost: 120, secs: 40, cool: 45, cap: 8, from: 6, to: 20, pay: [260, 420], blurb: "Buy a basket of gato piment and sell it to the people of Port Louis." },
  fish: { name: "Fish off the quay", icon: "🎣", where: "the Caudan waterfront", cost: 60, secs: 48, cool: 40, cap: 8, from: 5, to: 20, blurb: "Cast a line from the quay. Bring home what bites." },
  busk: { name: "Busk at the stage", icon: "🎤", where: "the waterfront stage", cost: 0, secs: 45, cool: 90, cap: 5, from: 17, to: 23, pay: [220, 640], blurb: "Sing a sega for the evening crowd. They tip what they like." }
};
const FISH = [["Sardine", "🐟", 150, 50], ["Vieille", "🐠", 300, 28], ["Capitaine", "🐡", 560, 14], ["Thon", "🐟", 1000, 6], ["an old boot", "👢", 10, 2]]; // what bites: name, icon, what the market pays, weight
const DAY_CAP = 4500; // the most a player can earn from all hustles in a day
const MUT = 4 * 3600000;

module.exports = function (X) {
  const { db, send, allow, mailTo, persist, nameOf } = X;
  db.hustle = db.hustle && typeof db.hustle === "object" ? db.hustle : {};
  const regionOf = (me) => me.curRg || (db.where || {})[me.uid] || "";
  const money = (me) => Number((db.players[me.uid] || {}).money) || 0;
  const day = () => Math.floor((Date.now() + MUT) / 86400000), hour = () => (process.env.HUSTLE_FAKE_HOUR !== undefined ? +process.env.HUSTLE_FAKE_HOUR : new Date(Date.now() + MUT).getUTCHours()); // tests can fix the hour
  const openNow = (d) => hour() >= d.from && hour() < d.to;
  const rec = (uid) => { const h = db.hustle[uid] || (db.hustle[uid] = { day: 0, runs: {}, earned: 0, last: {}, run: null }); if (h.day !== day()) { h.day = day(); h.runs = {}; h.earned = 0; } return h; };
  const pickFish = () => { let t = 0; for (const f of FISH) t += f[3]; let r = rnd(t * 10) / 10; for (const f of FISH) { if (r < f[3]) return f; r -= f[3]; } return FISH[0]; };
  function view(uid) { const h = rec(uid), now = Date.now(), out = {}; for (const id of Object.keys(DEFS)) { const d = DEFS[id]; out[id] = { name: d.name, icon: d.icon, where: d.where, cost: d.cost, secs: d.secs, cap: d.cap, from: d.from, to: d.to, blurb: d.blurb, runs: h.runs[id] || 0, open: openNow(d), wait: Math.max(0, Math.ceil(((h.last[id] || 0) + d.cool * 1000 * SCALE - now) / 1000)) }; } return { ok: true, defs: out, earned: h.earned, dayCap: DAY_CAP, running: h.run && now - h.run.t0 < 15 * 60000 ? h.run.id : "" }; }
  function handle(ws, me, m) {
    const reply = (o) => send(ws, Object.assign({ t: "hustle", rid: m.rid }, o));
    if (!me.uid || !db.players[me.uid]) return reply({ ok: false, error: "Play a little first." }); if (!allow(me)) return reply({ ok: false, error: "Slow down a little." });
    const uid = me.uid, h = rec(uid), now = Date.now();
    if (m.t === "hustle.state") return reply(view(uid));
    if (regionOf(me) !== "portlouis") return reply({ ok: false, error: "These hustles are in Port Louis." });
    const id = String(m.id || ""), d = DEFS[id]; if (!d) return reply({ ok: false, error: "No such hustle." });
    if (m.t === "hustle.start") {
      if (h.run && now - h.run.t0 < d.secs * 1000 * SCALE * 3 && h.run.id === id) return reply({ ok: true, again: true, secs: d.secs, paid: 0, id }); // asked twice: the same run
      if (!openNow(d)) return reply({ ok: false, error: d.name + " is open " + String(d.from).padStart(2, "0") + ":00 to " + String(d.to).padStart(2, "0") + ":00." });
      if ((h.runs[id] || 0) >= d.cap) return reply({ ok: false, error: "That is enough " + d.name.toLowerCase() + " for today. Come back tomorrow." });
      if (h.earned >= DAY_CAP) return reply({ ok: false, error: "You have made plenty from side hustles today. Rest, or work your main job." });
      const wait = Math.ceil(((h.last[id] || 0) + d.cool * 1000 * SCALE - now) / 1000); if (wait > 0) return reply({ ok: false, error: "Catch your breath: " + wait + " more seconds.", wait });
      if (money(me) < d.cost) return reply({ ok: false, error: "You need Rs " + d.cost + " to start." });
      h.run = { id, t0: now, token: crypto.randomBytes(6).toString("hex") }; persist(); return reply({ ok: true, secs: d.secs, paid: d.cost, id, token: h.run.token });
    }
    if (m.t === "hustle.finish") {
      const r = h.run; if (!r || r.id !== id) return reply({ ok: false, error: "No hustle to finish." });
      const el = now - r.t0; if (el < d.secs * 1000 * SCALE * 0.85) return reply({ ok: false, error: "It is not finished yet." });
      h.run = null; h.last[id] = now; h.runs[id] = (h.runs[id] || 0) + 1;
      let pay, extra = {}; if (id === "fish") { const f = pickFish(); pay = f[2]; extra = { fish: f[0], icon: f[1] }; } else pay = between(d.pay[0], d.pay[1]);
      pay = Math.min(pay, Math.max(0, DAY_CAP - h.earned)); h.earned += pay; if (pay >= 1) mailTo(uid, pay, d.name, "Port Louis street"); persist();
      return reply(Object.assign({ ok: true, payout: pay, profit: pay - d.cost, id, left: d.cap - h.runs[id] }, extra));
    }
    return reply({ ok: false, error: "Unknown request." });
  }
  return { handle, view, DEFS, FISH, DAY_CAP };
};
