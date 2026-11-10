// Side hustles and notifications, tested like a modified phone would attack them. Run: node test/hustle.test.js
"use strict";
const { spawn } = require("child_process"), fs = require("fs"), os = require("os"), path = require("path"), WebSocket = require("ws");
const REG = require("../regions.js"), NOTIFY = require("../notify.js");
let fails = 0; const ok = (c, msg) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const player = (PORT, name, money, noPres) => new Promise((resolve) => { const ws = new WebSocket(`ws://127.0.0.1:${PORT}`), got = []; let uid = "u_" + Math.random().toString(36).slice(2, 12); ws.on("message", (d) => { try { got.push(JSON.parse(d)); } catch (e) {} });
  const ask = (t, extra) => new Promise((res) => { const rid = "r" + Math.random().toString(36).slice(2, 8), h = (d) => { try { const m = JSON.parse(d); if (m.rid === rid) { ws.off("message", h); res(m); } } catch (e) {} }; ws.on("message", h); ws.send(JSON.stringify(Object.assign({ t, rid }, extra || {}))); });
  ws.on("open", async () => { ws.send(JSON.stringify({ t: "hello", uid })); await wait(400); const w0 = got.find((m) => m.t === "welcome"); if (w0 && w0.uid) uid = w0.uid; ws.send(JSON.stringify({ t: "doc.set", path: "players/" + uid, data: { name, money, savedAt: Date.now() }, rid: "d1" })); await wait(300); ws.send(JSON.stringify({ t: "sub", id: "m1", col: "mail" })); await wait(200); const pl = REG.STOPS.portlouis; if (!noPres) { ws.send(JSON.stringify({ t: "presence", patch: { x: pl.x, y: pl.y, rg: "portlouis" } })); await wait(300); } resolve({ ws, got, ask, get uid() { return uid; } }); }); });
const boot = async (PORT, env) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mlhu-")), srv = spawn(process.execPath, ["server.js"], { cwd: path.join(__dirname, ".."), env: Object.assign({}, process.env, { PORT, PUSH_TEST: "1", HUSTLE_TIME_SCALE: "0.05", DATA_FILE: path.join(dir, "data.json") }, env), stdio: "ignore" }); for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/regions`); break; } catch (e) { await wait(200); } } return { srv, dir }; };
const mails = (p) => p.got.filter((m) => m.t === "snap" || m.col === "mail").length;

