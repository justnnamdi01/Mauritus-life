// Your Place grows while you are away: timed upgrades of your flat (the first of the three things in docs/CORE.md section 3).
// The SERVER owns every timer and every price. Time is the server's clock, so closing the game, changing the phone's clock or reloading never changes it.
// You start an upgrade (the server charges the price and notes the time), you leave, and the flat is finished when the time is up, even if you are offline:
// a notification is scheduled for that moment. Playing speeds it up a little (a finished shift), and friends who visit can help (a few percent each).
// Prices and times are placeholders to be tuned with the pacing script (docs/CORE.md section 3.5).
"use strict";
const SCALE = Math.max(0.001, +process.env.UPG_TIME_SCALE || 1); // tests make the waits short
const MIN = 60, HOUR = 3600;
const LEVELS = [ // level, name, what you will see, price, seconds, comfort (a small bonus to rest at home)
  [1, "Fresh paint", "Smart wood panelling along the walls", 300, 2 * MIN],
  [2, "Warm lights", "Three hanging lamps over the room", 800, 10 * MIN],
  [3, "Window flowers", "Flower boxes on every window sill", 2000, 1 * HOUR],
  [4, "Gallery wall", "Framed pictures on the wall", 5000, 4 * HOUR],
  [5, "Cove lighting and trim", "A soft glowing ceiling edge and neat mouldings", 12000, 10 * HOUR],
  [6, "Indoor garden", "Hanging plants and wall shelves", 25000, 24 * HOUR],
  [7, "Chandelier", "A statement light in the middle of the room", 50000, 48 * HOUR],
  [8, "Mirror and panels", "A big mirror and slatted wood walls", 90000, 72 * HOUR],
  [9, "Smart home", "Glowing floor lights and a control panel", 150000, 120 * HOUR],
  [10, "Penthouse", "Gold trim, a crystal chandelier and your name on the wall", 250000, 168 * HOUR]
].map(([lv, name, desc, cost, secs]) => ({ lv, name, desc, cost, secs: Math.max(1, Math.round(secs * SCALE)), comfort: lv * 3 }));
const NUDGE_SECS = 120, NUDGE_MAX = 6, NUDGE_GAP = 45000; // finished shifts shave 2 minutes off, six times per upgrade, not faster than one every 45 seconds
const HELP_PCT = 0.05, HELP_MAX = 5, HELP_PAY = 40, HELP_DAY_PAY = 5; // each friend's help takes 5% off (five at most); the helper is thanked with Rs 40 (five a day)
const MUT = 4 * 3600000;

