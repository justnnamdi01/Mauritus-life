// The Port Louis casino, job challenges and street market, tested like a modified phone would attack them. Run: node test/capital.test.js
// Starts its own server on a spare port with a throwaway save.
"use strict";
const { spawn } = require("child_process"), fs = require("fs"), os = require("os"), path = require("path"), WebSocket = require("ws");
const PORT = 19000 + Math.floor(Math.random() * 900), dir = fs.mkdtempSync(path.join(os.tmpdir(), "mlcap-"));
const CASINO = require("../casino.js"), REG = require("../regions.js");
let fails = 0; const ok = (c, msg) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function player(name, money) {
  return new Promise((resolve) => { const ws = new WebSocket(`ws://127.0.0.1:${PORT}`), got = [], uid0 = "u_" + Math.random().toString(36).slice(2, 12); let uid = uid0; ws.on("message", (d) => { try { got.push(JSON.parse(d)); } catch (e) {} });
    const ask = (t, extra) => new Promise((res) => { const rid = "r" + Math.random().toString(36).slice(2, 8), h = (d) => { try { const m = JSON.parse(d); if (m.rid === rid) { ws.off("message", h); res(m); } } catch (e) {} }; ws.on("message", h); ws.send(JSON.stringify(Object.assign({ t, rid }, extra || {}))); });
    const pres = (patch) => ws.send(JSON.stringify({ t: "presence", patch }));
    ws.on("open", async () => { ws.send(JSON.stringify({ t: "hello", uid })); await wait(400); const w0 = got.find((m) => m.t === "welcome"); if (w0 && w0.uid) uid = w0.uid; ws.send(JSON.stringify({ t: "doc.set", path: "players/" + uid, data: { name, money, savedAt: Date.now() }, rid: "d1" })); await wait(300); ws.send(JSON.stringify({ t: "sub", id: "m1", col: "mail" })); await wait(200); resolve({ ws, got, get uid() { return uid; }, ask, pres }); }); });
}
async function travelToPortLouis(p) { const gb = REG.STOPS.grandbaie, pl = REG.STOPS.portlouis; p.pres({ x: gb.x, y: gb.y, rg: "grandbaie" }); await wait(300); const st = await p.ask("road.start", { to: "portlouis", mode: "taxi" }); await wait(2300); const ar = await p.ask("road.arrive"); p.pres({ x: ar.x || pl.x, y: ar.y || pl.y, rg: "portlouis" }); await wait(400); return st.ok && ar.ok; }