(async () => {
  const P1 = 20100 + Math.floor(Math.random() * 400), P2 = P1 + 500, A = await boot(P1, { HUSTLE_FAKE_HOUR: "12" }), B = await boot(P2, { HUSTLE_FAKE_HOUR: "19" });
  try {
    // quiet hours are the same for everyone: none from 23:00 to 07:00 Mauritius time (UTC+4)
    const at = (h) => Date.UTC(2026, 10, 7, h - 4, 30); ok(NOTIFY.quietAt(at(2)) && NOTIFY.quietAt(at(23)) && NOTIFY.quietAt(at(6)) && !NOTIFY.quietAt(at(7)) && !NOTIFY.quietAt(at(12)) && !NOTIFY.quietAt(at(22)), "no notifications between 23:00 and 07:00");
    ok(NOTIFY.DAY_MAX === 2, "at most two notifications a day");

    const p = await player(P1, "Hustler", 5000);
    let r = await p.ask("hustle.state"); ok(r.ok && r.defs.gato && r.defs.fish && r.defs.busk && r.defs.gato.cost === 120, "the server lists the hustles and their prices");
    ok(r.defs.busk.open === false && r.defs.gato.open === true, "at noon the stage busking is closed and the street hustles are open");
    r = await p.ask("hustle.start", { id: "busk" }); ok(!r.ok && /17:00/.test(r.error), "busking is refused before 17:00 (" + r.error + ")");
    r = await p.ask("hustle.start", { id: "nope" }); ok(!r.ok, "an unknown hustle is refused");
    r = await p.ask("hustle.finish", { id: "gato" }); ok(!r.ok, "finishing a hustle that was never started pays nothing");
    r = await p.ask("hustle.start", { id: "gato" }); ok(r.ok && r.paid === 120 && r.secs === 40, "a gato piment round costs Rs 120 and takes 40 seconds");
    const again = await p.ask("hustle.start", { id: "gato" }); ok(again.ok && again.again && again.paid === 0, "asking again during a run gives the same run (safe to repeat, no second charge)");
    r = await p.ask("hustle.finish", { id: "gato" }); ok(!r.ok && /not finished/.test(r.error), "you cannot finish early");
    await wait(2300); r = await p.ask("hustle.finish", { id: "gato" }); ok(r.ok && r.payout >= 260 && r.payout <= 420 && r.left === 7, "after the time the server pays Rs " + r.payout + " and counts the run");
    r = await p.ask("hustle.finish", { id: "gato" }); ok(!r.ok, "a second finish pays nothing");
    r = await p.ask("hustle.start", { id: "gato" }); ok(!r.ok && r.wait > 0, "you must catch your breath between rounds (" + r.error + ")");
    await wait(2400); r = await p.ask("hustle.start", { id: "fish" }); ok(r.ok && r.paid === 60, "fishing costs Rs 60 for bait");
    await wait(2600); r = await p.ask("hustle.finish", { id: "fish" }); ok(r.ok && typeof r.fish === "string" && r.payout >= 10, "the server decides what bites: " + r.fish + " for Rs " + r.payout);

    const poor = await player(P1, "Broke", 30); r = await poor.ask("hustle.start", { id: "gato" }); ok(!r.ok && /Rs 120/.test(r.error), "a player without the stake is refused");
    const gb = await player(P1, "Visitor", 5000, true); r = await gb.ask("hustle.start", { id: "gato" }); ok(!r.ok && /Port Louis/.test(r.error), "hustles belong to Port Louis: a player who is not there is refused (" + r.error + ")");

    // the daily cap: eight rounds and no more
    const q = await player(P1, "Grinder", 90000); let n = 0, last = null; for (let i = 0; i < 10; i++) { const s = await q.ask("hustle.start", { id: "gato" }); if (!s.ok) { last = s; if (s.wait) { await wait(2400); i--; continue; } break; } await wait(2100); const f = await q.ask("hustle.finish", { id: "gato" }); if (f.ok) n++; await wait(2300); } ok(n === 8 && last && /enough/.test(last.error), "at most 8 rounds a day (" + n + ")");

    // busking, at the right hour
    const b = await player(P2, "Singer", 3000); r = await b.ask("hustle.start", { id: "busk" }); ok(r.ok && r.paid === 0, "at 19:00 you can busk for free"); await wait(2400); r = await b.ask("hustle.finish", { id: "busk" }); ok(r.ok && r.payout >= 220 && r.payout <= 640, "the crowd tips Rs " + r.payout);

    // notifications
    const n1 = await player(P1, "Notified", 1000); r = await n1.ask("push.state"); ok(r.ok && r.supported && r.key && r.key.length > 40 && r.devices === 0, "the server has a public key and the player has no device yet");
    r = await n1.ask("push.sub", { sub: { endpoint: "http://bad", keys: {} } }); ok(!r.ok, "a bad subscription is refused");
    const sub = { endpoint: "https://push.example.com/send/abc123", keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } };
    r = await n1.ask("push.sub", { sub }); ok(r.ok && r.devices === 1 && r.on, "a phone can register for notifications");
    r = await n1.ask("push.test"); ok(r.ok && r.sent, "a test notification is sent"); r = await n1.ask("push.test"); ok(!r.ok, "tests cannot be spammed");
    // the daily limit and the player's choices, through the tests-only route
    const send = async (kind, k) => (await fetch(`http://127.0.0.1:${P1}/api/test/push?uid=${n1.uid}&kind=${kind}&n=${k}`).then((x) => x.json())).sent;
    const n3 = await player(P1, "Capped", 1000); await n3.ask("push.sub", { sub: Object.assign({}, sub, { endpoint: sub.endpoint + "3" }) }); const playing = (await fetch(`http://127.0.0.1:${P1}/api/test/push?uid=${n3.uid}&kind=event&n=1`).then((x) => x.json())).sent[0]; ok(playing === false, "nothing is sent to a player who is playing right now");
    n3.ws.close(); await wait(400); const sc = (await fetch(`http://127.0.0.1:${P1}/api/test/push?uid=${n3.uid}&kind=event&n=3`).then((x) => x.json())).sent; ok(sc.filter(Boolean).length === 2, "once they have left, only two of three are sent in a day (" + sc.join(",") + ")");
    let s1;
    r = await n1.ask("push.prefs", { kinds: { friend: false } }); ok(r.ok && r.kinds.friend.on === false && r.kinds.event.on === true, "a player can switch one kind off");
    const n2 = await player(P1, "Quiet", 1000); await n2.ask("push.sub", { sub: Object.assign({}, sub, { endpoint: sub.endpoint + "2" }) }); await n2.ask("push.prefs", { kinds: { friend: false } }); n2.ws.close(); await wait(400);
    s1 = await (await fetch(`http://127.0.0.1:${P1}/api/test/push?uid=${n2.uid}&kind=friend&n=1`)).json(); ok(s1.sent[0] === false, "a switched-off kind is never sent");
    r = { ok: true }; const n2b = await player(P1, "Quiet2", 1000); await n2b.ask("push.sub", { sub: Object.assign({}, sub, { endpoint: sub.endpoint + "4" }) }); await n2b.ask("push.prefs", { on: false }); n2b.ws.close(); await wait(400); const s2 = await (await fetch(`http://127.0.0.1:${P1}/api/test/push?uid=${n2b.uid}&kind=event&n=1`)).json(); ok(s2.sent[0] === false, "switching everything off sends nothing");
    r = await n1.ask("push.unsub", { all: true }); ok(r.ok && r.devices === 0, "a player can remove their devices");
  } finally { A.srv.kill(); B.srv.kill(); await Promise.all([new Promise((r) => A.srv.on("exit", r)), new Promise((r) => B.srv.on("exit", r))]); for (const x of [A, B]) try { fs.rmSync(x.dir, { recursive: true, force: true }); } catch (e) {} }
  console.log(fails ? fails + " FAILED" : "all passed"); process.exit(fails ? 1 : 0);
})();
