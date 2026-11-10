// Notifications: web push to a player's phone, sent by the server. A player chooses what they get and can switch it all off.
// Rules (the design in docs/CORE.md): at most TWO a day per player, none between 23:00 and 07:00 Mauritius time, nothing while the player is already playing,
// and only for things the player cares about (a daily reward waiting, the evening show, a friend who joined, and later an upgrade that finished or a mission).
// The keys never leave the server's data file. Needs the "web-push" package. Tests set PUSH_TEST=1 to record messages instead of sending them.
"use strict";
const crypto = require("crypto");
let webpush = null; try { webpush = require("web-push"); } catch (e) { console.warn("notify: web-push is not installed, push is off"); }
const KINDS = { daily: "Daily reward waiting", event: "Tonight's show and weekly events", friend: "A friend joined or messaged", build: "An upgrade or business is ready", story: "A new mission is waiting" };
const DAY_MAX = 2, QUIET_FROM = 23, QUIET_TO = 7, MUT = 4 * 3600000; // Mauritius is UTC+4 all year
const TEST = !!process.env.PUSH_TEST;

const quietAt = (t) => { const h = new Date(t + MUT).getUTCHours(); return h >= QUIET_FROM || h < QUIET_TO; };
module.exports = function (X) {
  const { db, send, allow, persist, peers } = X;
  const P = (db.push = db.push && typeof db.push === "object" ? db.push : {}); P.subs = P.subs || {}; P.prefs = P.prefs || {}; P.sent = P.sent || {}; P.queue = P.queue || []; P.done = P.done || {};
  if (webpush && !(P.vapid && P.vapid.publicKey)) { P.vapid = webpush.generateVAPIDKeys(); persist(); }
  if (webpush && P.vapid) webpush.setVapidDetails(process.env.PUSH_CONTACT || "mailto:hello@mauritiuslife.mu", P.vapid.publicKey, P.vapid.privateKey);
  const log = []; // tests: what would have been sent
  const mutHour = (t) => new Date((t || Date.now()) + MUT).getUTCHours(), mutDay = (t) => Math.floor(((t || Date.now()) + MUT) / 86400000);
  const quiet = (t) => { const h = mutHour(t); return h >= QUIET_FROM || h < QUIET_TO; };
  const nextOpen = (t) => { let x = t; while (quiet(x)) x += 15 * 60000; return x; }; // the first moment that is not in the quiet hours
  const online = (uid) => { for (const [, p] of peers) if (p.uid === uid && p.ws && !p.away) return true; return false; };
  const prefsOf = (uid) => { const p = P.prefs[uid] || (P.prefs[uid] = { on: true, kinds: {} }); return p; };
  const wants = (uid, kind) => { const p = prefsOf(uid); return p.on !== false && p.kinds[kind] !== false && (P.subs[uid] || []).length > 0; };
  const sentToday = (uid, t) => (P.sent[uid] || []).filter((x) => (t || Date.now()) - x < 86400000).length;

  async function deliver(uid, item, force) { // send one message to every device the player has registered
    const now = Date.now(); if (!force) { if (!wants(uid, item.kind) || sentToday(uid) >= DAY_MAX) return false; if (online(uid)) return false; }
    const payload = JSON.stringify({ title: item.title, body: item.body, tag: item.tag || item.kind, url: item.url || "./", kind: item.kind });
    if (!(force && item.tag === "test")) P.sent[uid] = (P.sent[uid] || []).filter((x) => now - x < 86400000).concat(now); // a test never uses up the day
    if (TEST || !webpush) { log.push({ uid, kind: item.kind, title: item.title, body: item.body, tag: item.tag || item.kind, at: now }); persist(); return true; }
    const subs = P.subs[uid] || [], dead = []; await Promise.all(subs.map((sub) => webpush.sendNotification(sub, payload, { TTL: 6 * 3600, urgency: "normal" }).catch((e) => { if (e && (e.statusCode === 404 || e.statusCode === 410)) dead.push(sub.endpoint); })));
    if (dead.length) P.subs[uid] = subs.filter((s) => !dead.includes(s.endpoint)); persist(); return true;
  }
  function schedule(uid, at, item) { // send later (an upgrade that finishes at a known time); the same tag replaces an earlier one
    if (!uid || !(P.subs[uid] || []).length) return false; P.queue = P.queue.filter((q) => !(q.uid === uid && q.tag && q.tag === item.tag)); P.queue.push(Object.assign({ id: crypto.randomBytes(5).toString("hex"), uid, at: Math.max(at, Date.now()) }, item)); if (P.queue.length > 5000) P.queue.splice(0, P.queue.length - 5000); persist(); return true; }
  function cancel(uid, tag) { const n = P.queue.length; P.queue = P.queue.filter((q) => !(q.uid === uid && q.tag === tag)); if (P.queue.length !== n) persist(); }
  function sendNow(uid, item) { return deliver(uid, item, false); } // send right now, if the rules allow
  function tick() { // every 30 seconds: due messages, then the daily ones
    const t = Date.now(), due = P.queue.filter((q) => q.at <= t); if (due.length) { P.queue = P.queue.filter((q) => q.at > t); for (const q of due) { if (quiet(t)) { P.queue.push(Object.assign(q, { at: nextOpen(t) })); continue; } deliver(q.uid, q, false); } persist(); }
    const h = mutHour(t), m = new Date(t + MUT).getUTCMinutes(), day = mutDay(t);
    if (h === 16 && m >= 45 && P.done.stage !== day) { P.done.stage = day; for (const uid of Object.keys(P.subs)) deliver(uid, { kind: "event", tag: "stage:" + day, title: "🎤 Sega on the stage in 15 minutes", body: "The waterfront stage in Port Louis starts at 17:00. Come and dance, or busk for tips." }, false); persist(); }
    if (h === 8 && m >= 30 && P.done.daily !== day && typeof X.dailyState === "function") { P.done.daily = day; for (const uid of Object.keys(P.subs)) { const st = X.dailyState(uid); if (st && st.canClaim) deliver(uid, { kind: "daily", tag: "daily:" + day, title: st.streak >= 2 ? "🔥 Keep your " + st.streak + "-day streak" : "🎁 Your daily reward is waiting", body: st.streak >= 2 ? "Day " + st.next + " is ready. One tap and it is yours." : "Open the game and collect today's reward." }, false); } persist(); }
  }
  const okSub = (s) => s && typeof s === "object" && typeof s.endpoint === "string" && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 700 && s.keys && typeof s.keys.p256dh === "string" && typeof s.keys.auth === "string" && s.keys.p256dh.length < 200 && s.keys.auth.length < 100;
  function handle(ws, me, m) {
    const reply = (o) => send(ws, Object.assign({ t: "push", rid: m.rid }, o)); if (!me.uid || !db.players[me.uid]) return reply({ ok: false, error: "Play a little first." }); if (!allow(me)) return reply({ ok: false, error: "Slow down a little." });
    const uid = me.uid, view = () => { const p = prefsOf(uid); return { ok: true, key: P.vapid ? P.vapid.publicKey : "", supported: !!webpush, devices: (P.subs[uid] || []).length, on: p.on !== false, kinds: Object.keys(KINDS).reduce((o, k) => { o[k] = { label: KINDS[k], on: p.kinds[k] !== false }; return o; }, {}), today: sentToday(uid), max: DAY_MAX }; };
    if (m.t === "push.state") return reply(view());
    if (m.t === "push.sub") { if (!webpush) return reply({ ok: false, error: "Notifications are not available on this server." }); const s = m.sub; if (!okSub(s)) return reply({ ok: false, error: "That device could not be registered." }); const list = (P.subs[uid] || []).filter((x) => x.endpoint !== s.endpoint); list.push({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth }, at: Date.now() }); P.subs[uid] = list.slice(-3); prefsOf(uid).on = true; persist(); return reply(view()); }
    if (m.t === "push.unsub") { P.subs[uid] = (P.subs[uid] || []).filter((x) => x.endpoint !== String(m.endpoint || "")); if (m.all) P.subs[uid] = []; persist(); return reply(view()); }
    if (m.t === "push.prefs") { const p = prefsOf(uid); if (typeof m.on === "boolean") p.on = m.on; if (m.kinds && typeof m.kinds === "object") for (const k of Object.keys(KINDS)) if (typeof m.kinds[k] === "boolean") p.kinds[k] = m.kinds[k]; persist(); return reply(view()); }
    if (m.t === "push.test") { P.testAt = P.testAt || {}; if (Date.now() - (P.testAt[uid] || 0) < 20000) return reply({ ok: false, error: "Wait a few seconds between tests." }); P.testAt[uid] = Date.now(); if (!(P.subs[uid] || []).length) return reply({ ok: false, error: "Turn notifications on first." }); deliver(uid, { kind: "event", tag: "test", title: "🔔 It works", body: "You will get a heads-up like this when something you care about is ready." }, true); return reply(Object.assign(view(), { sent: true })); }
    return reply({ ok: false, error: "Unknown request." });
  }
  return { handle, tick, schedule, cancel, sendNow, log, TEST, KINDS, DAY_MAX, quiet, mutDay };
};
module.exports.quietAt = quietAt; module.exports.KINDS = KINDS; module.exports.DAY_MAX = DAY_MAX;
