// Timed flat upgrades, tested like a modified phone would attack them. Run: node test/flat.test.js
"use strict";
const { spawn } = require("child_process"), fs = require("fs"), os = require("os"), path = require("path"), WebSocket = require("ws");
const REG = require("../regions.js");
let fails = 0; const ok = (c, msg) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const player = (PORT, name, money) => new Promise((resolve) => { const ws = new WebSocket(`ws://127.0.0.1:${PORT}`), got = []; let uid = "u_" + Math.random().toString(36).slice(2, 12); ws.on("message", (d) => { try { got.push(JSON.parse(d)); } catch (e) {} });
  const ask = (t, extra) => new Promise((res) => { const rid = "r" + Math.random().toString(36).slice(2, 8), h = (d) => { try { const m = JSON.parse(d); if (m.rid === rid) { ws.off("message", h); res(m); } } catch (e) {} }; ws.on("message", h); ws.send(JSON.stringify(Object.assign({ t, rid }, extra || {}))); });
  ws.on("open", async () => { ws.send(JSON.stringify({ t: "hello", uid })); await wait(400); const w0 = got.find((m) => m.t === "welcome"); if (w0 && w0.uid) uid = w0.uid; ws.send(JSON.stringify({ t: "doc.set", path: "players/" + uid, data: { name, money, savedAt: Date.now() }, rid: "d1" })); await wait(300); const pl = REG.STOPS.portlouis; ws.send(JSON.stringify({ t: "presence", patch: { x: pl.x, y: pl.y, rg: "portlouis" } })); await wait(300); resolve({ ws, got, ask, get uid() { return uid; } }); }); });
(async () => {
  const PORT = 20700 + Math.floor(Math.random() * 400), dir = fs.mkdtempSync(path.join(os.tmpdir(), "mlflat-")), srv = spawn(process.execPath, ["server.js"], { cwd: path.join(__dirname, ".."), env: Object.assign({}, process.env, { PORT, PUSH_TEST: "1", UPG_TIME_SCALE: "0.01", DATA_FILE: path.join(dir, "data.json") }), stdio: "ignore" });
  try {
    for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/regions`); break; } catch (e) { await wait(200); } }
    const A = await player(PORT, "Builder", 6000), B = await player(PORT, "Friend", 100), C = await player(PORT, "Broke", 50);
    let r = await A.ask("flat.state"); ok(r.ok && r.level === 0 && r.max === 10 && r.next.cost === 300 && r.next.name === "Fresh paint" && r.levels.length === 10 && r.slots === 1 && !r.run, "a new flat is level 0 with ten levels to go, and the first costs Rs 300");
    ok(r.levels[0].secs <= 2 && r.levels[9].lv === 10, "the server lists every level (times are scaled down for this test)");
    r = await C.ask("flat.start"); ok(!r.ok && /Rs 300/.test(r.error), "a player who cannot pay is refused (" + r.error + ")");
    r = await A.ask("flat.start"); ok(r.ok && r.paid === 300 && r.run && r.run.to === 1 && r.run.t1 > r.now, "the upgrade starts and the server charges Rs 300");
    const again = await A.ask("flat.start"); ok(again.ok && again.again && again.paid === 0, "asking again while it runs charges nothing (safe to repeat)");
    r = await A.ask("flat.help", { owner: A.uid }); ok(!r.ok, "you cannot help your own flat");
    r = await B.ask("flat.peek", { owner: A.uid }); ok(r.ok && r.running && r.level === 0 && r.left >= 0, "a friend can see that a flat is being built");
    r = await B.ask("flat.help", { owner: A.uid }); ok(r.ok && r.cut >= 1 && r.thanks === 40, "a friend's help takes time off and earns the helper Rs 40");
    r = await B.ask("flat.help", { owner: A.uid }); ok(!r.ok && /already/.test(r.error), "one help each, per upgrade");
    const n1 = await A.ask("flat.nudge"); ok(n1.ok && n1.saved >= 1 && n1.run.nudges === 1, "a finished shift shaves a little time off");
    r = await A.ask("flat.nudge"); ok(!r.ok && r.wait, "but not faster than one every 45 seconds");
    r = await A.ask("flat.nudge"); r = await C.ask("flat.nudge"); ok(!r.ok, "a player with nothing being built cannot nudge");
    // the notification is scheduled for the moment it is ready
    const sub = { endpoint: "https://push.example.com/send/flat1", keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } };
    await A.ask("push.sub", { sub }); await B.ask("flat.peek", { owner: A.uid });
    const q0 = await (await fetch(`http://127.0.0.1:${PORT}/api/test/push?uid=${A.uid}&n=0`)).json(); ok(Array.isArray(q0.queue), "the test route can list queued notifications");
    await wait(2500); r = await A.ask("flat.state"); ok(r.ok && r.level === 1 && !r.run && r.ready && r.ready.level === 1, "when the time is up the flat is finished: level 1");
    ok(A.got.some((m) => m.t === "flat" && m.ev === "ready" && m.level === 1), "an online player is told straight away");
    r = await A.ask("flat.ack"); r = await A.ask("flat.state"); ok(r.ok && !r.ready, "seeing it clears the 'ready' flag");
    r = await A.ask("flat.start"); ok(r.ok && r.paid === 800 && r.run.to === 2, "level 2 costs Rs 800 and takes longer");
    const q1 = await (await fetch(`http://127.0.0.1:${PORT}/api/test/push?uid=${A.uid}&n=0`)).json(); ok(q1.queue.some((x) => x.tag === "flat" && x.kind === "build"), "a 'your flat is ready' notification is queued for the finishing time");
    // housekeeping: a week of tidy, a bigger comfort bonus
    const s0 = await A.ask("flat.state"); r = await C.ask("flat.upkeep"); ok(r.ok && r.paid === 40, "a level 0 flat costs just Rs 40 to keep tidy");
    r = await C.ask("flat.upkeep"); ok(!r.ok, "and with no money left (Rs 10) a second go is refused either way");
    r = await A.ask("flat.upkeep"); ok(r.ok && r.paid === 40 + 40 * s0.level && r.kept > r.now && r.comfort === Math.round(s0.level * 3 * 1.5), "housekeeping costs Rs 40 plus 40 a level and raises the comfort bonus by half (" + r.comfort + "%)");
    r = await A.ask("flat.upkeep"); ok(!r.ok && /already tidy/.test(r.error), "paying twice in a row is refused (nothing charged)");
    A.ws.close(); await wait(9000);
    r = await B.ask("flat.peek", { owner: A.uid }); ok(r.ok && r.level === 2 && !r.running, "an upgrade that finished while the player was offline is already done when anyone looks (level 2)");
  } finally { srv.kill(); await new Promise((r) => srv.on("exit", r)); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
  console.log(fails ? fails + " FAILED" : "all passed"); process.exit(fails ? 1 : 0);
})();
