// Port Louis, server side: the casino, the job challenges and the street market. The server decides every result and every payout; the phone only shows them.
// Money that comes from nowhere (job bonuses) is capped and arrives by mail like any other payment. Money between players goes through the server too.
"use strict";
const crypto = require("crypto");
const CASINO = require("./casino.js");
const rnd = (n) => crypto.randomInt(n);
const pick = (a) => a[rnd(a.length)];

const GOODS = { // what a street hawker can sell: cost is what the wholesaler charges, base is a fair price (sellers may set 70% to 200% of it)
  tea: { name: "Vanilla tea", icon: "🍵", cost: 40, base: 80, fx: { hunger: 8, fun: 10, energy: 4 } },
  cover: { name: "Phone cover", icon: "📱", cost: 50, base: 110, fx: { fun: 12 } },
  shades: { name: "Sunglasses", icon: "🕶️", cost: 70, base: 150, fx: { fun: 14 } },
  tee: { name: "Souvenir T-shirt", icon: "👕", cost: 90, base: 180, fx: { fun: 16 } },
  drum: { name: "Handmade ravanne", icon: "🥁", cost: 250, base: 520, fx: { fun: 30, social: 6 } }
};
const LICENCE_FEE = 150, FEE_RATE = 0.06, MAX_STOCK = 30, STALL_LIFE = 2 * 3600000, RAID_AFTER = 90000, RAID_CHANCE = 0.12; // a licensed pitch costs Rs 150 for two hours; the market keeps 6% of every sale; wild stalls risk a visit from the Police Municipale
const JOB_COOLDOWN = 8 * 60000, JOB_DAY_CAP = 4000, COURIER_LIMIT = 150;
const TEST = !!process.env.MARKET_TEST; // tests only: raids come quickly
const RAID_AFTER_T = TEST ? 600 : RAID_AFTER, RAID_CHANCE_T = TEST ? 1 : RAID_CHANCE;