module.exports = function (X) {
  const { db, send, allow, mailTo, persist, peers, NOTIFY, nameOf } = X;
  db.flat = db.flat && typeof db.flat === "object" ? db.flat : {};
  const rec = (uid) => db.flat[uid] || (db.flat[uid] = { level: 0, run: null, slots: 1, helped: {} });
  const money = (me) => Number((db.players[me.uid] || {}).money) || 0;
  const dayNo = () => Math.floor((Date.now() + MUT) / 86400000);
  function settle(uid) { // if the time is up, the flat is finished (done on every request, so it is true whether or not the player was online)
    const r = rec(uid), run = r.run; if (!run || Date.now() < run.t1) return null; r.level = Math.max(r.level, run.to); r.run = null; r.ready = { level: r.level, at: run.t1 }; persist(); return r.ready; }
  const view = (uid) => { settle(uid); const r = rec(uid), next = LEVELS[r.level], run = r.run; return { ok: true, now: Date.now(), slots: r.slots, level: r.level, max: LEVELS.length, comfort: r.level * 3, next: next ? { to: next.lv, name: next.name, desc: next.desc, cost: next.cost, secs: next.secs } : null, run: run ? { to: run.to, name: LEVELS[run.to - 1].name, desc: LEVELS[run.to - 1].desc, t0: run.t0, t1: run.t1, total: run.total, helps: run.helps.length, nudges: run.nudges } : null, ready: r.ready || null, levels: LEVELS.map((l) => ({ lv: l.lv, name: l.name, desc: l.desc, cost: l.cost, secs: l.secs })) }; };
  function announce(uid, level, name) { for (const [, p] of peers) if (p.uid === uid && p.ws) send(p.ws, { t: "flat", ev: "ready", level, name }); }
  function plan(uid) { // schedule (or reschedule) the "ready" notification
    const r = rec(uid); if (!NOTIFY) return; if (!r.run) { NOTIFY.cancel(uid, "flat"); return; } const l = LEVELS[r.run.to - 1]; NOTIFY.schedule(uid, r.run.t1, { kind: "build", tag: "flat", title: "🏠 Your flat is ready", body: "Level " + l.lv + ", \"" + l.name + "\", is finished. Come and see it." }); }
  function handle(ws, me, m) {
    const reply = (o) => send(ws, Object.assign({ t: "flat", rid: m.rid }, o));
    if (!me.uid || !db.players[me.uid]) return reply({ ok: false, error: "Play a little first." }); if (!allow(me)) return reply({ ok: false, error: "Slow down a little." });
    const uid = me.uid, now = Date.now();
    if (m.t === "flat.state") return reply(view(uid));
    if (m.t === "flat.start") {
      settle(uid); const r = rec(uid); if (r.run) return reply(Object.assign(view(uid), { ok: true, again: true, paid: 0 })); // asked twice: the same upgrade, no second charge
      const next = LEVELS[r.level]; if (!next) return reply({ ok: false, error: "Your flat is already a penthouse." });
      if (money(me) < next.cost) return reply({ ok: false, error: "You need Rs " + next.cost.toLocaleString("en") + " for " + next.name + "." });
      r.run = { to: next.lv, t0: now, t1: now + next.secs * 1000, total: next.secs, helps: [], nudges: 0, lastNudge: 0 }; r.ready = null; persist(); plan(uid); return reply(Object.assign(view(uid), { ok: true, paid: next.cost }));
    }
    if (m.t === "flat.ack") { const r = rec(uid); r.ready = null; persist(); return reply({ ok: true }); }
    if (m.t === "flat.nudge") { // playing speeds the builders up a little
      settle(uid); const r = rec(uid), run = r.run; if (!run) return reply({ ok: false, error: "Nothing is being built." }); if (run.nudges >= NUDGE_MAX) return reply({ ok: false, error: "The builders are going as fast as they can.", full: true }); if (now - (run.lastNudge || 0) < NUDGE_GAP) return reply({ ok: false, error: "Wait a moment.", wait: true });
      run.nudges++; run.lastNudge = now; run.t1 = Math.max(now + 1000, run.t1 - NUDGE_SECS * 1000 * SCALE); persist(); plan(uid); return reply(Object.assign(view(uid), { ok: true, saved: Math.round(NUDGE_SECS * SCALE) }));
    }
    if (m.t === "flat.peek") { const o = String(m.owner || ""); if (!db.players[o]) return reply({ ok: false, error: "No such player." }); settle(o); const r = rec(o); return reply({ ok: true, name: nameOf ? nameOf(o) : "", level: r.level, running: !!r.run, left: r.run ? Math.max(0, Math.ceil((r.run.t1 - now) / 1000)) : 0, helps: r.run ? r.run.helps.length : 0, helped: r.run ? r.run.helps.includes(uid) : false, max: HELP_MAX }); }
    if (m.t === "flat.help") { // a friend lends a hand
      const o = String(m.owner || ""); if (!db.players[o]) return reply({ ok: false, error: "No such player." }); if (o === uid) return reply({ ok: false, error: "Ask a friend to help with your own flat." });
      settle(o); const r = rec(o), run = r.run; if (!run) return reply({ ok: false, error: "Nothing is being built there right now." }); if (run.helps.includes(uid)) return reply({ ok: false, error: "You have already helped with this one." }); if (run.helps.length >= HELP_MAX) return reply({ ok: false, error: "They already have all the help they need." });
      const cut = Math.max(1, Math.round(run.total * HELP_PCT)); run.helps.push(uid); run.t1 = Math.max(now + 1000, run.t1 - cut * 1000); const h = rec(uid); if (h.helpDay !== dayNo()) { h.helpDay = dayNo(); h.helpN = 0; } let thanks = 0; if (h.helpN < HELP_DAY_PAY) { h.helpN++; thanks = HELP_PAY; mailTo(uid, HELP_PAY, "Thanks for helping build a flat", nameOf ? nameOf(o) : "A friend"); }
      persist(); plan(o); if (NOTIFY) NOTIFY.sendNow(o, { kind: "friend", tag: "help:" + uid, title: "🔨 " + (nameOf ? nameOf(uid) : "A friend") + " helped build your flat", body: "A few minutes were taken off the work." }); return reply({ ok: true, cut, thanks, left: run.helps.length >= HELP_MAX ? 0 : HELP_MAX - run.helps.length });
    }
    return reply({ ok: false, error: "Unknown request." });
  }
  function tick() { // tell players whose flat just finished (the ones who are not here get a notification instead)
    for (const uid of Object.keys(db.flat)) { const r = db.flat[uid]; if (r.run && Date.now() >= r.run.t1) { const rd = settle(uid); if (rd) announce(uid, rd.level, LEVELS[rd.level - 1].name); } }
  }
  return { handle, tick, view, LEVELS, settle };
};