(async () => {
  const srv = spawn(process.execPath, ["server.js"], { cwd: path.join(__dirname, ".."), env: Object.assign({}, process.env, { TRIP_TIME_SCALE: "20", PORT, MARKET_TEST: "1", DATA_FILE: path.join(dir, "data.json") }), stdio: "ignore" });
  try {
    for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/regions`); break; } catch (e) { await wait(200); } }
    // the odds, by exact calculation
    ok(CASINO.slotsRtp() > 0.9 && CASINO.slotsRtp() < 0.97, "slots pay back " + (CASINO.slotsRtp() * 100).toFixed(1) + "% (the house keeps the rest)");
    ok(CASINO.MULT.red * 18 / 37 < 1 && CASINO.MULT.number * 1 / 37 < 1, "roulette favours the house (zero)");
    ok(CASINO.value(["A♠", "K♥"]) === 21 && CASINO.value(["A♠", "A♥", "9♦"]) === 21 && CASINO.value(["10♠", "9♥", "5♦"]) === 24, "blackjack hand values are right");
    const h = []; for (let i = 0; i < 5; i++) h.push([Date.now() - i * 1000, -9000]); ok(CASINO.lossLast(h, Date.now()) === 45000, "losses in the last hour add up (45,000 is over the 30,000 break)");
    ok(CASINO.lossLast([[Date.now() - 4000000, -50000]], Date.now()) === 0, "losses older than an hour no longer count");

    const A = await player("Aria", 50000);
    let r = await A.ask("casino.roulette", { bet: { type: "red" }, stake: 100 }); ok(!r.ok, "the casino is in Port Louis: a player in Grand Baie is refused (" + r.error + ")");
    ok(await travelToPortLouis(A), "Aria takes a taxi to Port Louis");
    r = await A.ask("casino.roulette", { bet: { type: "red" }, stake: 5 }); ok(!r.ok, "a bet under Rs 20 is refused");
    r = await A.ask("casino.roulette", { bet: { type: "red" }, stake: 99999 }); ok(!r.ok, "a bet over Rs 2,000 is refused");
    r = await A.ask("casino.roulette", { bet: { type: "purple" }, stake: 100 }); ok(!r.ok, "a made-up bet is refused");
    r = await A.ask("casino.roulette", { bet: { type: "number", n: 40 }, stake: 100 }); ok(!r.ok, "a number off the wheel is refused");
    let spins = 0, wins = 0, paid = 0, back = 0; for (let i = 0; i < 40; i++) { r = await A.ask("casino.roulette", { bet: { type: "red" }, stake: 50 }); await wait(120); if (!r.ok) { ok(false, "a roulette spin failed: " + r.error); break; } spins++; paid += r.paid; back += r.payout; if (r.win) wins++; if (r.win !== (r.color === "red")) ok(false, "red wins exactly when the pocket is red"); if (r.payout !== (r.win ? 100 : 0)) ok(false, "a red win pays double"); }
    ok(spins === 40 && wins > 5 && wins < 35 && paid === 2000, "40 spins on red: " + wins + " wins (the server decides each one), " + paid + " staked, " + back + " back");
    r = await A.ask("casino.slots", { stake: 100 }); ok(r.ok && r.reels.length === 3 && r.paid === 100 && r.payout === Math.floor(100 * r.mult), "a slot pull comes back with three reels and the right payout");
    await wait(150); r = await A.ask("casino.bj.start", { stake: 100 }); ok(r.ok && r.paid === 100 && r.view.player.length === 2 && r.view.dealer.length === 2, "blackjack deals two cards each");
    if (!r.view.done) { ok(r.view.dealer[1] === "??", "the dealer's second card is hidden while you play"); await wait(150); let q = await A.ask("casino.roulette", { bet: { type: "red" }, stake: 50 }); ok(!q.ok, "no roulette while a blackjack hand is open"); await wait(150); q = await A.ask("casino.bj.stand"); ok(q.ok && q.view.done && (q.payout === 0 || q.payout === 100 || q.payout === 200), "standing finishes the hand with a fair payout (" + q.view.note + ")"); await wait(150); q = await A.ask("casino.bj.hit"); ok(!q.ok, "you cannot hit a finished hand"); }
    else ok(true, "blackjack was settled on the deal: " + r.view.note);
    let doubled = 0; for (let i = 0; i < 12 && !doubled; i++) { await wait(150); const d = await A.ask("casino.bj.start", { stake: 100 }); if (d.view.done) continue; await wait(150); const h2 = await A.ask("casino.bj.hit"); if (h2.view.done) continue; await wait(150); const dd = await A.ask("casino.bj.double"); ok(!dd.ok, "you cannot double after you have hit"); await A.ask("casino.bj.stand"); doubled = 1; }
    await wait(150); const poor = await player("Poor", 30); await travelToPortLouis(poor); r = await poor.ask("casino.slots", { stake: 100 }); ok(!r.ok, "a player who cannot afford the bet is refused");

    // the rules and self-exclusion
    const X = await player("Excl", 50000); await travelToPortLouis(X); let st = await X.ask("casino.state"); ok(st.ok && st.excluded === 0 && Math.abs(st.rtp.slots - CASINO.slotsRtp()) < 1e-9 && st.triples["7️⃣"] === 275, "the rules page gets the real odds from the server");
    r = await X.ask("casino.exclude", { days: 3 }); ok(!r.ok, "only 1, 7 or 30 days can be chosen");
    r = await X.ask("casino.exclude", { days: 7 }); ok(r.ok && r.excluded > Date.now() + 6 * 86400000, "a player can exclude themselves for 7 days");
    await wait(150); r = await X.ask("casino.slots", { stake: 100 }); ok(!r.ok && r.excluded, "while excluded the house refuses slots (" + r.error.slice(0, 40) + "...)");
    await wait(150); r = await X.ask("casino.roulette", { bet: { type: "red" }, stake: 100 }); ok(!r.ok, "and roulette"); await wait(150); r = await X.ask("casino.bj.start", { stake: 100 }); ok(!r.ok, "and blackjack");
    await wait(150); r = await X.ask("casino.exclude", { days: 1 }); ok(r.ok && r.excluded > Date.now() + 6 * 86400000, "exclusion can never be made shorter");
    r = await X.ask("casino.exclude", { days: 30 }); ok(r.ok && r.excluded > Date.now() + 29 * 86400000, "but it can be made longer");

    // discovery: who is where
    const Z = await player("Visitor", 5000); await travelToPortLouis(Z); const pulse0 = await Z.ask("zone.pulse"); ok(pulse0.ok && pulse0.towns.find((q) => q.id === "portlouis").players >= 1 && pulse0.towns.find((q) => q.id === "portlouis").areas.length >= 4, "the pulse counts the players in Port Louis and its areas");
    const zs = await Z.ask("zone.state"); ok(!zs.ok, "there is no checklist any more (nothing is paid for walking around)");

    // the job challenges
    const B = await player("Bank", 5000); await travelToPortLouis(B);
    let c = await B.ask("job.start", { game: "banker" }); ok(c.ok && c.qs.length === 5 && !JSON.stringify(c).includes("ans"), "the banker challenge has 5 sums and no answers");
    const sums = c.qs.map((q) => q.match(/Rs ([\d,]+)/g).map((x) => Number(x.replace(/\D/g, ""))).reduce((a, b) => a + b, 0));
    let w = await B.ask("job.answer", { id: c.id, answers: sums }); ok(w.ok && w.bonus === 0 && w.correct === 0, "answers sent at once get no bonus (nobody types that fast)");
    c = await B.ask("job.start", { game: "banker" }); ok(!c.ok, "a second challenge straight away is refused (a cooldown)");
    const C2 = await player("Clerk", 5000); await travelToPortLouis(C2); c = await C2.ask("job.start", { game: "banker" }); const ans2 = c.qs.map((q) => q.match(/Rs ([\d,]+)/g).map((x) => Number(x.replace(/\D/g, ""))).reduce((a, b) => a + b, 0)); await wait(7000);
    w = await C2.ask("job.answer", { id: c.id, answers: ans2 }); ok(w.ok && w.correct === 5 && w.bonus >= 300, "five right answers pay a bonus (Rs " + w.bonus + ")");
    await wait(400); ok(C2.got.some((m) => JSON.stringify(m).includes("Bank bonus")), "the bonus arrives by mail, paid by the server");
    c = await C2.ask("job.start", { game: "receveur" }); const ans3 = c.qs.map((q) => { const n = q.match(/Rs ([\d,]+)/g).map((x) => Number(x.replace(/\D/g, ""))); return n[1] - n[0]; }); await wait(8000); w = await C2.ask("job.answer", { id: c.id, answers: ans3.map((v, i) => (i === 0 ? v + 5 : v)) }); ok(w.ok && w.correct === 5 && w.bonus > 0 && w.bonus < 400, "five of six fares right pays less (Rs " + w.bonus + ")");
    const D = await player("Courier", 5000); await travelToPortLouis(D); const pl = REG.STOPS.portlouis; D.pres({ x: 5, y: pl.y - 2, rg: "portlouis" }); await wait(300); c = await D.ask("job.courier.start"); ok(!c.ok, "the parcel is collected at the terminal, not from across town");
    D.pres({ x: pl.x, y: pl.y }); await wait(300); c = await D.ask("job.courier.start"); ok(c.ok && c.dest && c.limit === 150, "the courier is given a parcel for " + (c.dest || {}).name);
    w = await D.ask("job.courier.done", { id: c.id }); ok(!w.ok, "claiming a delivery you have not made is refused");
    D.pres({ x: c.dest.x, y: c.dest.y }); await wait(Math.ceil(Math.hypot(c.dest.x - pl.x, c.dest.y - pl.y) / 14 * 1000) + 1200); // the server will not believe a faster trip than 14 tiles a second w = await D.ask("job.courier.done", { id: c.id }); ok(w.ok && w.fee >= 250, "arriving at the address pays the fee (Rs " + w.fee + ")");

    // the street market
    const S = await player("Seller", 9000), Bq = await player("Buyer", 9000); await travelToPortLouis(S); await travelToPortLouis(Bq);
    const wild = { x: 110.5, y: REG.LAYOUT.find((q) => q.id === "portlouis").y0 + 70.5 };
    let m = await S.ask("market.stock", { good: "tea", qty: 2 }); ok(!m.ok, "you cannot stock a blanket you have not laid out");
    S.pres(wild); await wait(300); m = await S.ask("market.open"); ok(m.ok && m.paid === 0 && m.licensed === false, "a blanket on any pavement is free but unlicensed");
    m = await S.ask("market.stock", { good: "tea", qty: 3 }); ok(m.ok && m.paid === 120 && m.mine.goods[0].stock === 3, "three teas cost Rs 120 from the wholesaler");
    m = await S.ask("market.price", { good: "tea", price: 9999 }); ok(!m.ok, "a price above double the fair one is refused");
    m = await S.ask("market.price", { good: "tea", price: 100 }); ok(m.ok, "a fair price is accepted");
    Bq.pres({ x: 5, y: wild.y }); await wait(300); m = await Bq.ask("market.buy", { seller: S.uid, good: "tea" }); ok(!m.ok, "a buyer across town cannot buy");
    Bq.pres({ x: wild.x + 2, y: wild.y }); await wait(300); m = await Bq.ask("market.list"); ok(m.ok && m.stalls.length === 1 && m.stalls[0].goods[0].price === 100, "the buyer sees one blanket");
    m = await Bq.ask("market.buy", { seller: S.uid, good: "tea" }); ok(m.ok && m.paid === 100 && m.fx && m.left === 2, "buying a tea costs Rs 100 and has an effect");
    await wait(400); ok(S.got.some((x) => JSON.stringify(x).includes("Blanket sale") && JSON.stringify(x).includes('"amt":94')), "the seller is paid Rs 94 by mail: the price minus the market's 6%");
    m = await S.ask("market.buy", { seller: S.uid, good: "tea" }); ok(!m.ok, "you cannot buy from your own blanket");
    await wait(2500); ok(S.got.some((x) => x.t === "market" && x.ev === "raided"), "the Police Municipale raid an unlicensed blanket (stock gone)");
    m = await Bq.ask("market.buy", { seller: S.uid, good: "tea" }); ok(!m.ok, "after the raid nobody can buy from it");
    const pl2 = REG.STOPS.portlouis; S.pres({ x: pl2.x, y: pl2.y }); await wait(300); m = await S.ask("market.open"); ok(m.ok && m.paid === 150 && m.licensed === true, "a pitch at the terminal is licensed and costs Rs 150");
    await wait(2500); ok(!S.got.some((x) => x.t === "market" && x.ev === "raided" && x !== S.got.find((y) => y.t === "market" && y.ev === "raided")), "a licensed blanket is never raided");
  } finally { srv.kill(); }
  console.log(fails ? fails + " FAILED" : "all passed"); process.exit(fails ? 1 : 0);
})();