module.exports = function (X) {
  const { db, send, allow, mailTo, persist, peers, nameOf, REG, townSys } = X;
  db.casino = db.casino && typeof db.casino === "object" ? db.casino : {}; db.casino.stat = db.casino.stat || { in: 0, out: 0, rounds: 0 }; db.casino.hist = db.casino.hist || {};
  db.capital = db.capital && typeof db.capital === "object" ? db.capital : {}; db.capital.earn = db.capital.earn || {}; db.capital.last = db.capital.last || {};
  const hands = new Map(), challenges = new Map(), stalls = new Map(); // open blackjack hands, open challenges, open stalls (all in memory: a restart just clears them)
  const PL = () => REG.LAYOUT.find((r) => r.id === "portlouis");
  const regionOf = (me) => me.curRg || (db.where || {})[me.uid] || "";
  const money = (me) => Number((db.players[me.uid] || {}).money) || 0;
  const dayKey = () => Math.floor(Date.now() / 86400000);
  const ok = (me, reply) => { if (!me.uid || !db.players[me.uid]) { reply({ ok: false, error: "Play a little first." }); return false; } if (!allow(me)) { reply({ ok: false, error: "Slow down a little." }); return false; } if (regionOf(me) !== "portlouis") { reply({ ok: false, error: "That is in Port Louis." }); return false; } return true; };
  const posOf = (me) => { const p = me.presence || {}; return p.in ? null : { x: Number(p.x), y: Number(p.y) }; };
  const peerOf = (uid) => { for (const [, p] of peers) if (p.uid === uid) return p; return null; };

  // ---------------- the casino
  db.casino.excl = db.casino.excl && typeof db.casino.excl === "object" ? db.casino.excl : {}; // uid -> when a player's self-exclusion ends
  const exclLeft = (uid) => Math.max(0, (db.casino.excl[uid] || 0) - Date.now());
  const hist = (uid) => (db.casino.hist[uid] = db.casino.hist[uid] || []);
  function lossInfo(uid) { const now = Date.now(); return CASINO.lossLast(hist(uid), now); }
  function settle(uid, paid, payout) { const now = Date.now(); CASINO.note(hist(uid), now, payout - paid); db.casino.stat.in += paid; db.casino.stat.out += payout; db.casino.stat.rounds++; persist(); }
  function stakeOf(m, me, reply) { if (exclLeft(me.uid)) { reply({ ok: false, error: "You excluded yourself from the casino until " + new Date(db.casino.excl[me.uid]).toUTCString().slice(5, 22) + " UTC. The house will not take your bets until then.", excluded: db.casino.excl[me.uid] }); return 0; } const stake = Math.floor(Number(m.stake)); if (!(stake >= CASINO.MIN_BET && stake <= CASINO.MAX_BET)) { reply({ ok: false, error: "Bets are from Rs " + CASINO.MIN_BET + " to Rs " + CASINO.MAX_BET.toLocaleString("en") + "." }); return 0; }
    if (money(me) < stake) { reply({ ok: false, error: "You don't have Rs " + stake.toLocaleString("en") + "." }); return 0; }
    if (lossInfo(me.uid) >= CASINO.LOSS_CAP) { reply({ ok: false, error: "The house asks you to take a break: you have lost Rs " + lossInfo(me.uid).toLocaleString("en") + " in the last hour. Come back later." }); return 0; } return stake; }
  function casinoWs(me, m, reply) {
    if (m.t === "casino.state") { const h = hands.get(me.uid); return reply({ ok: true, min: CASINO.MIN_BET, max: CASINO.MAX_BET, cap: CASINO.LOSS_CAP, lossHour: Math.max(0, lossInfo(me.uid)), open: h && !h.done ? CASINO.bjView(h) : null, excluded: exclLeft(me.uid) ? db.casino.excl[me.uid] : 0, rtp: { slots: CASINO.slotsRtp(), roulette: 36 / 37, blackjack: 0.94 }, triples: CASINO.TRIPLE }); }
    if (m.t === "casino.exclude") { const days = Math.floor(Number(m.days)); if (![1, 7, 30].includes(days)) return reply({ ok: false, error: "Choose 1, 7 or 30 days." }); const until = Date.now() + days * 86400000; if (until > (db.casino.excl[me.uid] || 0)) { db.casino.excl[me.uid] = until; persist(); } return reply({ ok: true, excluded: db.casino.excl[me.uid], note: "Self-exclusion can be made longer but never shorter." }); }
    if (m.t === "casino.roulette") { if (hands.has(me.uid) && !hands.get(me.uid).done) return reply({ ok: false, error: "Finish your blackjack hand first." }); const stake = stakeOf(m, me, reply); if (!stake) return; const b = m.bet || {}; if (!CASINO.betOk(b)) return reply({ ok: false, error: "Pick a bet." });
      const r = CASINO.roulette(b, stake); settle(me.uid, stake, r.payout); return reply({ ok: true, paid: stake, payout: r.payout, n: r.n, color: r.color, win: r.win, lossHour: Math.max(0, lossInfo(me.uid)) }); }
    if (m.t === "casino.slots") { if (hands.has(me.uid) && !hands.get(me.uid).done) return reply({ ok: false, error: "Finish your blackjack hand first." }); const stake = stakeOf(m, me, reply); if (!stake) return; const r = CASINO.slots(stake); settle(me.uid, stake, r.payout); return reply({ ok: true, paid: stake, payout: r.payout, reels: r.reels, mult: r.mult, lossHour: Math.max(0, lossInfo(me.uid)) }); }
    if (m.t === "casino.bj.start") { const old = hands.get(me.uid); if (old && !old.done && Date.now() - old.at < 300000) return reply({ ok: true, resume: true, paid: 0, view: CASINO.bjView(old) }); const stake = stakeOf(m, me, reply); if (!stake) return; const g = CASINO.bjStart(stake); hands.set(me.uid, g);
      if (g.done) settle(me.uid, stake, g.payout); return reply({ ok: true, paid: stake, view: CASINO.bjView(g), payout: g.done ? g.payout : 0, lossHour: Math.max(0, lossInfo(me.uid)) }); }
    if (m.t === "casino.bj.hit" || m.t === "casino.bj.stand" || m.t === "casino.bj.double") { const g = hands.get(me.uid); if (!g || g.done) return reply({ ok: false, error: "No hand in play." }); let extra = 0;
      if (m.t === "casino.bj.hit") CASINO.bjHit(g); else if (m.t === "casino.bj.stand") CASINO.bjFinish(g); else { if (g.p.length !== 2) return reply({ ok: false, error: "You can only double on your first move." }); if (money(me) < g.stake) return reply({ ok: false, error: "You don't have enough to double." }); extra = g.stake; CASINO.bjDouble(g); }
      if (g.done) settle(me.uid, g.stake * (g.doubled ? 2 : 1), g.payout); return reply({ ok: true, paid: extra, view: CASINO.bjView(g), payout: g.done ? g.payout : 0, lossHour: Math.max(0, lossInfo(me.uid)) }); }
    return reply({ ok: false, error: "Unknown request." });
  }

  // ---------------- the job challenges: the server sets the questions and checks the answers
  const fmt = (n) => "Rs " + n.toLocaleString("en");
  function earnLeft(uid) { const e = db.capital.earn[uid]; return e && e.day === dayKey() ? Math.max(0, JOB_DAY_CAP - e.amt) : JOB_DAY_CAP; }
  function pay(uid, amt, note, from) { const e = db.capital.earn[uid] = db.capital.earn[uid] && db.capital.earn[uid].day === dayKey() ? db.capital.earn[uid] : { day: dayKey(), amt: 0 }; amt = Math.min(amt, earnLeft(uid)); if (amt >= 1) { e.amt += amt; mailTo(uid, amt, note, from); persist(); } return amt; }
  function jobWs(me, m, reply) {
    const cd = (g) => { const k = me.uid + g, t = db.capital.last[k] || 0; return Date.now() - t < JOB_COOLDOWN ? Math.ceil((JOB_COOLDOWN - (Date.now() - t)) / 60000) : 0; };
    if (m.t === "job.start") { const game = String(m.game || ""); if (game !== "banker" && game !== "receveur") return reply({ ok: false, error: "No such job." }); const w = cd(game); if (w) return reply({ ok: false, error: "No more customers for " + w + " min." });
      const qs = [], ans = []; if (game === "banker") for (let i = 0; i < 5; i++) { const a = (rnd(40) + 5) * 10, b = (rnd(40) + 5) * 10, c = rnd(2) ? (rnd(20) + 1) * 10 : 0; qs.push(fmt(a) + " + " + fmt(b) + (c ? " + " + fmt(c) : "") + " = ?"); ans.push(a + b + c); }
      else for (let i = 0; i < 6; i++) { const fare = pick([25, 30, 35, 45, 60, 85]), note = pick([50, 100, 200, 500].filter((x) => x > fare)); qs.push("Fare " + fmt(fare) + ", pays " + fmt(note) + ". Change?"); ans.push(note - fare); }
      const id = crypto.randomBytes(6).toString("hex"); challenges.set(me.uid, { id, game, ans, t0: Date.now() }); db.capital.last[me.uid + game] = Date.now(); return reply({ ok: true, id, game, qs }); }
    if (m.t === "job.answer") { const c = challenges.get(me.uid); if (!c || c.id !== String(m.id) || c.game === "courier") return reply({ ok: false, error: "That job is over." }); challenges.delete(me.uid); const secs = (Date.now() - c.t0) / 1000, given = Array.isArray(m.answers) ? m.answers : []; let right = 0; c.ans.forEach((a, i) => { if (Math.round(Number(given[i])) === a) right++; });
      if (secs < 2.5 * c.ans.length * 0.5) return reply({ ok: true, correct: 0, n: c.ans.length, bonus: 0, secs, note: "Nobody types that fast. No bonus." });
      let bonus = right * (c.game === "banker" ? 60 : 45); if (right >= c.ans.length - 1) bonus += secs < 40 ? 80 : secs < 80 ? 40 : 0; if (secs > 180) bonus = 0; bonus = Math.min(bonus, 450); const got = bonus ? pay(me.uid, bonus, c.game === "banker" ? "Bank bonus" : "Conductor's tips", c.game === "banker" ? "Port Louis bank" : "Victoria terminal") : 0;
      return reply({ ok: true, correct: right, n: c.ans.length, bonus: got, secs: Math.round(secs) }); }
    if (m.t === "job.courier.start") { const pl = PL(), pos = posOf(me), stop = REG.STOPS.portlouis; if (!pl || !pos || Math.hypot(pos.x - stop.x, pos.y - stop.y) > 10) return reply({ ok: false, error: "Collect the parcel at Victoria Urban Terminal." }); const w = cd("courier"); if (w) return reply({ ok: false, error: "No parcels for " + w + " min." });
      const dests = []; const gate = (pl.M.props || []).find((q) => q.k === "gate"); if (gate) dests.push({ name: "Chinatown Friendship Gate", x: gate.x, y: pl.y0 + gate.y + 2 }); for (const [kx, nm] of [["bazar", "Central Market"], ["govt", "Government House"], ["museum", "Blue Penny Museum"]]) { const b = (pl.M.buildings || []).find((q) => q.kindx === kx && (kx !== "bazar" || q.name === "Central Market")); if (b) dests.push({ name: nm, x: b.x + b.w / 2, y: pl.y0 + b.y + b.h + 1 }); } if (!dests.length) return reply({ ok: false, error: "No deliveries today." });
      const d = pick(dests), id = crypto.randomBytes(6).toString("hex"); challenges.set(me.uid, { id, game: "courier", dest: d, t0: Date.now(), from: { x: pos.x, y: pos.y } }); db.capital.last[me.uid + "courier"] = Date.now(); return reply({ ok: true, id, dest: d, limit: COURIER_LIMIT }); }
    if (m.t === "job.courier.done") { const c = challenges.get(me.uid), pos = posOf(me); if (!c || c.id !== String(m.id) || c.game !== "courier") return reply({ ok: false, error: "No delivery in progress." }); const secs = (Date.now() - c.t0) / 1000;
      if (secs > COURIER_LIMIT) { challenges.delete(me.uid); return reply({ ok: false, error: "Too late: the customer left." }); } if (!pos || Math.hypot(pos.x - c.dest.x, pos.y - c.dest.y) > 4) return reply({ ok: false, error: "You are not at " + c.dest.name + " yet." });
      const dist = Math.hypot(c.dest.x - c.from.x, c.dest.y - c.from.y); if (secs < dist / 14) { challenges.delete(me.uid); return reply({ ok: false, error: "That was too fast to be true." }); } challenges.delete(me.uid);
      const fee = 250 + Math.round(150 * Math.max(0, 1 - secs / COURIER_LIMIT)), got = pay(me.uid, fee, "Courier fee: " + c.dest.name, "Victoria terminal"); return reply({ ok: true, fee: got, secs: Math.round(secs) }); }
    return reply({ ok: false, error: "Unknown request." });
  }

  // ---------------- the street market
  const zonesOf = (kinds) => { const pl = PL(); return pl ? (pl.M.zones || []).filter((z) => kinds.includes(z.k)).map((z) => ({ x: z.x, y: pl.y0 + z.y, r: z.r })) : []; };
  const licensedAt = (x, y) => zonesOf(["terminal", "gare"]).some((z) => Math.hypot(x - z.x, y - z.y) <= z.r + 1);
  const view = (st) => ({ uid: st.uid, name: st.name, x: st.x, y: st.y, licensed: st.licensed, goods: Object.keys(st.goods).map((id) => ({ id, stock: st.goods[id].stock, price: st.goods[id].price })) });
  function marketWs(me, m, reply) {
    if (m.t === "market.list") { return reply({ ok: true, goods: GOODS, fee: LICENCE_FEE, stalls: [...stalls.values()].map(view), mine: stalls.has(me.uid) ? view(stalls.get(me.uid)) : null }); }
    const st = stalls.get(me.uid);
    if (m.t === "market.open") { if (st) return reply({ ok: false, error: "Your blanket is already out." }); const pos = posOf(me); if (!pos) return reply({ ok: false, error: "Go outside first." }); const lic = licensedAt(pos.x, pos.y);
      if (lic && money(me) < LICENCE_FEE) return reply({ ok: false, error: "A licensed pitch costs Rs " + LICENCE_FEE + "." }); const s2 = { uid: me.uid, name: nameOf(me.uid), x: pos.x, y: pos.y, licensed: lic, openedAt: Date.now(), goods: {} }; stalls.set(me.uid, s2); return reply({ ok: true, paid: lic ? LICENCE_FEE : 0, licensed: lic, mine: view(s2) }); }
    if (m.t === "market.stock") { if (!st) return reply({ ok: false, error: "Lay out your blanket first." }); const g = GOODS[String(m.good)], qty = Math.floor(Number(m.qty) || 1); if (!g) return reply({ ok: false, error: "No such goods." }); if (!(qty >= 1 && qty <= 10)) return reply({ ok: false, error: "Buy 1 to 10 at a time." });
      const total = Object.values(st.goods).reduce((a, q) => a + q.stock, 0); if (total + qty > MAX_STOCK) return reply({ ok: false, error: "Your blanket only holds " + MAX_STOCK + " things." }); if (money(me) < g.cost * qty) return reply({ ok: false, error: "You need Rs " + (g.cost * qty).toLocaleString("en") + "." });
      const e = st.goods[m.good] = st.goods[m.good] || { stock: 0, price: g.base }; e.stock += qty; return reply({ ok: true, paid: g.cost * qty, mine: view(st) }); }
    if (m.t === "market.price") { if (!st) return reply({ ok: false, error: "Lay out your blanket first." }); const g = GOODS[String(m.good)], e = st.goods[String(m.good)]; if (!g || !e) return reply({ ok: false, error: "You don't have that." }); const p = Math.round(Number(m.price)); if (!(p >= Math.round(g.base * 0.7) && p <= g.base * 2)) return reply({ ok: false, error: "Prices run from Rs " + Math.round(g.base * 0.7) + " to Rs " + g.base * 2 + "." }); e.price = p; return reply({ ok: true, mine: view(st) }); }
    if (m.t === "market.close") { if (!st) return reply({ ok: true, mine: null }); stalls.delete(me.uid); return reply({ ok: true, mine: null, note: "You folded up the blanket." + (Object.values(st.goods).some((q) => q.stock) ? " Unsold goods are gone: the wholesaler does not take returns." : "") }); }
    if (m.t === "market.buy") { const sl = stalls.get(String(m.seller)), g = GOODS[String(m.good)]; if (!sl || !g) return reply({ ok: false, error: "That stall has gone." }); if (sl.uid === me.uid) return reply({ ok: false, error: "That is your own blanket." }); const e = sl.goods[String(m.good)]; if (!e || e.stock < 1) return reply({ ok: false, error: "Sold out." });
      const pos = posOf(me); if (!pos || Math.hypot(pos.x - sl.x, pos.y - sl.y) > 6) return reply({ ok: false, error: "Walk up to the blanket first." }); if (money(me) < e.price) return reply({ ok: false, error: "You need Rs " + e.price + "." });
      e.stock--; const price = e.price, cut = Math.round(price * FEE_RATE); mailTo(sl.uid, price - cut, "Blanket sale: " + g.name, nameOf(me.uid)); persist(); const gone = Object.values(sl.goods).every((q) => q.stock < 1); return reply({ ok: true, paid: price, good: m.good, name: g.name, fx: g.fx, left: e.stock, soldOut: gone }); }
    return reply({ ok: false, error: "Unknown request." });
  }


  // ---------------- discovery: the "new in town" checklist (paid once per town by the server) and the City Pulse (who is where)
  const AREA = { caudan: "Caudan Waterfront", centre: "Place d'Armes", gare: "Immigration Square", chinatown: "Chinatown", terminal: "Victoria Terminal" };
  const LM_PAY = 100, LM_BONUS = 200, LM_RADIUS = 7;
  const TOWN_NAME = { grandbaie: "Grand Baie", portlouis: "Port Louis", west: "Flic en Flac" };
  const lmCache = {};
  function landmarksOf(town) { // three places worth walking to in each town: where they are comes from the town's own map
    if (lmCache[town]) return lmCache[town]; const r = REG.LAYOUT.find((q) => q.id === town); if (!r) return []; const M = r.M, out = [];
    if (town === "portlouis") { for (const k of ["caudan", "centre", "chinatown"]) { const z = (M.zones || []).find((q) => q.k === k); if (z) out.push({ id: k, name: AREA[k], x: z.x, y: r.y0 + z.y }); } }
    else { const pats = town === "grandbaie" ? [/Baza+r|Foire/i, /Shopping Centre|Supermarket|Library/i, /Police|School|Government|Church|Temple/i] : [/Tourist Office|Market/i, /Post Office|Police|Clinic|Library/i, /Hotel|Caf|Pizz|Restaurant/i];
      for (const re of pats) { const b = (M.buildings || []).find((q) => re.test(q.name) && !out.some((o) => o.id === q.name)); if (b) out.push({ id: b.name, name: b.name.replace(/ · .*/, ""), x: b.x + b.w / 2, y: r.y0 + b.y + b.h + 1 }); }
      const st = REG.STOPS[town]; for (const b of [...(M.buildings || [])].sort((a, c) => Math.hypot(c.x - st.x, r.y0 + c.y - st.y) - Math.hypot(a.x - st.x, r.y0 + a.y - st.y))) { if (out.length >= 3) break; if (!out.some((o) => o.id === b.name)) out.push({ id: b.name, name: b.name.replace(/ · .*/, ""), x: b.x + b.w / 2, y: r.y0 + b.y + b.h + 1 }); } }
    return (lmCache[town] = out.slice(0, 3));
  }
  const visitOf = (uid, town) => { const v = (db.capital.visit = db.capital.visit || {}); const u = (v[uid] = v[uid] || {}); return (u[town] = u[town] || { ids: [], bonus: false }); };
  const townOfPeer = (p) => { const rg = p.presence && !p.presence.in ? REG.regionOfPresence(p.presence) : ""; return TOWN_NAME[rg] ? rg : ""; };
  function visitTick() { for (const [, p] of peers) { if (!p.uid || !db.players[p.uid]) continue; const town = townOfPeer(p); if (!town) continue; const lms = landmarksOf(town), v = visitOf(p.uid, town), px = Number(p.presence.x), py = Number(p.presence.y); let changed = false;
      for (const lm of lms) if (!v.ids.includes(lm.id) && Math.hypot(px - lm.x, py - lm.y) <= LM_RADIUS) { v.ids.push(lm.id); changed = true; mailTo(p.uid, LM_PAY, "New in town: " + lm.name, "Mauritius Life"); send(p.ws, { t: "zone", ev: "landmark", town, id: lm.id, name: lm.name, paid: LM_PAY, done: v.ids.length, of: lms.length }); }
      if (changed && v.ids.length >= lms.length && !v.bonus) { v.bonus = true; mailTo(p.uid, LM_BONUS, "New in town: you know " + TOWN_NAME[town], "Mauritius Life"); send(p.ws, { t: "zone", ev: "complete", town, paid: LM_BONUS }); } if (changed) persist(); } }
  function zoneWs(me, m, reply) {
    if (m.t === "zone.state") { const town = String(m.town || regionOf(me)); if (!TOWN_NAME[town]) return reply({ ok: true, town: "", landmarks: [] }); const v = visitOf(me.uid, town); return reply({ ok: true, town, name: TOWN_NAME[town], pay: LM_PAY, bonus: LM_BONUS, bonusPaid: v.bonus, landmarks: landmarksOf(town).map((l) => ({ id: l.id, name: l.name, x: l.x, y: l.y, done: v.ids.includes(l.id) })) }); }
    if (m.t === "zone.pulse") { const towns = Object.keys(TOWN_NAME).map((id) => ({ id, name: TOWN_NAME[id], players: 0, areas: [] })), byId = Object.fromEntries(towns.map((t) => [t.id, t])), pl = PL(); const zs = pl ? (pl.M.zones || []).map((z) => ({ k: z.k, x: z.x, y: pl.y0 + z.y, r: z.r })) : []; for (const z of zs) byId.portlouis.areas.push({ k: z.k, name: AREA[z.k] || z.k, n: 0 }); let road = 0, all = 0;
      for (const [, p] of peers) { if (!p.uid || !db.players[p.uid] || p.away) continue; all++; const rg = p.presence && !p.presence.in ? REG.regionOfPresence(p.presence) : ""; if (byId[rg]) { byId[rg].players++; if (rg === "portlouis") { const px = Number(p.presence.x), py = Number(p.presence.y); zs.forEach((z, i) => { if (Math.hypot(px - z.x, py - z.y) <= z.r + 2) byId.portlouis.areas[i].n++; }); } } else if (String(rg).startsWith("road_")) road++; }
      return reply({ ok: true, online: all, onRoad: road, towns, stalls: stalls.size }); }
    return reply({ ok: false, error: "Unknown request." });
  }
  function handle(ws, me, m) {
    const ns = m.t.split(".")[0], reply = (o) => send(ws, Object.assign({ t: ns, rid: m.rid }, o));
    try { if (ns === "zone") { if (!me.uid || !db.players[me.uid]) return reply({ ok: false, error: "Play a little first." }); if (!allow(me)) return reply({ ok: false, error: "Slow down a little." }); return zoneWs(me, m, reply); } if (!ok(me, reply)) return; if (ns === "casino") return casinoWs(me, m, reply); if (ns === "job") return jobWs(me, m, reply); if (ns === "market") return marketWs(me, m, reply); } catch (e) { reply({ ok: false, error: "Something went wrong." }); }
  }
  function tick() { // every 20 s: close stalls whose owner left or whose time is up, and send the Police Municipale to the wild ones
    const now = Date.now(); for (const [uid, st] of [...stalls]) { const p = peerOf(uid), pos = p && p.presence && !p.presence.in ? { x: Number(p.presence.x), y: Number(p.presence.y) } : null, away = !p || !pos || Math.hypot(pos.x - st.x, pos.y - st.y) > 9 || (p.curRg || (db.where || {})[uid]) !== "portlouis";
      if (away || now - st.openedAt > STALL_LIFE) { stalls.delete(uid); if (p) send(p.ws, { t: "market", ev: "closed", why: away ? "You walked away from your blanket." : "Your pitch time is up." }); continue; }
      if (!st.licensed && now - st.openedAt > RAID_AFTER_T && Math.random() < RAID_CHANCE_T) { stalls.delete(uid); for (const [, q] of peers) send(q.ws, { t: "market", ev: "raid", x: st.x, y: st.y, name: st.name }); if (p) send(p.ws, { t: "market", ev: "raided", why: "The Police Municipale took your blanket and everything on it. A licensed pitch at the terminal or Immigration Square is safe." }); } }
  }
  setInterval(visitTick, TEST ? 400 : 3000).unref();
  return { handle, tick, GOODS, hands, stalls, TEST };
};
